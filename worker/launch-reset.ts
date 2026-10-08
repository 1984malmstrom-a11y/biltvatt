import type { Env } from "./index";
import { body, checkFields, fail, integer, json } from "./http";

export const LAUNCH_LOCK_KEY = "station_v2_launch_lock";
export const LAUNCH_PROGRAMS_KEY = "station_v2_launch_programs";
export const LAUNCH_RESET_KEY = "station_v2_zero_reset_done";

export async function launchLocked(env: Env): Promise<boolean> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key=?")
    .bind(LAUNCH_LOCK_KEY).first<{ value: string }>();
  return row?.value === "1";
}

export async function launchResetApi(request: Request, env: Env): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/admin/launch/")) return null;
  if (path === "/api/admin/launch/status" && request.method === "GET") {
    const values = await env.DB.prepare(
      "SELECT key,value FROM settings WHERE key IN (?,?)",
    ).bind(LAUNCH_LOCK_KEY, LAUNCH_RESET_KEY)
      .all<{ key: string; value: string }>();
    const state = Object.fromEntries(values.results.map((r) => [r.key, r.value]));
    const sales = await env.DB.prepare("SELECT COUNT(*) AS n FROM sales")
      .first<{ n: number }>();
    return json({ locked: state[LAUNCH_LOCK_KEY] === "1",
      reset_done: !!state[LAUNCH_RESET_KEY], sales_count: sales?.n ?? 0 });
  }
  if (path !== "/api/admin/launch/reset-wash" || request.method !== "POST")
    return fail(404, "Sidan eller anropet finns inte.");

  const data = await body(request);
  checkFields(data, ["confirmation", "backup_sha256", "expected_sales_count"]);
  if (data.confirmation !== "NOLLSTÄLL TVÄTTLIGAN")
    return fail(400, "Bekräfta nollställningen separat.");
  const count = integer(data.expected_sales_count, "Antal försäljningar", 100000000);
  if (typeof data.backup_sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(data.backup_sha256))
    return fail(400, "Verifierad privat backup krävs.");

  // The launcher deactivates every program before taking its final private
  // backup. V1 already checks program.active in its INSERT, so this also blocks
  // old Worker instances while V2 propagates through Cloudflare.
  const token = crypto.randomUUID();
  const marker = JSON.stringify({ backup_sha256: data.backup_sha256.toUpperCase(),
    sales_count: count, reset_at: new Date().toISOString(), id: token });
  const hasLock = "EXISTS(SELECT 1 FROM settings WHERE key=? AND value='1')";
  const hasMarker = "EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?)";
  const result = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO settings(key,value,updated_at) SELECT ?,?,? WHERE ${hasLock}
       AND NOT EXISTS(SELECT 1 FROM settings WHERE key=?)
       AND NOT EXISTS(SELECT 1 FROM wash_programs WHERE active=1)
       AND (SELECT COUNT(*) FROM sales)=?`,
    ).bind(LAUNCH_RESET_KEY, marker, new Date().toISOString(), LAUNCH_LOCK_KEY,
      LAUNCH_RESET_KEY, count),
    env.DB.prepare(`DELETE FROM maintenance_preview_sales WHERE ${hasMarker}`)
      .bind(LAUNCH_RESET_KEY, marker),
    env.DB.prepare(`DELETE FROM reset_batches WHERE ${hasMarker}`)
      .bind(LAUNCH_RESET_KEY, marker),
    env.DB.prepare(`DELETE FROM maintenance_previews WHERE ${hasMarker}`)
      .bind(LAUNCH_RESET_KEY, marker),
    env.DB.prepare(`DELETE FROM sales_audit WHERE ${hasMarker}`)
      .bind(LAUNCH_RESET_KEY, marker),
    env.DB.prepare(`DELETE FROM notification_events WHERE event_type IN ('daily_goal_close','daily_goal_reached') AND ${hasMarker}`)
      .bind(LAUNCH_RESET_KEY, marker),
    env.DB.prepare(`DELETE FROM sales WHERE ${hasMarker}`)
      .bind(LAUNCH_RESET_KEY, marker),
  ]);
  if (result[0].meta.changes !== 1)
    return fail(409, "Lanseringsspärr, backupantal eller engångsstatus stämmer inte.");
  if (result[6].meta.changes !== count)
    return fail(500, "Nollställningen behöver kontrolleras innan spärren hävs.");
  return json({ ok: true, deleted_sales: count, reset_id: token });
}
