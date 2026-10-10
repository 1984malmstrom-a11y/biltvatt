import type { Env } from "./index";
import { stockholmDay } from "./stats";
import { addDays } from "./stats";
import { body, checkFields, fail, json, text } from "./http";
import { findScheduleConflicts, type ScheduleRow } from "../shared/schedule";
import { isFixedMonthlyMetrics, type FixedMonthlyMetrics } from "../shared/monthly";

const STATION = "tingsryd";
const isoDay = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const clock = (value: unknown): value is string =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const version = (value: unknown) =>
  Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : fail(400, "Ogiltig version.");
const status = (value: unknown) =>
  ["active", "cancelled", "leave", "sick"].includes(String(value))
    ? (value as string)
    : fail(400, "Ogiltig passstatus.");
const name = (value: unknown) => {
  const result = text(value, "Förnamn", 60);
  if (!/^[\p{L}][\p{L} .'-]*$/u.test(result)) fail(400, "Ogiltigt förnamn.");
  return result;
};
const shiftInput = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(400, "Ogiltigt arbetspass.");
  const row = value as Record<string, unknown>;
  checkFields(row, [
    "work_date",
    "first_name",
    "starts_at",
    "ends_at",
    "status",
  ]);
  if (
    !isoDay(row.work_date) ||
    !clock(row.starts_at) ||
    !clock(row.ends_at) ||
    row.starts_at === row.ends_at
  )
    fail(400, "Kontrollera datum och tider i arbetspasset.");
  return {
    work_date: row.work_date as string,
    first_name: name(row.first_name),
    starts_at: row.starts_at as string,
    ends_at: row.ends_at as string,
    status: status(row.status ?? "active"),
  };
};
const taskFields = (row: Record<string, unknown>) =>
  text(row.text, "Uppgift", 180);
const validMonth = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
  Number(value.slice(0, 4)) >= 2000;
const monthlyRecord = (metrics_json: string) => {
  const data: unknown = JSON.parse(metrics_json);
  return { metrics: isFixedMonthlyMetrics(data) ? data : null, legacy: !isFixedMonthlyMetrics(data) };
};
async function limitTaskWrites(request: Request, env: Env) {
  const token = request.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)station_view=([a-f0-9]{64})/)?.[1];
  if (!token) return; // An admin session was already verified by stationApi.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  const tokenHash = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const minute = new Date().toISOString().slice(0, 16);
  const result = await env.DB.prepare(
    "INSERT INTO station_task_write_limits(token_hash,window_start,requests) VALUES(?,?,1) ON CONFLICT(token_hash) DO UPDATE SET window_start=excluded.window_start,requests=CASE WHEN window_start=excluded.window_start THEN requests+1 ELSE 1 END RETURNING requests",
  )
    .bind(tokenHash, minute)
    .first<{ requests: number }>();
  if ((result?.requests ?? 31) > 30)
    fail(429, "För många ändringar. Försök igen om en minut.");
}

export async function stationV2Api(
  request: Request,
  env: Env,
  viewer: (request: Request, env: Env) => Promise<void>,
  requireAdmin: (request: Request, env: Env) => Promise<void>,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const method = request.method;
  if (
    !path.startsWith("/api/station/v2") &&
    !path.startsWith("/api/admin/station/v2")
  )
    return null;
  const admin = path.startsWith("/api/admin/");
  if (admin) await requireAdmin(request, env);
  else await viewer(request, env);
  const today = stockholmDay();
  const now = new Date().toISOString();
  const localTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Stockholm",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  const previousMonth = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);

  if (path === "/api/station/v2/monthly" && method === "GET") {
    const requested = new URL(request.url).searchParams.get("month");
    const month = requested ?? previousMonth;
    if (!validMonth(month) || month >= today.slice(0, 7))
      fail(400, "Välj en avslutad månad.");
    const row = await env.DB.prepare(
      "SELECT month,metrics_json,updated_at FROM station_monthly_figures WHERE station_id=? AND month=?",
    )
      .bind(STATION, month)
      .first<{ month: string; metrics_json: string; updated_at: string }>();
    return json({
      month,
      ...(row ? monthlyRecord(row.metrics_json) : { metrics: null, legacy: false }),
      updated_at: row?.updated_at ?? null,
    });
  }
  if (path === "/api/admin/station/v2/monthly" && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT month,metrics_json,revision,updated_at FROM station_monthly_figures WHERE station_id=? ORDER BY month DESC LIMIT 60",
    )
      .bind(STATION)
      .all<{ month: string; metrics_json: string; revision: number; updated_at: string }>();
    return json(rows.results.map((row) => ({
      month: row.month,
      ...monthlyRecord(row.metrics_json),
      revision: row.revision,
      updated_at: row.updated_at,
    })));
  }
  const monthlyId = path.match(
    /^\/api\/admin\/station\/v2\/monthly\/(\d{4}-\d{2})$/,
  );
  if (monthlyId && method === "GET") {
    const month = monthlyId[1];
    if (!validMonth(month) || month >= today.slice(0, 7)) fail(400, "Välj en avslutad månad.");
    const row = await env.DB.prepare(
      "SELECT month,metrics_json,revision,updated_at FROM station_monthly_figures WHERE station_id=? AND month=?",
    ).bind(STATION, month).first<{ month: string; metrics_json: string; revision: number; updated_at: string }>();
    return json(row ? { month, ...monthlyRecord(row.metrics_json), revision: row.revision, updated_at: row.updated_at } :
      { month, metrics: null, legacy: false, revision: null, updated_at: null });
  }
  if (monthlyId && method === "PUT") {
    const month = monthlyId[1];
    if (!validMonth(month) || month >= today.slice(0, 7))
      fail(400, "Välj en avslutad månad.");
    const data = await body(request);
    checkFields(data, ["metrics", "expected_revision"]);
    if (!isFixedMonthlyMetrics(data.metrics)) fail(400, "Ange endast de sex fasta nyckeltalen.");
    const metrics = data.metrics as FixedMonthlyMetrics;
    if (data.expected_revision === null) {
      const payload = JSON.stringify(metrics);
      const result = await env.DB.prepare(
        "INSERT OR IGNORE INTO station_monthly_figures(station_id,month,metrics_json,created_at,updated_at) VALUES(?,?,?,?,?)",
      )
        .bind(STATION, month, payload, now, now)
        .run();
      if (result.meta.changes !== 1)
        fail(409, "Månaden finns redan. Uppdatera sidan.");
      return json({ month, revision: 0 }, 201);
    }
    const expected = version(data.expected_revision);
    const existing = await env.DB.prepare(
      "SELECT metrics_json FROM station_monthly_figures WHERE station_id=? AND month=?",
    ).bind(STATION, month).first<{ metrics_json: string }>();
    if (existing && monthlyRecord(existing.metrics_json).legacy)
      fail(409, "Äldre fria månadsvärden är bevarade och kan inte skrivas över.");
    if (existing) {
      const saved = JSON.parse(existing.metrics_json) as FixedMonthlyMetrics;
      for (const key of ["customers_per_day", "average_purchase", "fuel_per_day", "car_wash_average"] as const)
        metrics[key].previous = saved[key].previous;
      if (metrics.economic_result.total_ytd === undefined)
        metrics.economic_result.total_ytd = saved.economic_result.total_ytd ?? null;
    }
    const payload = JSON.stringify(metrics);
    const result = await env.DB.prepare(
      "UPDATE station_monthly_figures SET metrics_json=?,revision=revision+1,updated_at=? WHERE station_id=? AND month=? AND revision=? AND json_extract(metrics_json,'$.kind')='fixed-v25'",
    )
      .bind(payload, now, STATION, month, expected)
      .run();
    if (result.meta.changes !== 1)
      fail(409, "Månadens siffror har ändrats. Uppdatera sidan.");
    return json({ month, revision: expected + 1 });
  }

  if (path === "/api/station/v2" && method === "GET") {
    const [shifts, tasks, notices, latest] = await Promise.all([
      env.DB.prepare(
        "SELECT id,first_name,starts_at,ends_at FROM station_shifts WHERE status='active' AND (work_date=? OR (work_date=? AND ends_at<starts_at AND ends_at>?)) ORDER BY work_date,starts_at,first_name,id",
      )
        .bind(today, addDays(today, -1), localTime)
        .all(),
      env.DB.prepare(
        "SELECT id,text,done,revision,created_at FROM station_tasks WHERE station_id=? AND task_date=? AND deleted_at IS NULL ORDER BY created_at,id LIMIT 100",
      )
        .bind(STATION, today)
        .all(),
      env.DB.prepare(
        "SELECT id,title,message,updated_at FROM station_notices WHERE station_id=? AND published=1 AND (expires_on IS NULL OR expires_on>? OR (expires_on=? AND (expires_time IS NULL OR expires_time>=?))) ORDER BY updated_at DESC,id DESC LIMIT 20",
      )
        .bind(STATION, today, today, localTime)
        .all(),
      env.DB.prepare(
        "SELECT MAX(updated_at) AS updated_at FROM (SELECT updated_at FROM station_schedule_periods WHERE station_id=? UNION ALL SELECT updated_at FROM station_tasks WHERE station_id=? UNION ALL SELECT updated_at FROM station_notices WHERE station_id=?)",
      )
        .bind(STATION, STATION, STATION)
        .first<{ updated_at: string | null }>(),
    ]);
    return json({
      today,
      shifts: shifts.results,
      tasks: tasks.results,
      notices: notices.results,
      updated_at: latest?.updated_at ?? null,
    });
  }
  if (path === "/api/station/v2/tasks" && method === "POST") {
    await limitTaskWrites(request, env);
    const data = await body(request);
    checkFields(data, ["text"]);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO station_tasks(id,station_id,task_date,text,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    )
      .bind(id, STATION, today, taskFields(data), now, now)
      .run();
    return json({ id }, 201);
  }
  const taskId = path.match(/^\/api\/station\/v2\/tasks\/([0-9a-f-]{36})$/);
  if (taskId && (method === "PUT" || method === "DELETE")) {
    await limitTaskWrites(request, env);
    const data = await body(request);
    checkFields(
      data,
      method === "PUT"
        ? ["text", "done", "expected_revision"]
        : ["expected_revision"],
    );
    const expected = version(data.expected_revision);
    let result;
    if (method === "DELETE") {
      result = await env.DB.prepare(
        "UPDATE station_tasks SET deleted_at=?,updated_at=?,revision=revision+1 WHERE id=? AND station_id=? AND task_date=? AND deleted_at IS NULL AND revision=?",
      )
        .bind(now, now, taskId[1], STATION, today, expected)
        .run();
    } else {
      if (typeof data.done !== "boolean")
        fail(400, "Ogiltig status för uppgiften.");
      result = await env.DB.prepare(
        "UPDATE station_tasks SET text=?,done=?,updated_at=?,revision=revision+1 WHERE id=? AND station_id=? AND task_date=? AND deleted_at IS NULL AND revision=?",
      )
        .bind(
          taskFields(data),
          data.done ? 1 : 0,
          now,
          taskId[1],
          STATION,
          today,
          expected,
        )
        .run();
    }
    if (result.meta.changes !== 1)
      fail(409, "Uppgiften har ändrats på en annan enhet. Uppdatera listan.");
    return json({ ok: true });
  }
  if (path === "/api/admin/station/v2/schedule" && method === "GET") {
    const [periods, shifts] = await Promise.all([
      env.DB.prepare(
        "SELECT * FROM station_schedule_periods WHERE station_id=? ORDER BY starts_on DESC LIMIT 30",
      )
        .bind(STATION)
        .all(),
      env.DB.prepare(
        "SELECT s.* FROM station_shifts s JOIN station_schedule_periods p ON p.id=s.period_id WHERE p.station_id=? ORDER BY s.work_date DESC,s.starts_at LIMIT 1000",
      )
        .bind(STATION)
        .all(),
    ]);
    return json({ periods: periods.results, shifts: shifts.results });
  }
  if (path === "/api/admin/station/v2/schedule/import" && method === "POST") {
    if (!request.headers.get("Content-Type")?.includes("application/json"))
      fail(415, "Använd JSON.");
    const raw = await request.text();
    if (raw.length > 100000) fail(413, "Schemat är för stort.");
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return fail(400, "Ogiltig JSON.");
    }
    if (!data || typeof data !== "object" || Array.isArray(data))
      fail(400, "Ogiltigt schema.");
    checkFields(data, ["label", "starts_on", "ends_on", "shifts"]);
    const label = text(data.label, "Schemaperiod", 100);
    if (
      !isoDay(data.starts_on) ||
      !isoDay(data.ends_on) ||
      data.starts_on > data.ends_on
    )
      fail(400, "Ogiltig schemaperiod.");
    if (
      !Array.isArray(data.shifts) ||
      data.shifts.length < 1 ||
      data.shifts.length > 500
    )
      fail(400, "Schemat måste innehålla 1–500 pass.");
    const startsOn = data.starts_on as string,
      endsOn = data.ends_on as string;
    const rows = (data.shifts as unknown[]).map(shiftInput);
    for (const row of rows) {
      if (row.work_date < startsOn || row.work_date > endsOn)
        fail(400, "Ett pass ligger utanför perioden.");
    }
    const existing = await env.DB.prepare(
      "SELECT s.work_date,s.first_name,s.starts_at,s.ends_at,s.status FROM station_shifts s JOIN station_schedule_periods p ON p.id=s.period_id WHERE p.station_id=? AND s.work_date BETWEEN ? AND ?",
    ).bind(STATION, addDays(startsOn, -1), addDays(endsOn, 1)).all<ScheduleRow>();
    const conflicts = findScheduleConflicts(rows, existing.results);
    if (conflicts.length) {
      const first = conflicts[0];
      fail(first.existing ? 409 : 400,
        first.kind === "duplicate"
          ? "Schemat innehåller dubbla pass. Kontrollera förhandsgranskningen."
          : "Schemat innehåller överlappande aktiva pass. Kontrollera förhandsgranskningen.");
    }
    const period = crypto.randomUUID();
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO station_schedule_periods(id,station_id,label,starts_on,ends_on,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        ).bind(period, STATION, label, startsOn, endsOn, now, now),
        ...rows.map((row) =>
          env.DB.prepare(
            "INSERT INTO station_shifts(id,period_id,work_date,first_name,starts_at,ends_at,status,updated_at) VALUES(?,?,?,?,?,?,?,?)",
          ).bind(
            crypto.randomUUID(),
            period,
            row.work_date,
            row.first_name,
            row.starts_at,
            row.ends_at,
            row.status,
            now,
          ),
        ),
      ]);
    } catch {
      fail(
        409,
        "Schemat innehåller pass som redan finns. Kontrollera importen.",
      );
    }
    return json({ period_id: period, imported: rows.length }, 201);
  }
  if (path === "/api/admin/station/v2/shifts" && method === "POST") {
    const data = await body(request);
    checkFields(data, [
      "period_id",
      "work_date",
      "first_name",
      "starts_at",
      "ends_at",
      "status",
    ]);
    const periodId = text(data.period_id, "Schemaperiod", 36);
    const { period_id: _period_id, ...input } = data;
    const row = shiftInput(input);
    const period = await env.DB.prepare(
      "SELECT starts_on,ends_on FROM station_schedule_periods WHERE id=? AND station_id=?",
    )
      .bind(periodId, STATION)
      .first<{ starts_on: string; ends_on: string }>();
    if (
      !period ||
      row.work_date < period.starts_on ||
      row.work_date > period.ends_on
    )
      fail(400, "Passet ligger utanför schemaperioden.");
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare(
        "INSERT INTO station_shifts(id,period_id,work_date,first_name,starts_at,ends_at,status,updated_at) VALUES(?,?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          periodId,
          row.work_date,
          row.first_name,
          row.starts_at,
          row.ends_at,
          row.status,
          now,
        )
        .run();
    } catch {
      fail(409, "Det här passet finns redan.");
    }
    await env.DB.prepare(
      "UPDATE station_schedule_periods SET updated_at=? WHERE id=?",
    )
      .bind(now, periodId)
      .run();
    return json({ id }, 201);
  }
  const shiftId = path.match(
    /^\/api\/admin\/station\/v2\/shifts\/([0-9a-f-]{36})$/,
  );
  if (shiftId && method === "PUT") {
    const data = await body(request);
    checkFields(data, [
      "work_date",
      "first_name",
      "starts_at",
      "ends_at",
      "status",
      "expected_revision",
    ]);
    const { expected_revision: _expected_revision, ...input } = data;
    const row = shiftInput(input);
    const expected = version(data.expected_revision);
    const result = await env.DB.prepare(
      "UPDATE station_shifts SET work_date=?,first_name=?,starts_at=?,ends_at=?,status=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM station_schedule_periods p WHERE p.id=station_shifts.period_id AND p.station_id=? AND ? BETWEEN p.starts_on AND p.ends_on)",
    )
      .bind(
        row.work_date,
        row.first_name,
        row.starts_at,
        row.ends_at,
        row.status,
        now,
        shiftId[1],
        expected,
        STATION,
        row.work_date,
      )
      .run()
      .catch(() =>
        fail(409, "Det ändrade passet krockar med ett befintligt pass."),
      );
    if (result.meta.changes !== 1)
      fail(409, "Passet har ändrats. Uppdatera schemat.");
    await env.DB.prepare(
      "UPDATE station_schedule_periods SET updated_at=? WHERE id=(SELECT period_id FROM station_shifts WHERE id=?)",
    )
      .bind(now, shiftId[1])
      .run();
    return json({ ok: true });
  }
  if (path === "/api/admin/station/v2/notices" && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT * FROM station_notices WHERE station_id=? ORDER BY updated_at DESC LIMIT 100",
    )
      .bind(STATION)
      .all();
    return json(rows.results);
  }
  if (path === "/api/admin/station/v2/notices" && method === "POST") {
    const data = await body(request);
    checkFields(data, ["title", "message", "published", "expires_on", "expires_time"]);
    if (
      typeof data.published !== "boolean" ||
      (data.expires_on !== null &&
        data.expires_on !== undefined &&
        !isoDay(data.expires_on)) ||
      (data.expires_time !== null && data.expires_time !== undefined && !clock(data.expires_time)) ||
      (data.expires_time && !data.expires_on)
    )
      fail(400, "Ogiltig publicering eller sluttid.");
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO station_notices(id,station_id,title,message,published,expires_on,expires_time,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        STATION,
        text(data.title, "Rubrik", 100),
        text(data.message, "Meddelande", 1000),
        data.published ? 1 : 0,
        data.expires_on ?? null,
        data.expires_time ?? null,
        now,
        now,
      )
      .run();
    return json({ id }, 201);
  }
  const noticeId = path.match(
    /^\/api\/admin\/station\/v2\/notices\/([0-9a-f-]{36})$/,
  );
  if (noticeId && (method === "PUT" || method === "DELETE")) {
    const data = await body(request);
    checkFields(
      data,
      method === "PUT"
        ? ["title", "message", "published", "expires_on", "expires_time", "expected_revision"]
        : ["expected_revision"],
    );
    const expected = version(data.expected_revision);
    let result;
    if (method === "DELETE")
      result = await env.DB.prepare(
        "DELETE FROM station_notices WHERE id=? AND station_id=? AND revision=?",
      )
        .bind(noticeId[1], STATION, expected)
        .run();
    else {
      if (
        typeof data.published !== "boolean" ||
        (data.expires_on !== null &&
          data.expires_on !== undefined &&
          !isoDay(data.expires_on)) ||
        (data.expires_time !== null && data.expires_time !== undefined && !clock(data.expires_time)) ||
        (data.expires_time && !data.expires_on)
      )
        fail(400, "Ogiltig publicering eller sluttid.");
      result = await env.DB.prepare(
        "UPDATE station_notices SET title=?,message=?,published=?,expires_on=?,expires_time=?,revision=revision+1,updated_at=? WHERE id=? AND station_id=? AND revision=?",
      )
        .bind(
          text(data.title, "Rubrik", 100),
          text(data.message, "Meddelande", 1000),
          data.published ? 1 : 0,
          data.expires_on ?? null,
          data.expires_time ?? null,
          now,
          noticeId[1],
          STATION,
          expected,
        )
        .run();
    }
    if (result.meta.changes !== 1)
      fail(409, "Meddelandet har ändrats. Uppdatera listan.");
    return json({ ok: true });
  }
  return fail(404, "Sidan eller anropet finns inte.");
}
