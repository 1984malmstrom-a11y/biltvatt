import {
  addDays,
  dateRange,
  midnightUTC,
  stockholmDay,
  summarize,
  type StatsRow,
} from "./stats";
import type { Sale, Staff, WashProgram } from "../src/types";
import { maintenance } from "./maintenance";
import { stationApi } from "./station";
import { ApiError, body, checkFields, fail, integer, json, text } from "./http";
import {
  configuredKeys,
  deliverSaleEvents,
  goalEventStatement,
  pushApi,
} from "./notifications";

export interface Env {
  DB: D1Database;
  ADMIN_PIN?: string;
  ASSETS?: Fetcher;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}
const hash = async (text: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
function active(value: unknown): number {
  if (value !== 0 && value !== 1)
    return fail(400, "Aktiv måste vara 0 eller 1.");
  return value;
}
function color(value: unknown): string {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value))
    return fail(400, "Välj en giltig färg.");
  return value;
}
export async function requireAdmin(request: Request, env: Env) {
  const token = request.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)tvattligan_session=([a-f0-9-]+)/)?.[1];
  if (!token) return fail(401, "Logga in som administratör.");
  const session = await env.DB.prepare(
    "SELECT token_hash FROM admin_sessions WHERE token_hash = ? AND expires_at > ?",
  )
    .bind(await hash(token), new Date().toISOString())
    .first();
  if (!session) fail(401, "Din session har gått ut. Logga in igen.");
}
const cookie = (request: Request, token: string, age: number) =>
  `tvattligan_session=${token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
const saleQuery =
  "SELECT s.*, p.name AS program_name, t.name AS staff_name, t.color AS staff_color FROM sales s JOIN staff t ON s.staff_id=t.id JOIN wash_programs p ON s.wash_program_id=p.id";

async function api(
  request: Request,
  env: Env,
  context?: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  if (!["GET", "HEAD"].includes(method)) {
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin)
      fail(403, "Anrop från en annan webbplats är inte tillåtet.");
    if (request.headers.get("Sec-Fetch-Site") === "cross-site")
      fail(403, "Anrop från en annan webbplats är inte tillåtet.");
  }
  const now = new Date().toISOString();
  if (path.startsWith("/api/station/") || path.startsWith("/api/admin/station/")) {
    const response = await stationApi(request, env, requireAdmin);
    if (response) return response;
  }
  if (path === "/api/admin/login" && method === "POST") {
    if (!env.ADMIN_PIN || !/^\d{6,12}$/.test(env.ADMIN_PIN))
      fail(503, "Administratörs-PIN är inte konfigurerad på servern.");
    const data = await body(request);
    checkFields(data, ["pin"]);
    const ip = await hash(request.headers.get("CF-Connecting-IP") ?? "local");
    await env.DB.prepare("DELETE FROM login_attempts WHERE window_start < ?")
      .bind(new Date(Date.now() - 15 * 60000).toISOString())
      .run();
    // Atomic increment also prevents concurrent requests from bypassing the limit.
    const attempt = await env.DB.prepare(
      "INSERT INTO login_attempts(ip_hash, attempts, window_start) VALUES(?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET attempts=attempts+1 RETURNING attempts",
    )
      .bind(ip, now)
      .first<{ attempts: number }>();
    if ((attempt?.attempts ?? 6) > 5)
      fail(429, "För många inloggningsförsök. Försök igen om 15 minuter.");
    if (
      typeof data.pin !== "string" ||
      data.pin.length > 12 ||
      (await hash(data.pin)) !== (await hash(env.ADMIN_PIN!))
    )
      fail(401, "Fel PIN. Försök igen.");
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM login_attempts WHERE ip_hash=?").bind(ip),
      env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(
        now,
      ),
      env.DB.prepare(
        "INSERT INTO admin_sessions(token_hash,expires_at) VALUES(?,?)",
      ).bind(
        await hash(token),
        new Date(Date.now() + 8 * 3600000).toISOString(),
      ),
    ]);
    return json({ ok: true }, 200, {
      "Set-Cookie": cookie(request, token, 8 * 3600),
    });
  }
  if (path.startsWith("/api/admin/")) await requireAdmin(request, env);
  if (
    path.startsWith("/api/push/") ||
    path.startsWith("/api/admin/notifications")
  ) {
    const response = await pushApi(request, env);
    if (response) return response;
  }
  if (path.startsWith("/api/admin/")) {
    const response = await maintenance(request, env);
    if (response) return response;
  }
  if (path === "/api/admin/logout" && method === "POST") {
    const token = request.headers
      .get("Cookie")!
      .match(/tvattligan_session=([a-f0-9-]+)/)![1];
    await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash=?")
      .bind(await hash(token))
      .run();
    return json({ ok: true }, 200, { "Set-Cookie": cookie(request, "", 0) });
  }
  if (
    (path === "/api/staff" || path === "/api/wash-programs") &&
    method === "GET"
  ) {
    const all = url.searchParams.get("all") === "1";
    if (all) await requireAdmin(request, env);
    const isStaff = path === "/api/staff";
    const rows = await env.DB.prepare(
      `SELECT ${isStaff ? "id,name,color,active,deleted_at" : "id,name,price_sek,sort_order,active"} FROM ${isStaff ? "staff" : "wash_programs"} ${all ? "" : `WHERE active=1 ${isStaff ? "AND deleted_at IS NULL" : ""}`} ORDER BY ${isStaff ? "created_at,rowid" : "sort_order,id"}`,
    ).all();
    return json(rows.results);
  }
  if (path === "/api/sales" && method === "POST") {
    const data = await body(request);
    checkFields(data, ["staff_id", "wash_program_id", "request_id"]);
    const staffId = text(data.staff_id, "Säljare"),
      programId = text(data.wash_program_id, "Tvättprogram"),
      requestId = text(data.request_id, "Begärande-ID", 36);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        requestId,
      )
    )
      fail(400, "Begärande-ID måste vara ett UUID.");
    const id = crypto.randomUUID();
    // The request ID doubles as a private undo receipt. Only a hash is returned in database exports.
    const undoHash = await hash(requestId);
    const insert = env.DB.prepare(
      "INSERT OR IGNORE INTO sales(id,staff_id,wash_program_id,price_sek,sold_at,created_at,request_id,undo_token_hash) SELECT ?,t.id,p.id,p.price_sek,?,?,?,? FROM staff t CROSS JOIN wash_programs p WHERE t.id=? AND p.id=? AND t.active=1 AND t.deleted_at IS NULL AND p.active=1",
    ).bind(id, now, now, requestId, undoHash, staffId, programId);
    let queuedNotification = false;
    if (configuredKeys(env)) {
      const results = await env.DB.batch([
        insert,
        goalEventStatement(env, id, now),
      ]);
      queuedNotification = results[1].meta.changes > 0;
    } else await insert.run();
    const sale = await env.DB.prepare(
      "SELECT id,staff_id,wash_program_id,price_sek,sold_at,voided_at,request_id FROM sales WHERE request_id=?",
    )
      .bind(requestId)
      .first<Sale>();
    if (!sale)
      fail(
        400,
        "Säljaren eller tvättprogrammet är inte aktivt. Uppdatera sidan.",
      );
    if (sale!.staff_id !== staffId || sale!.wash_program_id !== programId)
      fail(409, "Begärande-ID har redan använts för en annan försäljning.");
    if (sale!.id === id && context && queuedNotification) {
      try {
        context.waitUntil(
          deliverSaleEvents(env, id).catch(() => {
            console.warn("En bakgrundsnotis kunde inte slutföras.");
          }),
        );
      } catch {
        /* A background notification must never fail a committed sale. */
      }
    }
    return json(sale, sale!.id === id ? 201 : 200);
  }
  const undo = path.match(/^\/api\/sales\/([^/]+)\/void$/);
  if (undo && method === "POST") {
    const data = await body(request);
    checkFields(data, ["request_id"]);
    const receipt = text(data.request_id, "Kvitto", 36);
    const sale = await env.DB.prepare(
      "SELECT undo_token_hash FROM sales WHERE id=?",
    )
      .bind(undo[1])
      .first<{ undo_token_hash: string }>();
    if (!sale) fail(404, "Försäljningen finns inte.");
    if (sale!.undo_token_hash !== (await hash(receipt)))
      fail(403, "Du kan bara ångra din egen registrering.");
    await env.DB.prepare(
      "UPDATE sales SET voided_at=?,void_reason='SELLER_UNDO',voided_by='SELLER',updated_by='SELLER',updated_at=?,revision=revision+1 WHERE id=? AND voided_at IS NULL",
    )
      .bind(now, now, undo[1])
      .run();
    return json({ ok: true });
  }
  if (
    (path === "/api/stats" || /^\/api\/stats\/staff\/[^/]+$/.test(path)) &&
    method === "GET"
  ) {
    let range;
    try {
      range = dateRange(url);
    } catch (e) {
      return fail(400, (e as Error).message);
    }
    const staffId = path.startsWith("/api/stats/staff/")
      ? decodeURIComponent(path.slice("/api/stats/staff/".length))
      : null;
    if (
      staffId &&
      !(await env.DB.prepare(
        "SELECT id FROM staff WHERE id=? AND deleted_at IS NULL",
      )
        .bind(staffId)
        .first())
    )
      fail(404, "Säljaren finns inte.");
    const rows = await env.DB.prepare(
      `${saleQuery} WHERE s.sold_at>=? AND s.sold_at<? AND s.voided_at IS NULL AND t.deleted_at IS NULL ${staffId ? "AND s.staff_id=?" : ""}`,
    )
      .bind(range.from, range.to, ...(staffId ? [staffId] : []))
      .all<StatsRow>();
    const settings = await env.DB.prepare(
      "SELECT key,value FROM settings",
    ).all<{ key: string; value: string }>();
    const values = Object.fromEntries(
      settings.results.map((x) => [x.key, Number(x.value)]),
    );
    const today = stockholmDay(),
      monthStart = `${today.slice(0, 7)}-01`;
    const nextMonth = new Date(`${monthStart}T12:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const counts = await env.DB.prepare(
      "SELECT SUM(CASE WHEN sold_at>=? AND sold_at<? THEN 1 ELSE 0 END) AS daily, COUNT(*) AS monthly FROM sales JOIN staff ON staff.id=sales.staff_id WHERE voided_at IS NULL AND staff.deleted_at IS NULL AND sold_at>=? AND sold_at<?",
    )
      .bind(
        midnightUTC(today),
        midnightUTC(addDays(today, 1)),
        midnightUTC(monthStart),
        midnightUTC(nextMonth.toISOString().slice(0, 10)),
      )
      .first<{ daily: number; monthly: number }>();
    return json({
      ...summarize(rows.results),
      range: { start: range.start, end: range.end },
      goals: {
        daily: values.daily_goal ?? 25,
        monthly: values.monthly_goal ?? 500,
        dailyCount: counts?.daily ?? 0,
        monthlyCount: counts?.monthly ?? 0,
      },
    });
  }
  if (path === "/api/admin/staff" && method === "POST") {
    const data = await body(request);
    checkFields(data, ["name", "color"]);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO staff(id,name,color,created_at) VALUES(?,?,?,?)",
    )
      .bind(id, text(data.name, "Namn", 40), color(data.color), now)
      .run();
    return json({ id }, 201);
  }
  const staffPatch = path.match(/^\/api\/admin\/staff\/([^/]+)$/);
  const programPatch = path.match(/^\/api\/admin\/wash-programs\/([^/]+)$/);
  if ((staffPatch || programPatch) && method === "PATCH") {
    const data = await body(request);
    const isStaff = !!staffPatch,
      id = (staffPatch ?? programPatch)![1];
    checkFields(
      data,
      isStaff
        ? ["name", "color", "active"]
        : ["price_sek", "sort_order", "active"],
    );
    const validated: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(data))
      validated[key] =
        key === "name"
          ? text(value, "Namn", 40)
          : key === "color"
            ? color(value)
            : key === "active"
              ? active(value)
              : integer(
                  value,
                  key === "price_sek" ? "Pris" : "Sortering",
                  key === "price_sek" ? 10000 : 100,
                );
    if (!isStaff) validated.updated_at = now;
    const result = await env.DB.prepare(
      `UPDATE ${isStaff ? "staff" : "wash_programs"} SET ${Object.keys(
        validated,
      )
        .map((k) => `${k}=?`)
        .join(",")} WHERE id=? ${isStaff ? "AND deleted_at IS NULL" : ""}`,
    )
      .bind(...Object.values(validated), id)
      .run();
    if (!result.meta.changes) fail(404, "Posten finns inte.");
    return json({ ok: true });
  }
  if (path === "/api/admin/settings" && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT key,value FROM settings WHERE key IN('daily_goal','monthly_goal')",
    ).all<{
      key: string;
      value: string;
    }>();
    return json(
      Object.fromEntries(rows.results.map((r) => [r.key, Number(r.value)])),
    );
  }
  if (path === "/api/admin/settings" && method === "PUT") {
    const data = await body(request);
    checkFields(data, ["daily_goal", "monthly_goal"]);
    await env.DB.batch(
      Object.entries(data).map(([key, value]) =>
        env.DB.prepare(
          "INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
        ).bind(key, String(integer(value, "Mål")), now),
      ),
    );
    return json({ ok: true });
  }
  if (path === "/api/admin/export" && method === "GET") {
    let range;
    try {
      range = dateRange(url);
    } catch (e) {
      return fail(400, (e as Error).message);
    }
    const rows = await env.DB.prepare(
      `${saleQuery} WHERE s.sold_at>=? AND s.sold_at<? ORDER BY s.sold_at,s.id`,
    )
      .bind(range.from, range.to)
      .all<StatsRow>();
    // Neutralize spreadsheet formulas in names as well as quote delimiters and line breaks.
    const cell = (v: string | number) =>
      `"${String(v)
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""')}"`;
    const lines = [
      "Datum;Tid;Säljare;Tvättprogram;Pris;Status",
      ...rows.results.map((row) =>
        [
          stockholmDay(new Date(row.sold_at)),
          new Intl.DateTimeFormat("sv-SE", {
            timeZone: "Europe/Stockholm",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }).format(new Date(row.sold_at)),
          row.staff_name,
          row.program_name,
          row.price_sek,
          row.voided_at ? "Makulerad" : "Registrerad",
        ]
          .map(cell)
          .join(";"),
      ),
    ];
    return new Response("\uFEFF" + lines.join("\r\n") + "\r\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tvattligan-${range.start}-${range.end}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return fail(404, "Sidan eller anropet finns inte.");
}

export default {
  async fetch(
    request: Request,
    env: Env,
    context?: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    let response: Response;
    try {
      response = url.pathname.startsWith("/api/")
        ? await api(request, env, context)
        : env.ASSETS
          ? await env.ASSETS.fetch(request)
          : json({ error: "Sidan finns inte." }, 404);
    } catch (error) {
      if (!(error instanceof ApiError))
        console.error(
          "API error:",
          error instanceof Error ? error.message : "unknown",
        );
      response = json(
        {
          error:
            error instanceof ApiError
              ? error.message
              : "Ett serverfel uppstod. Försök igen.",
        },
        error instanceof ApiError ? error.status : 500,
      );
    }
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "same-origin");
    headers.set("X-Frame-Options", "DENY");
    if (["/sw.js", "/manifest.webmanifest"].includes(url.pathname))
      headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    if (url.protocol === "https:")
      headers.set("Strict-Transport-Security", "max-age=31536000");
    return new Response(response.body, { status: response.status, headers });
  },
};
