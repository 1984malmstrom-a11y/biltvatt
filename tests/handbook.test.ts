import { afterEach, describe, expect, it, vi } from "vitest";
import { fixture } from "./fixture";
import { emptyHandbookContent, stockholmToday, stockholmWeekday, type HandbookContent } from "../shared/handbook";

const openingId = "f8a39c1b-6b73-4fe3-9c3e-d45a785b6221";
const closingId = "02a99ce6-57e0-49fc-a634-7551dfa61654";
const opening = (): HandbookContent => ({ ...emptyHandbookContent(), blocks: [{ type: "heading", text: "Morgon", level: 2 }, { type: "check", id: openingId, text: "Starta kaffet" }] });
const closing = (): HandbookContent => ({ ...emptyHandbookContent(), blocks: [{ type: "check", id: closingId, text: "Lås dörren" }] });
async function sessions(f: ReturnType<typeof fixture>) {
  const admin = await f.login();
  const made = await f.call("/admin/station/activation-codes", "POST", { device_label: "Kassa" }, admin);
  const { code } = await made.json() as { code: string };
  const active = await f.call("/station/activate", "POST", { code });
  return { admin, viewer: active.headers.get("Set-Cookie")!.split(";")[0] };
}
async function save(f: ReturnType<typeof fixture>, admin: string, kind: "opening" | "closing" | "bakeoff", content: HandbookContent, revision = 0, reviewed = true) {
  return f.call(`/admin/station/handbook/${kind}/draft`, "PUT", { title: kind, description: "Test", content, reviewed, expected_revision: revision }, admin);
}
async function publish(f: ReturnType<typeof fixture>, admin: string, kind: "opening" | "closing" | "bakeoff", revision = 1) {
  return f.call(`/admin/station/handbook/${kind}/publish`, "POST", { expected_revision: revision }, admin);
}
afterEach(() => vi.useRealTimers());
describe("Personalpärmen", () => {
  it("skyddar utkast och skrivningar, och visar endast publicerade dokument", async () => {
    const f = fixture(); const { admin, viewer } = await sessions(f);
    expect((await f.call("/station/handbook")).status).toBe(401);
    expect((await f.call("/admin/station/handbook", "GET", undefined, viewer)).status).toBe(401);
    expect((await save(f, viewer, "opening", opening())).status).toBe(401);
    expect((await save(f, admin, "opening", opening())).status).toBe(200);
    expect((await f.call("/station/handbook/opening", "GET", undefined, viewer)).status).toBe(404);
    expect((await f.call("/station/handbook", "GET", undefined, viewer).then((r) => r.json()) as {documents:{available:boolean}[]}).documents[1].available).toBe(false);
    expect((await publish(f, admin, "opening")).status).toBe(200);
    const live = await f.call("/station/handbook/opening", "GET", undefined, viewer);
    expect(live.status).toBe(200);
    expect((await live.json() as { content: HandbookContent }).content.blocks).toContainEqual({ type: "check", id: openingId, text: "Starta kaffet" });
    expect((await f.call("/admin/station/handbook/opening/unpublish", "POST", { expected_revision: 2 }, admin)).status).toBe(200);
    expect((await f.call("/station/handbook/opening", "GET", undefined, viewer)).status).toBe(404);
    f.db.close();
  });
  it("delar daglig status mellan klienter, stöder undo och håller rutinerna separata", async () => {
    const f = fixture(); const { admin, viewer } = await sessions(f);
    await save(f, admin, "opening", opening()); await publish(f, admin, "opening");
    await save(f, admin, "closing", closing()); await publish(f, admin, "closing");
    const day = stockholmToday();
    const url = `/station/handbook/opening/checks/${openingId}`;
    expect((await f.call(url, "PUT", { day, done: true, expected_revision: 0 }, viewer)).status).toBe(200);
    expect((await f.call(url, "PUT", { day, done: false, expected_revision: 0 }, admin)).status).toBe(409);
    const secondClient = await f.call("/station/handbook/opening", "GET", undefined, admin);
    expect((await secondClient.json() as {checks:{done:number;revision:number}[]}).checks).toMatchObject([{done:1,revision:1}]);
    expect((await f.call(url, "PUT", { day, done: false, expected_revision: 1 }, admin)).status).toBe(200);
    const again = await f.call("/station/handbook/opening", "GET", undefined, viewer);
    expect((await again.json() as {checks:{done:number;revision:number}[]}).checks).toMatchObject([{done:0,revision:2}]);
    const other = await f.call("/station/handbook/closing", "GET", undefined, viewer);
    expect((await other.json() as {checks:unknown[]}).checks).toHaveLength(0);
    expect((await f.call(url, "PUT", { day, done: true, expected_revision: 2 }, "")).status).toBe(401);
    f.db.close();
  });
  it("byter svensk kalenderdag utan att radera historik", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T21:59:59Z"));
    const f = fixture(); const { admin, viewer } = await sessions(f);
    await save(f, admin, "opening", opening()); await publish(f, admin, "opening");
    const day = stockholmToday();
    await f.call(`/station/handbook/opening/checks/${openingId}`, "PUT", { day, done: true, expected_revision: 0 }, viewer);
    vi.setSystemTime(new Date("2026-10-08T22:00:01Z"));
    expect(stockholmToday()).toBe("2026-10-09");
    const next = await f.call("/station/handbook/opening", "GET", undefined, viewer);
    expect((await next.json() as {day:string;checks:unknown[]}).checks).toEqual([]);
    expect(f.db.prepare("SELECT done FROM station_handbook_checks WHERE task_date=?").get(day)).toMatchObject({ done: 1 });
    expect((await f.call(`/station/handbook/opening/checks/${openingId}`, "PUT", { day, done: true, expected_revision: 1 }, viewer)).status).toBe(409);
    f.db.close();
  });
  it("bevarar oförändrade moment vid ny version och historik för ändrade moment", async () => {
    const f = fixture(); const { admin, viewer } = await sessions(f);
    await save(f, admin, "opening", opening()); await publish(f, admin, "opening");
    const day = stockholmToday();
    await f.call(`/station/handbook/opening/checks/${openingId}`, "PUT", { day, done: true, expected_revision: 0 }, viewer);
    const revised = opening(); revised.blocks.push({ type: "check", id: "4231c370-a7c9-43fd-9760-cf6867b3c900", text: "Fyll på muggar" });
    expect((await save(f, admin, "opening", revised, 2)).status).toBe(200);
    expect((await publish(f, admin, "opening", 3)).status).toBe(200);
    const live = await f.call("/station/handbook/opening", "GET", undefined, viewer);
    const data = await live.json() as { content: HandbookContent; checks: {item_id:string;done:number}[] };
    expect(data.content.blocks.filter((block) => block.type === "check")).toHaveLength(2);
    expect(data.checks.find((row) => row.item_id === openingId)?.done).toBe(1);
    const changed = opening(); changed.blocks[1] = { type: "check", id: openingId, text: "Starta kaffebryggaren" };
    const saved = await save(f, admin, "opening", changed, 4);
    expect((await saved.json() as {content:HandbookContent}).content.blocks[1]).not.toMatchObject({ id: openingId });
    expect((await publish(f, admin, "opening", 5)).status).toBe(200);
    expect(f.db.prepare("SELECT done FROM station_handbook_checks WHERE item_id=?").get(openingId)).toMatchObject({done:1});
    f.db.close();
  });
  it("kräver granskade mängder och sju svenska dagsflikar för Bakeoff", async () => {
    const f = fixture(); const { admin, viewer } = await sessions(f);
    const content = emptyHandbookContent(); content.days.wednesday.push({product:"Fralla",quantity:"12 st"});
    expect((await save(f, admin, "bakeoff", content, 0, false)).status).toBe(200);
    expect((await publish(f, admin, "bakeoff")).status).toBe(400);
    expect((await save(f, admin, "bakeoff", content, 1, true)).status).toBe(200);
    expect((await publish(f, admin, "bakeoff", 2)).status).toBe(200);
    const response = await f.call("/station/handbook/bakeoff", "GET", undefined, viewer);
    expect((await response.json() as {content:HandbookContent}).content.days.wednesday).toEqual([{product:"Fralla",quantity:"12 st"}]);
    expect(stockholmWeekday(new Date("2026-10-11T10:00:00Z"))).toBe("sunday");
    f.db.close();
  });
});
