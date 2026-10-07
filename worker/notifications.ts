import type { Env } from "./index";
import { body, checkFields, fail, integer, json, text } from "./http";
import { addDays, midnightUTC, stockholmDay } from "./stats";
import {
  base64url,
  decode64,
  deliverPush,
  validateTarget,
  type PushKeys,
  type PushTarget,
} from "./webpush";

export const pushSettingNames = [
  "push_enabled",
  "push_goal_close_enabled",
  "push_goal_close_threshold",
  "push_goal_reached_enabled",
] as const;
interface Device extends PushTarget {
  id: string;
  staff_id: string | null;
  device_label: string | null;
  active: number;
  management_token_hash: string;
}
interface Event {
  id: string;
  event_key: string;
  event_type: string;
  title: string;
  body: string;
  url: string;
  audience: string;
  staff_id: string | null;
  subscription_id: string | null;
  state: string;
  total: number;
  sent: number;
  failed: number;
}
const hash = async (value: string) =>
  base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
export function configuredKeys(env: Env): PushKeys | null {
  try {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
    const publicBytes = decode64(env.VAPID_PUBLIC_KEY),
      privateBytes = decode64(env.VAPID_PRIVATE_KEY);
    if (
      publicBytes.length !== 65 ||
      publicBytes[0] !== 4 ||
      privateBytes.length !== 32
    )
      return null;
    return {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject:
        env.VAPID_SUBJECT ?? "https://tvattligan.peter-malmstrom.workers.dev",
    };
  } catch {
    return null;
  }
}
async function settings(env: Env) {
  const rows = await env.DB.prepare(
    "SELECT key,value FROM settings WHERE key IN('push_enabled','push_goal_close_enabled','push_goal_close_threshold','push_goal_reached_enabled')",
  ).all<{ key: string; value: string }>();
  return Object.fromEntries(
    rows.results.map((r) => [r.key, Number(r.value)]),
  ) as Record<(typeof pushSettingNames)[number], number>;
}
async function activeStaff(env: Env, id: unknown): Promise<string | null> {
  if (id === null) return null;
  const value = text(id, "Säljare");
  if (
    !(await env.DB.prepare(
      "SELECT id FROM staff WHERE id=? AND active=1 AND deleted_at IS NULL",
    )
      .bind(value)
      .first())
  )
    return fail(400, "Välj en aktiv säljare eller Gemensam enhet.");
  return value;
}
async function owned(request: Request, env: Env) {
  const id = request.headers.get("X-Push-Id"),
    token = request.headers.get("X-Push-Token");
  if (!id || !token || !/^[A-Za-z0-9_-]{43}$/.test(token))
    return fail(401, "Enhetens pushkoppling saknas. Aktivera push på nytt.");
  const row = await env.DB.prepare(
    "SELECT * FROM push_subscriptions WHERE id=? AND management_token_hash=?",
  )
    .bind(id, await hash(token))
    .first<Device>();
  if (!row)
    return fail(
      401,
      "Enhetens pushkoppling är inte giltig. Aktivera push på nytt.",
    );
  return row;
}
const deviceInfo = (row: Device) => ({
  id: row.id,
  staff_id: row.staff_id,
  device_label: row.device_label,
  active: !!row.active,
});
async function requireEnabled(env: Env) {
  const keys = configuredKeys(env);
  if (!keys) return fail(503, "Pushnycklar är inte konfigurerade på servern.");
  if ((await settings(env)).push_enabled !== 1)
    return fail(409, "Pushnotiser är avstängda av Admin.");
  return keys;
}

// Called inside the same D1 batch as the NEW sale insert. The exact crossing is
// captured before a concurrent sale can change the count. Retried request IDs cannot
// enqueue events, nor can void/restore/Admin resets. Calendar bounds are Stockholm.
export function goalEventStatement(env: Env, saleId: string, now: string) {
  const day = stockholmDay(new Date(now));
  return env.DB.prepare(
    `WITH current AS (
    SELECT COUNT(*) AS n,CAST((SELECT value FROM settings WHERE key='daily_goal') AS INTEGER) AS goal,
      CAST((SELECT value FROM settings WHERE key='push_goal_close_threshold') AS INTEGER) AS threshold
    FROM sales s JOIN staff t ON t.id=s.staff_id WHERE s.voided_at IS NULL AND t.deleted_at IS NULL AND s.sold_at>=? AND s.sold_at<?
  ), candidates AS (
    SELECT 'daily_goal_close' AS kind,'Snart är dagens mål nått! 🔥' AS title,threshold || ' tvättar kvar till dagens mål! 🔥' AS body FROM current
    WHERE goal>threshold AND threshold>0 AND n=goal-threshold AND (SELECT value FROM settings WHERE key='push_goal_close_enabled')='1'
    UNION ALL
    SELECT 'daily_goal_reached','Dagens mål är nått! 🎉',n || ' tvättar – starkt jobbat!' FROM current
    WHERE goal>0 AND n=goal AND (SELECT value FROM settings WHERE key='push_goal_reached_enabled')='1'
  ) INSERT OR IGNORE INTO notification_events(id,event_key,event_type,event_date,title,body,url,created_at)
    SELECT ? || ':' || kind,kind || ':' || ?,kind,?,title,body,'/?view=stats',? FROM candidates
    WHERE (SELECT value FROM settings WHERE key='push_enabled')='1' AND EXISTS(SELECT 1 FROM sales WHERE id=? AND voided_at IS NULL)`,
  ).bind(
    midnightUTC(day),
    midnightUTC(addDays(day, 1)),
    saleId,
    day,
    day,
    now,
    saleId,
  );
}

export async function processEvent(env: Env, id: string) {
  const keys = configuredKeys(env);
  if (!keys || (await settings(env)).push_enabled !== 1) {
    await env.DB.prepare(
      "UPDATE notification_events SET state='skipped',completed_at=? WHERE id=? AND state='pending'",
    )
      .bind(new Date().toISOString(), id)
      .run();
    return;
  }
  // An atomic claim gives at-most-one sending attempt per event, including concurrent
  // waitUntil tasks and re-crossing a goal after an undo/reset. No automatic retries.
  const event = await env.DB.prepare(
    "UPDATE notification_events SET state='sending' WHERE id=? AND state='pending' RETURNING *",
  )
    .bind(id)
    .first<Event>();
  if (!event) return;
  let filter = "";
  const values: string[] = [];
  if (event.audience === "shared") filter = " AND d.staff_id IS NULL";
  if (event.audience === "staff") {
    filter = " AND d.staff_id=?";
    values.push(event.staff_id!);
  }
  if (event.audience === "device") {
    filter = " AND d.id=?";
    values.push(event.subscription_id!);
  }
  const devices = await env.DB.prepare(
    `SELECT d.* FROM push_subscriptions d LEFT JOIN staff t ON t.id=d.staff_id WHERE d.active=1 AND (d.staff_id IS NULL OR (t.active=1 AND t.deleted_at IS NULL)) ${filter}`,
  )
    .bind(...values)
    .all<Device>();
  let sent = 0,
    failed = 0;
  const deadline = Date.now() + 20000;
  for (let offset = 0; offset < devices.results.length; offset += 5) {
    const chunk = devices.results.slice(offset, offset + 5);
    if (Date.now() >= deadline || (await settings(env)).push_enabled !== 1) {
      failed += devices.results.length - offset;
      break;
    }
    const results = await Promise.all(
      chunk.map(async (device) => {
        try {
          return {
            device,
            status: await deliverPush(
              device,
              {
                title: event.title,
                body: event.body,
                url: event.url,
                tag: event.event_key,
                type: event.event_type,
              },
              keys,
            ),
          };
        } catch {
          return { device, status: 599 };
        } // Never log endpoints, auth keys or provider responses.
      }),
    );
    const now = new Date().toISOString();
    await env.DB.batch(
      results.map(({ device, status }) => {
        if (status >= 200 && status < 300) {
          sent++;
          return env.DB.prepare(
            "UPDATE push_subscriptions SET last_success_at=?,failure_count=0 WHERE id=?",
          ).bind(now, device.id);
        }
        failed++;
        return env.DB.prepare(
          `UPDATE push_subscriptions SET failure_count=failure_count+1 ${status === 404 || status === 410 ? ",active=0,disabled_at=?" : ""} WHERE id=?`,
        ).bind(...(status === 404 || status === 410 ? [now] : []), device.id);
      }),
    );
  }
  await env.DB.prepare(
    "UPDATE notification_events SET state='complete',total=?,sent=?,failed=?,completed_at=? WHERE id=?",
  )
    .bind(devices.results.length, sent, failed, new Date().toISOString(), id)
    .run();
}
export async function deliverSaleEvents(env: Env, saleId: string) {
  // Do not put provider/network failure on the sale response path.
  for (const kind of ["daily_goal_close", "daily_goal_reached"])
    await processEvent(env, `${saleId}:${kind}`);
}
async function sendEvent(
  env: Env,
  eventKey: string,
  kind: string,
  data: {
    title: string;
    body: string;
    url: string;
    audience: string;
    staff_id: string | null;
    subscription_id?: string;
  },
) {
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  // Atomic rate limit: at most three manual/test events per minute across the station.
  await env.DB.prepare(
    `INSERT OR IGNORE INTO notification_events(id,event_key,event_type,event_date,title,body,url,audience,staff_id,subscription_id,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM notification_events WHERE event_type IN('manual','test') AND created_at>?)<3`,
  )
    .bind(
      id,
      eventKey,
      kind,
      stockholmDay(),
      data.title,
      data.body,
      data.url,
      data.audience,
      data.staff_id,
      data.subscription_id ?? null,
      now,
      new Date(Date.now() - 60000).toISOString(),
    )
    .run();
  const event = await env.DB.prepare(
    "SELECT * FROM notification_events WHERE event_key=?",
  )
    .bind(eventKey)
    .first<Event>();
  if (!event) return fail(429, "Vänta en minut innan du skickar fler notiser.");
  if (
    event.title !== data.title ||
    event.body !== data.body ||
    event.url !== data.url ||
    event.audience !== data.audience ||
    event.staff_id !== data.staff_id ||
    (event.subscription_id ?? null) !== (data.subscription_id ?? null)
  )
    return fail(
      409,
      "Begärande-ID har redan använts för ett annat meddelande.",
    );
  await processEvent(env, event.id);
  const result = await env.DB.prepare(
    "SELECT state,total,sent,failed FROM notification_events WHERE id=?",
  )
    .bind(event.id)
    .first();
  return json(
    result,
    (result as { state: string }).state === "sending" ? 202 : 200,
  );
}
function requestId(value: unknown) {
  const id = text(value, "Begärande-ID", 36);
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      id,
    )
  )
    return fail(400, "Begärande-ID måste vara UUID.");
  return id;
}

export async function pushApi(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const path = new URL(request.url).pathname,
    method = request.method,
    now = new Date().toISOString();
  if (path === "/api/push/public-key" && method === "GET") {
    const keys = configuredKeys(env);
    return json({
      publicKey: keys?.publicKey ?? null,
      configured: !!keys,
      enabled: (await settings(env)).push_enabled === 1,
    });
  }
  if (path === "/api/push/subscribe" && method === "POST") {
    if (!configuredKeys(env))
      return fail(503, "Pushnycklar är inte konfigurerade på servern.");
    const data = await body(request);
    checkFields(data, ["subscription", "staff_id", "device_label"]);
    const raw = data.subscription as Record<string, unknown>;
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return fail(400, "Ogiltig pushprenumeration.");
    checkFields(raw, ["endpoint", "keys", "expirationTime"]);
    const keyData = raw.keys as Record<string, unknown>;
    if (!keyData || typeof keyData !== "object" || Array.isArray(keyData))
      return fail(400, "Prenumerationens nycklar saknas.");
    checkFields(keyData, ["p256dh", "auth"]);
    const target = {
      endpoint: text(raw.endpoint, "Pushadress", 2048),
      p256dh: text(keyData.p256dh, "Pushnyckel", 100),
      auth: text(keyData.auth, "Pushnyckel", 30),
    };
    try {
      await validateTarget(target);
    } catch {
      return fail(
        400,
        "Prenumerationen är inte giltig eller dess pushleverantör stöds inte.",
      );
    }
    const staffId = await activeStaff(env, data.staff_id),
      label =
        data.device_label === undefined || data.device_label === null
          ? null
          : text(data.device_label, "Enhetsnamn", 60);
    const token = base64url(crypto.getRandomValues(new Uint8Array(32))),
      tokenHash = await hash(token),
      id = crypto.randomUUID();
    // Same endpoint + same secret browser auth key proves ownership for safe re-enrolment.
    // Known endpoint alone is NOT sufficient to overwrite somebody else's device.
    const result = await env.DB.prepare(
      `INSERT INTO push_subscriptions(id,endpoint,p256dh,auth,management_token_hash,staff_id,device_label,active,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,1,?,? WHERE ((SELECT COUNT(*) FROM push_subscriptions)<500 OR EXISTS(SELECT 1 FROM push_subscriptions WHERE endpoint=?))
      AND (? IS NULL OR EXISTS(SELECT 1 FROM staff WHERE id=? AND active=1 AND deleted_at IS NULL))
      ON CONFLICT(endpoint) DO UPDATE SET management_token_hash=excluded.management_token_hash,staff_id=excluded.staff_id,device_label=excluded.device_label,active=1,disabled_at=NULL,updated_at=excluded.updated_at
      WHERE push_subscriptions.auth=excluded.auth AND push_subscriptions.p256dh=excluded.p256dh`,
    )
      .bind(
        id,
        target.endpoint,
        target.p256dh,
        target.auth,
        tokenHash,
        staffId,
        label,
        now,
        now,
        target.endpoint,
        staffId,
        staffId,
      )
      .run();
    if (!result.meta.changes)
      return fail(
        409,
        "Enheten kan inte registreras. Förnya prenumerationen eller kontakta Admin.",
      );
    const row = await env.DB.prepare(
      "SELECT * FROM push_subscriptions WHERE endpoint=? AND management_token_hash=?",
    )
      .bind(target.endpoint, tokenHash)
      .first<Device>();
    if (!row)
      return fail(409, "Enhetskopplingen ändrades samtidigt. Försök igen.");
    return json({ ...deviceInfo(row), token }, 201);
  }
  if (path === "/api/push/subscription" && ["GET", "PATCH"].includes(method)) {
    const row = await owned(request, env);
    if (method === "GET") return json(deviceInfo(row));
    const data = await body(request);
    checkFields(data, ["staff_id", "device_label"]);
    const staffId = await activeStaff(env, data.staff_id),
      label =
        data.device_label === undefined
          ? row.device_label
          : data.device_label === null
            ? null
            : text(data.device_label, "Enhetsnamn", 60);
    const changed = await env.DB.prepare(
      "UPDATE push_subscriptions SET staff_id=?,device_label=?,updated_at=? WHERE id=? AND management_token_hash=? AND (? IS NULL OR EXISTS(SELECT 1 FROM staff WHERE id=? AND active=1 AND deleted_at IS NULL))",
    )
      .bind(
        staffId,
        label,
        now,
        row.id,
        row.management_token_hash,
        staffId,
        staffId,
      )
      .run();
    if (!changed.meta.changes)
      return fail(
        409,
        "Enhetskopplingen eller säljaren har ändrats. Försök igen.",
      );
    return json({ ...deviceInfo(row), staff_id: staffId, device_label: label });
  }
  if (path === "/api/push/unsubscribe" && method === "DELETE") {
    const row = await owned(request, env);
    await env.DB.prepare(
      "UPDATE push_subscriptions SET active=0,disabled_at=?,updated_at=? WHERE id=? AND management_token_hash=?",
    )
      .bind(now, now, row.id, row.management_token_hash)
      .run();
    return json({ ok: true });
  }
  if (path === "/api/push/test" && method === "POST") {
    await requireEnabled(env);
    const row = await owned(request, env);
    if (!row.active) return fail(409, "Aktivera enhetens prenumeration först.");
    const data = await body(request);
    checkFields(data, ["request_id"]);
    return sendEvent(
      env,
      `test:${row.id}:${requestId(data.request_id)}`,
      "test",
      {
        title: "Tvättligan är redo 🎉",
        body: "Pushnotiser fungerar på den här enheten.",
        url: "/",
        audience: "device",
        staff_id: null,
        subscription_id: row.id,
      },
    );
  }
  // index.ts has already required Admin authentication for every /api/admin/ route.
  if (path === "/api/admin/notifications" && method === "GET") {
    const counts = await env.DB.prepare(
      `SELECT COUNT(*) AS active,SUM(CASE WHEN d.staff_id IS NULL THEN 1 ELSE 0 END) AS shared FROM push_subscriptions d LEFT JOIN staff t ON t.id=d.staff_id WHERE d.active=1 AND (d.staff_id IS NULL OR (t.active=1 AND t.deleted_at IS NULL))`,
    ).first<{ active: number; shared: number | null }>();
    const staff = await env.DB.prepare(
      "SELECT t.id,t.name,COUNT(d.id) AS devices FROM staff t LEFT JOIN push_subscriptions d ON d.staff_id=t.id AND d.active=1 WHERE t.active=1 AND t.deleted_at IS NULL GROUP BY t.id,t.name ORDER BY t.name",
    ).all();
    const events = await env.DB.prepare(
      "SELECT event_type,event_date,title,state,total,sent,failed,created_at FROM notification_events ORDER BY created_at DESC,id DESC LIMIT 20",
    ).all();
    return json({
      configured: !!configuredKeys(env),
      settings: await settings(env),
      counts: { active: counts!.active, shared: counts!.shared ?? 0 },
      staff: staff.results,
      events: events.results,
      leaderChangeSupported: false,
    });
  }
  if (path === "/api/admin/notifications/settings" && method === "PUT") {
    const data = await body(request);
    checkFields(data, [...pushSettingNames]);
    if (data.push_enabled === 1 && !configuredKeys(env))
      return fail(503, "Konfigurera VAPID-nycklar innan push aktiveras.");
    const operations = [];
    for (const [key, value] of Object.entries(data)) {
      const validated = integer(
        value,
        key,
        key === "push_goal_close_threshold" ? 10000 : 1,
      );
      if (key === "push_goal_close_threshold" && validated < 1)
        return fail(400, "Tröskeln måste vara minst 1 tvätt.");
      operations.push(
        env.DB.prepare(
          "UPDATE settings SET value=?,updated_at=? WHERE key=?",
        ).bind(String(validated), now, key),
      );
    }
    await env.DB.batch(operations);
    return json({ ok: true });
  }
  if (path === "/api/admin/notifications/send" && method === "POST") {
    await requireEnabled(env);
    const data = await body(request);
    checkFields(data, [
      "title",
      "body",
      "audience",
      "staff_id",
      "destination",
      "request_id",
    ]);
    if (!["all", "shared", "staff"].includes(String(data.audience)))
      return fail(400, "Välj giltiga mottagare.");
    if (!["start", "stats"].includes(String(data.destination)))
      return fail(400, "Välj Start eller Statistik.");
    const staffId =
      data.audience === "staff" ? await activeStaff(env, data.staff_id) : null;
    if (data.audience === "staff" && !staffId)
      return fail(400, "Välj säljare.");
    return sendEvent(env, `manual:${requestId(data.request_id)}`, "manual", {
      title: text(data.title, "Rubrik", 100),
      body: text(data.body, "Meddelande", 500),
      url: data.destination === "stats" ? "/?view=stats" : "/",
      audience: String(data.audience),
      staff_id: staffId,
    });
  }
  return null;
}
