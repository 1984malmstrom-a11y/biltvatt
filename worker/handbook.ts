import type { Env } from "./index";
import { body, checkFields, fail, json, text } from "./http";
import { HANDBOOK_KINDS, isHandbookContent, isHandbookKind, preserveUnchangedChecks, stockholmToday, type HandbookContent, type HandbookKind } from "../shared/handbook";
import { containsSensitiveAccessText, contentHasSensitiveAccessText, contentHasUnredactedAccessText } from "../shared/handbook-security";

const STATION = "tingsryd";
type Head = {
  kind: HandbookKind; published_version_id: string | null; draft_title: string | null;
  draft_description: string | null; draft_json: string | null; draft_reviewed: number;
  revision: number; updated_at: string;
};
type Version = { id: string; title: string; description: string; content_json: string; published_at: string };
const version = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : fail(400, "Ogiltig version.");
const parseContent = (raw: string): HandbookContent => JSON.parse(raw) as HandbookContent;
const checkId = (value: string) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);

async function readHead(env: Env, kind: HandbookKind) {
  return env.DB.prepare("SELECT * FROM station_handbook_heads WHERE station_id=? AND kind=?")
    .bind(STATION, kind).first<Head>();
}
async function published(env: Env, id: string | null) {
  if (!id) return null;
  return env.DB.prepare("SELECT id,title,description,content_json,published_at FROM station_handbook_versions WHERE id=? AND station_id=?")
    .bind(id, STATION).first<Version>();
}
async function documentFor(env: Env, kind: HandbookKind) {
  const head = await readHead(env, kind);
  return published(env, head?.published_version_id ?? null);
}
async function documentBody(request: Request) {
  if (!request.headers.get("Content-Type")?.includes("application/json")) fail(415, "Använd JSON.");
  const length = Number(request.headers.get("Content-Length"));
  if (length > 100_000) fail(413, "Dokumentet är för stort.");
  const raw = await request.text();
  if (raw.length > 100_000) fail(413, "Dokumentet är för stort.");
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch { return fail(400, "Ogiltigt dokument."); }
}

export async function handbookApi(
  request: Request, env: Env,
  viewer: (request: Request, env: Env) => Promise<void>,
  requireAdmin: (request: Request, env: Env) => Promise<void>,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const method = request.method;
  const admin = path.startsWith("/api/admin/station/handbook");
  if (!admin && !path.startsWith("/api/station/handbook")) return null;
  if (admin) await requireAdmin(request, env);
  else await viewer(request, env);

  if (path === "/api/station/handbook" && method === "GET") {
    const documents = await Promise.all(HANDBOOK_KINDS.map(async (kind) => {
      const row = await documentFor(env, kind);
      return { kind, title: row?.title ?? null, description: row?.description ?? null,
        published_at: row?.published_at ?? null, available: Boolean(row) };
    }));
    return json({ documents });
  }
  if (path === "/api/admin/station/handbook" && method === "GET") {
    const documents = await Promise.all(HANDBOOK_KINDS.map(async (kind) => {
      const head = await readHead(env, kind);
      const live = await published(env, head?.published_version_id ?? null);
      return {
        kind, revision: head?.revision ?? 0,
        draft: head?.draft_json ? {
          title: head.draft_title, description: head.draft_description,
          content: parseContent(head.draft_json), reviewed: Boolean(head.draft_reviewed),
        } : null,
        published: live ? { id: live.id, title: live.title, description: live.description,
          content: parseContent(live.content_json), published_at: live.published_at } : null,
      };
    }));
    return json({ documents });
  }
  const read = path.match(/^\/api\/station\/handbook\/(bakeoff|opening|closing|freshfood)$/);
  if (read && method === "GET") {
    const kind = read[1] as HandbookKind;
    const live = await documentFor(env, kind);
    if (!live) fail(404, "Dokumentet är inte publicerat.");
    const day = stockholmToday();
    const content = parseContent(live!.content_json);
    const checks = kind === "bakeoff" || kind === "freshfood" ? [] : (await env.DB.prepare(
      "SELECT item_id,done,revision FROM station_handbook_checks WHERE station_id=? AND kind=? AND task_date=?",
    ).bind(STATION, kind, day).all<{item_id:string;done:number;revision:number}>()).results;
    return json({ kind, id: live!.id, title: live!.title, description: live!.description, content, day, checks });
  }
  const toggle = path.match(/^\/api\/station\/handbook\/(opening|closing)\/checks\/([0-9a-f-]{36})$/i);
  if (toggle && method === "PUT") {
    const kind = toggle[1] as HandbookKind, itemId = toggle[2];
    if (!checkId(itemId)) fail(400, "Ogiltigt moment.");
    const data = await body(request);
    checkFields(data, ["day", "done", "expected_revision"]);
    const day = stockholmToday();
    if (data.day !== day) fail(409, "En ny dag har börjat. Uppdatera checklistan.");
    if (typeof data.done !== "boolean") fail(400, "Ogiltig avbockning.");
    const expected = version(data.expected_revision);
    const live = await documentFor(env, kind);
    if (!live) fail(404, "Dokumentet är inte publicerat.");
    const content = parseContent(live!.content_json);
    if (!content.blocks.some((block) => block.type === "check" && block.id === itemId))
      fail(409, "Momentet finns inte längre i den publicerade rutinen.");
    const now = new Date().toISOString();
    const result = expected === 0
      ? await env.DB.prepare("INSERT OR IGNORE INTO station_handbook_checks(station_id,kind,task_date,item_id,done,revision,updated_at) VALUES(?,?,?,?,?,1,?)")
        .bind(STATION, kind, day, itemId, data.done ? 1 : 0, now).run()
      : await env.DB.prepare("UPDATE station_handbook_checks SET done=?,revision=revision+1,updated_at=? WHERE station_id=? AND kind=? AND task_date=? AND item_id=? AND revision=?")
        .bind(data.done ? 1 : 0, now, STATION, kind, day, itemId, expected).run();
    if (result.meta.changes !== 1) fail(409, "Checklistan har ändrats på en annan enhet. Uppdatera vyn.");
    return json({ ok: true, revision: expected + 1, day });
  }
  const manage = path.match(/^\/api\/admin\/station\/handbook\/(bakeoff|opening|closing|freshfood)\/(draft|publish|unpublish)$/);
  if (!manage) return fail(404, "Okänd personalpärmsåtgärd.");
  const kind = manage[1] as HandbookKind, action = manage[2];
  if (!isHandbookKind(kind)) fail(404, "Okänd dokumenttyp.");
  if (action === "draft" && method === "PUT") {
    const data = await documentBody(request);
    checkFields(data, ["title", "description", "content", "reviewed", "expected_revision"]);
    const title = text(data.title, "Titel", 120);
    const description = typeof data.description === "string" && data.description.length <= 300 ? data.description.trim() : fail(400, "Ogiltig beskrivning.");
    if (typeof data.reviewed !== "boolean" || !isHandbookContent(data.content, kind)) fail(400, "Kontrollera dokumentets innehåll.");
    const validContent = data.content as HandbookContent;
    if (containsSensitiveAccessText(title) || containsSensitiveAccessText(description) || contentHasUnredactedAccessText(validContent))
      fail(400, "Ta bort känsliga åtkomstuppgifter före lagring.");
    const expected = version(data.expected_revision);
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT OR IGNORE INTO station_handbook_heads(station_id,kind,updated_at) VALUES(?,?,?)")
      .bind(STATION, kind, now).run();
    const head = await readHead(env, kind);
    const previous = await published(env, head?.published_version_id ?? null);
    const content = preserveUnchangedChecks(validContent, previous ? parseContent(previous.content_json) : null);
    if (kind === "bakeoff" && !content.weekend) {
      const earlier = head?.draft_json ? parseContent(head.draft_json) : previous ? parseContent(previous.content_json) : null;
      if (earlier?.weekend) content.weekend = earlier.weekend;
    }
    const result = await env.DB.prepare("UPDATE station_handbook_heads SET draft_title=?,draft_description=?,draft_json=?,draft_reviewed=?,revision=revision+1,updated_at=? WHERE station_id=? AND kind=? AND revision=?")
      .bind(title, description, JSON.stringify(content), data.reviewed ? 1 : 0, now, STATION, kind, expected).run();
    if (result.meta.changes !== 1) fail(409, "Dokumentet har ändrats. Uppdatera adminvyn.");
    return json({ ok: true, revision: expected + 1, content });
  }
  if ((action === "publish" || action === "unpublish") && method === "POST") {
    const data = await body(request);
    checkFields(data, ["expected_revision"]);
    const expected = version(data.expected_revision);
    const head = await readHead(env, kind);
    if (!head || head.revision !== expected) fail(409, "Dokumentet har ändrats. Uppdatera adminvyn.");
    const currentHead = head as Head;
    const now = new Date().toISOString();
    if (action === "unpublish") {
      const result = await env.DB.prepare("UPDATE station_handbook_heads SET published_version_id=NULL,revision=revision+1,updated_at=? WHERE station_id=? AND kind=? AND revision=?")
        .bind(now, STATION, kind, expected).run();
      if (result.meta.changes !== 1) fail(409, "Dokumentet har ändrats.");
      return json({ ok: true, revision: expected + 1 });
    }
    if (!currentHead.draft_json || !currentHead.draft_title || currentHead.draft_description === null) fail(400, "Spara ett utkast först.");
    if (kind === "bakeoff" && !currentHead.draft_reviewed) fail(400, "Granska alla sju veckodagar och mängder före publicering.");
    const content = parseContent(currentHead.draft_json!);
    if (kind === "bakeoff" && content.weekend && Object.values(content.weekend).some((rows) => rows.some((row) => !row.product.trim() || !row.quantity.trim())))
      fail(400, "Komplettera helgens produktnamn och antal före publicering.");
    if (containsSensitiveAccessText(currentHead.draft_title!) || containsSensitiveAccessText(currentHead.draft_description!) || contentHasSensitiveAccessText(content))
      fail(400, "Ersätt säkerhetsmarkeringar och känsliga åtkomstuppgifter före publicering.");
    if ((kind === "opening" || kind === "closing") && !content.blocks.some((block) => block.type === "check")) fail(400, "Rutinen behöver minst ett checklistemoment.");
    if (kind === "bakeoff" && !Object.values(content.days).some((rows) => rows.length) && !content.blocks.some((block) => block.type === "table" && block.rows.length > 1))
      fail(400, "Upplockningsschemat saknar granskade produkter och mängder.");
    if (kind === "freshfood" && !content.blocks.some((block) => block.type === "paragraph" || block.type === "table" || block.type === "list"))
      fail(400, "FreshFood-guiden saknar innehåll.");
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO station_handbook_versions(id,station_id,kind,title,description,content_json,published_at) VALUES(?,?,?,?,?,?,?)")
      .bind(id, STATION, kind, currentHead.draft_title, currentHead.draft_description, currentHead.draft_json, now).run();
    const result = await env.DB.prepare("UPDATE station_handbook_heads SET published_version_id=?,draft_title=NULL,draft_description=NULL,draft_json=NULL,draft_reviewed=0,revision=revision+1,updated_at=? WHERE station_id=? AND kind=? AND revision=?")
      .bind(id, now, STATION, kind, expected).run();
    if (result.meta.changes !== 1) fail(409, "Dokumentet har ändrats. Uppdatera adminvyn.");
    return json({ ok: true, id, revision: expected + 1 });
  }
  return fail(405, "Metoden stöds inte.");
}
