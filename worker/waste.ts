import type { Env } from "./index";
import { body, checkFields, fail, json } from "./http";
import type { WasteItem } from "../shared/waste";

const STATION = "tingsryd";
const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const name = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.trim().length <= 180;
const revision = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 1 ? Number(value) : fail(400, "Ogiltig version.");
const uuid = (value: string) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);

export async function wasteApi(request: Request, env: Env, authorize: (request: Request, env: Env) => Promise<void>): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== "/api/station/waste" && !/^\/api\/station\/waste\/[0-9a-f-]{36}$/i.test(path)) return null;
  await authorize(request, env);
  if (path === "/api/station/waste" && request.method === "GET") {
    const rows = (await env.DB.prepare("SELECT id,product_name,expires_on,resolved,revision,created_at,updated_at FROM station_waste_items WHERE station_id=? ORDER BY resolved ASC, expires_on ASC, created_at ASC, id ASC")
      .bind(STATION).all<WasteItem>()).results;
    return json({ items: rows });
  }
  if (path === "/api/station/waste" && request.method === "POST") {
    const data = await body(request);
    checkFields(data, ["product_name", "expires_on"]);
    if (!name(data.product_name) || !date(data.expires_on)) fail(400, "Ange produktnamn och giltigt utgångsdatum.");
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO station_waste_items(id,station_id,product_name,expires_on,created_at,updated_at) VALUES(?,?,?,?,?,?)")
      .bind(id, STATION, String(data.product_name).trim(), data.expires_on, now, now).run();
    return json({ id, revision: 1 }, 201);
  }
  const id = path.slice("/api/station/waste/".length);
  if (!uuid(id)) fail(400, "Ogiltig produkt.");
  if (request.method === "PUT") {
    const data = await body(request);
    checkFields(data, ["product_name", "expires_on", "resolved", "expected_revision"]);
    if (!name(data.product_name) || !date(data.expires_on) || typeof data.resolved !== "boolean") fail(400, "Ogiltiga produktuppgifter.");
    const expected = revision(data.expected_revision);
    const result = await env.DB.prepare("UPDATE station_waste_items SET product_name=?,expires_on=?,resolved=?,revision=revision+1,updated_at=? WHERE station_id=? AND id=? AND revision=?")
      .bind(String(data.product_name).trim(), data.expires_on, data.resolved ? 1 : 0, new Date().toISOString(), STATION, id, expected).run();
    if (result.meta.changes !== 1) fail(409, "Produkten har ändrats på en annan enhet. Uppdatera listan.");
    return json({ ok: true, revision: expected + 1 });
  }
  if (request.method === "DELETE") {
    const data = await body(request);
    checkFields(data, ["expected_revision"]);
    const expected = revision(data.expected_revision);
    const result = await env.DB.prepare("DELETE FROM station_waste_items WHERE station_id=? AND id=? AND revision=?")
      .bind(STATION, id, expected).run();
    if (result.meta.changes !== 1) fail(409, "Produkten har ändrats på en annan enhet. Uppdatera listan.");
    return json({ ok: true });
  }
  return fail(405, "Metoden stöds inte.");
}
