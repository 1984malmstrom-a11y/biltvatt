import type { Env } from "./index";
import { body, checkFields, fail, json, text } from "./http";
import type { Issue, IssueEvent } from "../shared/issues";

const STATION = "tingsryd";
const uuid = (value: string) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const optionalText = (value: unknown, label: string, limit: number) => {
  if (typeof value !== "string" || value.length > limit) return fail(400, `${label} är ogiltig.`);
  return value.trim();
};
const revision = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 1
  ? Number(value) : fail(400, "Ogiltig ärendeversion.");
const cursor = (raw: string | null) => {
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|([0-9a-f-]{36})$/i);
  if (!match || !uuid(match[2]) || Number.isNaN(Date.parse(match[1]))) return fail(400, "Ogiltig listmarkör.");
  return { at: match[1], id: match[2] };
};

export async function issuesApi(request: Request, env: Env, authorize: (request: Request, env: Env) => Promise<void>): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path !== "/api/station/issues" && !path.startsWith("/api/station/issues/")) return null;
  await authorize(request, env);
  const method = request.method;
  const now = new Date().toISOString();

  if (path === "/api/station/issues/summary" && method === "GET") {
    const row = await env.DB.prepare("SELECT COUNT(*) AS unresolved FROM station_issues WHERE station_id=? AND completed=0")
      .bind(STATION).first<{ unresolved: number }>();
    return json({ unresolved: row?.unresolved ?? 0 });
  }
  if (path === "/api/station/issues" && method === "GET") {
    const status = url.searchParams.get("status") ?? "open";
    if (status !== "open" && status !== "completed") fail(400, "Ogiltig ärendestatus.");
    const before = cursor(url.searchParams.get("before"));
    const sort = status === "open" ? "created_at" : "completed_at";
    const rows = (await env.DB.prepare(
      `SELECT id,title,description,location,completed,revision,created_at,updated_at,completed_at FROM station_issues WHERE station_id=? AND completed=? AND (? IS NULL OR ${sort}<? OR (${sort}=? AND id<?)) ORDER BY ${sort} DESC,id DESC LIMIT 31`,
    ).bind(STATION, status === "completed" ? 1 : 0, before?.at ?? null, before?.at ?? null, before?.at ?? null, before?.id ?? null).all<Issue>()).results;
    const items = rows.slice(0, 30);
    const last = items.at(-1);
    return json({ items, next_cursor: rows.length > 30 && last ? `${status === "open" ? last.created_at : last.completed_at}|${last.id}` : null });
  }
  if (path === "/api/station/issues" && method === "POST") {
    const data = await body(request);
    checkFields(data, ["title", "description", "location"]);
    const title = text(data.title, "Rubrik", 160);
    const description = optionalText(data.description ?? "", "Beskrivningen", 2000);
    const location = optionalText(data.location ?? "", "Platsen", 120);
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO station_issues(id,station_id,title,description,location,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
      .bind(id, STATION, title, description, location, now, now).run();
    return json({ id, revision: 1 }, 201);
  }
  const match = path.match(/^\/api\/station\/issues\/([0-9a-f-]{36})(?:\/(events|notes|status))?$/i);
  if (!match || !uuid(match[1])) return fail(404, "Ärendet finns inte.");
  const id = match[1];
  const part = match[2];
  if (!part && method === "GET") {
    const issue = await env.DB.prepare("SELECT id,title,description,location,completed,revision,created_at,updated_at,completed_at FROM station_issues WHERE station_id=? AND id=?")
      .bind(STATION, id).first<Issue>();
    if (!issue) fail(404, "Ärendet finns inte.");
    return json({ issue });
  }
  if (part === "events" && method === "GET") {
    const raw = url.searchParams.get("before");
    if (raw !== null && !/^[1-9]\d{0,14}$/.test(raw)) fail(400, "Ogiltig historikmarkör.");
    const issue = await env.DB.prepare("SELECT id FROM station_issues WHERE station_id=? AND id=?").bind(STATION, id).first();
    if (!issue) fail(404, "Ärendet finns inte.");
    const rows = (await env.DB.prepare("SELECT id,action,note_text,occurred_at FROM station_issue_events WHERE station_id=? AND issue_id=? AND id<? ORDER BY id DESC LIMIT 31")
      .bind(STATION, id, raw === null ? Number.MAX_SAFE_INTEGER : Number(raw)).all<IssueEvent>()).results;
    return json({ events: rows.slice(0, 30), next_cursor: rows.length > 30 ? rows[29].id : null });
  }
  if (part === "notes" && method === "POST") {
    const data = await body(request);
    checkFields(data, ["text"]);
    const note = text(data.text, "Åtgärden", 1000);
    const result = await env.DB.prepare("INSERT INTO station_issue_events(station_id,issue_id,action,note_text,occurred_at) SELECT station_id,id,'note',?,? FROM station_issues WHERE station_id=? AND id=?")
      .bind(note, now, STATION, id).run();
    if (result.meta.changes !== 1) fail(404, "Ärendet finns inte.");
    return json({ ok: true }, 201);
  }
  if (!part && method === "PUT") {
    const data = await body(request);
    checkFields(data, ["title", "description", "location", "expected_revision"]);
    const title = text(data.title, "Rubrik", 160);
    const description = optionalText(data.description, "Beskrivningen", 2000);
    const location = optionalText(data.location, "Platsen", 120);
    const expected = revision(data.expected_revision);
    const result = await env.DB.prepare("UPDATE station_issues SET title=?,description=?,location=?,revision=revision+1,updated_at=? WHERE station_id=? AND id=? AND revision=?")
      .bind(title, description, location, now, STATION, id, expected).run();
    if (result.meta.changes !== 1) fail(409, "Ärendet har ändrats på en annan enhet. Ladda om och försök igen.");
    return json({ ok: true, revision: expected + 1 });
  }
  if (part === "status" && method === "PUT") {
    const data = await body(request);
    checkFields(data, ["completed", "expected_revision"]);
    if (typeof data.completed !== "boolean") fail(400, "Ogiltig status.");
    const expected = revision(data.expected_revision);
    const completed = data.completed ? 1 : 0;
    const result = await env.DB.prepare("UPDATE station_issues SET completed=?,completed_at=?,revision=revision+1,updated_at=? WHERE station_id=? AND id=? AND revision=? AND completed<>?")
      .bind(completed, completed ? now : null, now, STATION, id, expected, completed).run();
    if (result.meta.changes !== 1) fail(409, "Ärendet har ändrats på en annan enhet. Ladda om och försök igen.");
    return json({ ok: true, revision: expected + 1 });
  }
  return fail(405, "Metoden stöds inte.");
}
