import type { Env } from "./index";
import { addDays, stockholmDay } from "./stats";
import { ApiError, body, checkFields, fail, json, text } from "./http";
import { stationV2Api } from "./station-v2";
import { getWeather } from "./weather";

const STATION = "tingsryd";
const MAX_ORE = 10_000_000_000;
type SaleRow = {
  business_date: string;
  net_sales_ore: number;
  source: string;
  revision: number;
  created_at: string;
  updated_at: string;
  actor: string;
};
const hash = async (value: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const randomHex = (bytes: number) =>
  [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const validDate = (day: unknown): day is string =>
  typeof day === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(day) &&
  !Number.isNaN(Date.parse(`${day}T12:00:00Z`)) &&
  new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;
const validOre = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= MAX_ORE;
const viewerCookie = (request: Request, token: string, age: number) =>
  `station_view=${token}; Path=/api/station; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
async function viewer(request: Request, env: Env) {
  const token = request.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)station_view=([a-f0-9]{64})/)?.[1];
  if (!token) fail(401, "Aktivera visning för den här enheten.");
  const row = await env.DB.prepare(
    "SELECT token_hash FROM station_view_sessions WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?",
  )
    .bind(await hash(token!), new Date().toISOString())
    .first();
  if (!row)
    fail(401, "Visningsbehörigheten har gått ut. Aktivera enheten igen.");
}
export function comparisonDay(day: string) {
  return addDays(day, -364);
}
export function change(current: number, previous: number | null) {
  if (previous === null) return { difference_ore: null, percent: null };
  return {
    difference_ore: current - previous,
    percent: previous > 0 ? ((current - previous) / previous) * 100 : null,
  };
}

export async function stationApi(
  request: Request,
  env: Env,
  requireAdmin: (request: Request, env: Env) => Promise<void>,
): Promise<Response | null> {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  if (
    !path.startsWith("/api/station/") &&
    !path.startsWith("/api/admin/station/")
  )
    return null;
  if (path.startsWith("/api/admin/station/")) await requireAdmin(request, env);
  const viewerOrAdmin = async (req: Request, configuration: Env) => {
    try {
      await viewer(req, configuration);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      await requireAdmin(req, configuration);
    }
  };
  if (path === "/api/station/weather" && method === "GET") {
    await viewerOrAdmin(request, env);
    try {
      return json(await getWeather(new Date(), fetch, undefined, request.url), 200, {
        "Cache-Control": "no-store",
      });
    } catch {
      return json({ error: "Väderprognosen är tillfälligt otillgänglig." }, 503, {
        "Cache-Control": "no-store",
      });
    }
  }
  if (
    path.startsWith("/api/station/v2") ||
    path.startsWith("/api/admin/station/v2")
  )
    return stationV2Api(request, env, viewerOrAdmin, requireAdmin);
  if (path === "/api/station/activate" && method === "POST") {
    const data = await body(request);
    checkFields(data, ["code"]);
    if (typeof data.code !== "string" || !/^[a-f0-9]{16}$/.test(data.code))
      fail(400, "Ogiltig aktiveringskod.");
    const now = new Date().toISOString(),
      token = randomHex(32);
    const codeHash = await hash(data.code as string);
    const result = await env.DB.prepare(
      "UPDATE station_activation_codes SET consumed_at=? WHERE code_hash=? AND consumed_at IS NULL AND expires_at>?",
    )
      .bind(now, codeHash, now)
      .run();
    if (result.meta.changes !== 1)
      fail(401, "Koden är ogiltig eller har gått ut.");
    const code = await env.DB.prepare(
      "SELECT device_label FROM station_activation_codes WHERE code_hash=?",
    )
      .bind(codeHash)
      .first<{ device_label: string }>();
    await env.DB.prepare(
      "INSERT INTO station_view_sessions(token_hash,device_label,created_at,expires_at) VALUES(?,?,?,?)",
    )
      .bind(
        await hash(token),
        code!.device_label,
        now,
        new Date(Date.now() + 30 * 86400000).toISOString(),
      )
      .run();
    return json({ ok: true }, 200, {
      "Set-Cookie": viewerCookie(request, token, 30 * 86400),
    });
  }
  if (path === "/api/station/logout" && method === "POST") {
    const token = request.headers
      .get("Cookie")
      ?.match(/(?:^|;\s*)station_view=([a-f0-9]{64})/)?.[1];
    if (token)
      await env.DB.prepare(
        "UPDATE station_view_sessions SET revoked_at=? WHERE token_hash=?",
      )
        .bind(new Date().toISOString(), await hash(token))
        .run();
    return json({ ok: true }, 200, {
      "Set-Cookie": viewerCookie(request, "", 0),
    });
  }
  if (path === "/api/station/dashboard" && method === "GET") {
    await viewer(request, env);
    const day = addDays(stockholmDay(), -1),
      previousDay = comparisonDay(day);
    const weekStart = addDays(day, -6);
    const rows = await env.DB.prepare(
      "SELECT business_date,net_sales_ore,updated_at FROM station_store_daily_sales WHERE station_id=? AND (business_date BETWEEN ? AND ? OR business_date=?)",
    )
      .bind(STATION, weekStart, day, previousDay)
      .all<{ business_date: string; net_sales_ore: number; updated_at: string }>();
    const current =
      rows.results.find((r) => r.business_date === day)?.net_sales_ore ?? null;
    const previous =
      rows.results.find((r) => r.business_date === previousDay)
        ?.net_sales_ore ?? null;
    return json({
      business_date: day,
      comparison_date: previousDay,
      net_sales_ore: current,
      comparison_sales_ore: previous,
      updated_at: rows.results.find((r) => r.business_date === day)?.updated_at ?? null,
      week: Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekStart, i);
        return { date, net_sales_ore: rows.results.find((r) => r.business_date === date)?.net_sales_ore ?? null };
      }),
      ...(current === null
        ? { difference_ore: null, percent: null }
        : change(current, previous)),
    });
  }
  if (path === "/api/admin/station/store-sales" && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT business_date,net_sales_ore,source,revision,created_at,updated_at,actor FROM station_store_daily_sales WHERE station_id=? ORDER BY business_date DESC LIMIT 5000",
    )
      .bind(STATION)
      .all<SaleRow>();
    return json({ yesterday: addDays(stockholmDay(), -1), rows: rows.results });
  }
  const dayRoute = path.match(
    /^\/api\/admin\/station\/store-sales\/(\d{4}-\d{2}-\d{2})(?:\/audit)?$/,
  );
  if (dayRoute) {
    const day = dayRoute[1];
    if (!validDate(day)) fail(400, "Ogiltigt datum.");
    if (path.endsWith("/audit") && method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT action,actor,old_net_sales_ore,new_net_sales_ore,reason,changed_at FROM station_store_sales_audit WHERE station_id=? AND business_date=? ORDER BY id DESC LIMIT 100",
      )
        .bind(STATION, day)
        .all();
      return json(rows.results);
    }
    if (method === "PUT" && !path.endsWith("/audit")) {
      if (day > addDays(stockholmDay(), -1))
        fail(400, "Framtida eller pågående dag kan inte registreras.");
      const data = await body(request);
      checkFields(data, ["net_sales_ore", "expected_revision", "reason"]);
      if (!validOre(data.net_sales_ore))
        fail(400, "Beloppet måste anges i hela ören.");
      const expected = data.expected_revision;
      if (
        expected !== null &&
        (!Number.isSafeInteger(expected) || (expected as number) < 0)
      )
        fail(400, "Ogiltig version.");
      const now = new Date().toISOString();
      if (expected === null) {
        const result = await env.DB.prepare(
          "INSERT OR IGNORE INTO station_store_daily_sales(station_id,business_date,net_sales_ore,source,revision,created_at,updated_at,actor) VALUES(?,?,?,'manual',0,?,?,'ADMIN')",
        )
          .bind(STATION, day, data.net_sales_ore as number, now, now)
          .run();
        if (result.meta.changes !== 1)
          fail(409, "Datumet har redan registrerats. Uppdatera listan.");
      } else {
        const reason = text(data.reason, "Rättningsorsak", 200);
        if (reason.length < 3) fail(400, "Ange en kort rättningsorsak.");
        const result = await env.DB.prepare(
          "UPDATE station_store_daily_sales SET net_sales_ore=?,revision=revision+1,updated_at=?,actor='ADMIN',correction_reason=? WHERE station_id=? AND business_date=? AND revision=? AND net_sales_ore<>?",
        )
          .bind(
            data.net_sales_ore as number,
            now,
            reason,
            STATION,
            day,
            expected as number,
            data.net_sales_ore as number,
          )
          .run();
        if (result.meta.changes !== 1)
          fail(
            409,
            "Värdet har ändrats eller är redan detsamma. Uppdatera listan.",
          );
      }
      return json(
        await env.DB.prepare(
          "SELECT business_date,net_sales_ore,revision,updated_at FROM station_store_daily_sales WHERE station_id=? AND business_date=?",
        )
          .bind(STATION, day)
          .first(),
      );
    }
  }
  if (path === "/api/admin/station/activation-codes" && method === "POST") {
    const data = await body(request);
    checkFields(data, ["device_label"]);
    const label = text(data.device_label, "Enhetsnamn", 60);
    const code = randomHex(8),
      now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO station_activation_codes(code_hash,device_label,created_at,expires_at) VALUES(?,?,?,?)",
    )
      .bind(
        await hash(code),
        label,
        now,
        new Date(Date.now() + 10 * 60000).toISOString(),
      )
      .run();
    return json({
      code,
      expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
    });
  }
  if (path === "/api/admin/station/view-sessions" && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT token_hash,device_label,created_at,expires_at,revoked_at FROM station_view_sessions ORDER BY created_at DESC LIMIT 100",
    ).all<{
      token_hash: string;
      device_label: string;
      created_at: string;
      expires_at: string;
      revoked_at: string | null;
    }>();
    return json(
      rows.results.map(({ token_hash, ...row }) => ({
        ...row,
        id: token_hash,
      })),
    );
  }
  const revoke = path.match(
    /^\/api\/admin\/station\/view-sessions\/([a-f0-9]{64})$/,
  );
  if (revoke && method === "DELETE") {
    await env.DB.prepare(
      "UPDATE station_view_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL",
    )
      .bind(new Date().toISOString(), revoke[1])
      .run();
    return json({ ok: true });
  }
  return fail(404, "Sidan eller anropet finns inte.");
}
