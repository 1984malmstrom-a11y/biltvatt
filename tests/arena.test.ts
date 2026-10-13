import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixture } from "./fixture";
import { activityInput, arenaImage, arenaRange, goalInput } from "../worker/arena-model";
import { arenaAchievement } from "../shared/arena";
import type { ArenaStats } from "../shared/arena";
import worker from "../worker/index";

const fixtures: { db: DatabaseSync; arena: DatabaseSync }[] = [];
function setup() {
  const f = fixture(), arena = new DatabaseSync(":memory:"); arena.exec("PRAGMA foreign_keys=ON");
  for (const name of readdirSync(new URL("../migrations-arena/", import.meta.url)).filter(n => n.endsWith(".sql")).sort())
    arena.exec(readFileSync(new URL(`../migrations-arena/${name}`, import.meta.url), "utf8"));
  const prepare = (sql: string) => {
    let values: (string | number | null | Uint8Array)[] = [];
    const statement = {
      bind: (...args: (string | number | null | ArrayBuffer)[]) => { values = args.map(v => v instanceof ArrayBuffer ? new Uint8Array(v) : v); return statement; },
      first: async () => arena.prepare(sql).get(...values) ?? null,
      all: async () => ({ results: arena.prepare(sql).all(...values), success: true }),
      run: async () => ({ meta: { changes: Number(arena.prepare(sql).run(...values).changes) }, success: true }),
    }; return statement;
  };
  f.env.STATION_ID = "mastertest";
  f.env.ARENA_DB = { prepare, batch: async (statements: ReturnType<typeof prepare>[]) => {
    arena.exec("BEGIN"); try { const results = []; for (const s of statements) results.push(await s.run()); arena.exec("COMMIT"); return results; }
    catch (e) { arena.exec("ROLLBACK"); throw e; }
  } } as unknown as D1Database;
  fixtures.push({ db: f.db, arena });
  const registration = (activity_id: string, request_id = crypto.randomUUID(), seller_id = "mastertest:emma") => f.call("/arena/registrations", "POST", { activity_id, seller_id, request_id });
  const create = async (cookie: string, points = 2) => {
    const response = await f.call("/admin/arena/activities", "POST", { ...draft, points }, cookie);
    expect(response.status).toBe(201); return (await response.json() as { id: string }).id;
  };
  const ready = async () => { const cookie = await f.login(); expect((await f.call("/arena/bootstrap")).status).toBe(200); return cookie; };
  return { ...f, arena, registration, create, ready };
}
afterEach(() => { vi.useRealTimers(); for (const f of fixtures.splice(0)) { f.db.close(); f.arena.close(); } });
const draft = { name: "Testaktivitet", offer_text: "2 FÖR", price_text: "25:–", category: "Dryck", points: 1, image_key: null, sort_order: 0, active: 1 };

describe("Arena dataintegritet och stationsisolering", () => {
  it("skyddar admin före maintenance och synkar personal utan att skapa produkter", async () => {
    const f = setup();
    expect((await f.call("/admin/arena/config")).status).toBe(401);
    expect((await f.call("/admin/arena/activities", "POST", draft)).status).toBe(401);
    const cookie = await f.ready();
    const data = await (await f.call("/arena/bootstrap")).json() as { sellers: { name: string }[]; activities: unknown[] };
    expect(data.sellers.length).toBeGreaterThan(0); expect(data.activities).toEqual([]);
    expect((await f.call("/admin/arena/config", "GET", undefined, cookie)).status).toBe(200);
    expect((await f.call("/admin/arena/activities", "POST", { ...draft, station_id: "other" }, cookie)).status).toBe(400);
    expect((await f.call("/admin/arena/activities", "POST", draft, cookie, { Origin: "https://evil.test" })).status).toBe(403);
  });
  it("bevarar poängsnapshot, räknar antal separat och gör retry/dubbeltryck idempotent", async () => {
    const f = setup(), cookie = await f.ready(), activity = await f.create(cookie, 0.5), request = crypto.randomUUID();
    const responses = await Promise.all([f.registration(activity, request), f.registration(activity, request)]);
    const first = await responses[0].json() as { registration: { id: string; points_awarded: number } };
    expect(first.registration.points_awarded).toBe(0.5);
    expect(await responses[1].json()).toEqual(first);
    expect((await f.call(`/admin/arena/activities/${activity}`, "PATCH", { ...draft, points: 3 }, cookie)).status).toBe(200);
    await f.registration(activity);
    const stats = await (await f.call("/arena/stats")).json() as ArenaStats;
    expect(stats).toMatchObject({ count: 2, points: 3.5 });
    expect(stats.leaderboard[0]).toMatchObject({ count: 2, points: 3.5 });
    expect(() => f.arena.prepare("UPDATE arena_registrations SET points_awarded=100 WHERE id=?").run(first.registration.id)).toThrow("arena_snapshot_immutable");
    const other = await f.create(cookie); expect((await f.registration(other, request)).status).toBe(409);
  });
  it("hindrar korsläsning och korsskrivning av aktiviteter, säljare, bilder och ångring", async () => {
    const f = setup(), cookie = await f.ready(), a = await f.create(cookie), request = crypto.randomUUID();
    const saved = await (await f.registration(a, request)).json() as { registration: { id: string } };
    f.env.STATION_ID = "other"; await f.call("/arena/bootstrap");
    expect((await f.call(`/admin/arena/activities/${a}`, "PATCH", draft, cookie)).status).toBe(404);
    expect((await f.registration(a, crypto.randomUUID(), "other:emma")).status).toBe(409);
    expect((await f.registration(a, request, "other:emma")).status).toBe(409);
    expect((await f.call(`/arena/registrations/${saved.registration.id}/void`, "POST", { request_id: request })).status).toBe(404);
    const stats = await (await f.call("/arena/stats")).json() as ArenaStats; expect(stats.count).toBe(0);
    expect((await f.call(`/arena/stats?activity_id=${a}`)).status).toBe(404);
    expect((await f.call("/admin/arena/goals", "POST", { seller_id: "mastertest:emma", period_type: "custom", start_date: "2026-10-01", end_date: "2026-10-31", target_points: 100 }, cookie)).status).toBe(400);
    expect(() => f.arena.prepare("INSERT INTO arena_registrations(id,station_id,seller_id,activity_id,request_id,points_awarded,registered_at,created_at) VALUES('bad','other','other:emma',?,'request',2,'now','now')").run(a)).toThrow("arena_station_mismatch");
  });
  it("ångrar endast med eget UUID-kvitto inom fem minuter och bevarar historiken", async () => {
    const f = setup(), cookie = await f.ready(), a = await f.create(cookie), request = crypto.randomUUID();
    const saved = await (await f.registration(a, request)).json() as { registration: { id: string } };
    const path = `/arena/registrations/${saved.registration.id}/void`;
    expect((await f.call(path, "POST", { request_id: crypto.randomUUID() })).status).toBe(403);
    expect((await f.call(path, "POST", { request_id: request })).status).toBe(200);
    expect((await f.call(path, "POST", { request_id: request })).status).toBe(200);
    expect(await (await f.call("/arena/stats")).json()).toMatchObject({ count: 0, points: 0 });
    expect(await (await f.registration(a, request)).json()).toMatchObject({ registration: { id: saved.registration.id, voided_at: expect.any(String) } });
    const second = await (await f.registration(a)).json() as { registration: { id: string } };
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 6 * 60000);
    const r = f.arena.prepare("SELECT request_id FROM arena_registrations WHERE id=?").get(second.registration.id)!;
    expect((await f.call(`/arena/registrations/${second.registration.id}/void`, "POST", { request_id: r.request_id })).status).toBe(409);
    expect(f.arena.prepare("SELECT COUNT(*) n FROM arena_registrations").get()!.n).toBe(2);
  });
  it("servar bildbytes separat och förhindrar att en annan station läser eller återanvänder dem", async () => {
    const f = setup(), cookie = await f.ready(), activity = await f.create(cookie);
    const png = new Uint8Array(24); png.set([137,80,78,71,13,10,26,10]); png.set([73,72,68,82], 12);
    const header = new DataView(png.buffer); header.setUint32(16, 512); header.setUint32(20, 512);
    const uploaded = await worker.fetch(new Request("https://tvattligan.test/api/admin/arena/activity-images", {
      method: "POST", headers: { Cookie: cookie, "Content-Type": "image/png" }, body: png.buffer,
    }), f.env);
    expect(uploaded.status).toBe(201);
    const imageKey = (await uploaded.json() as { id: string }).id;
    expect((await f.call(`/admin/arena/activities/${activity}`, "PATCH", { ...draft, image_key: imageKey }, cookie)).status).toBe(200);
    const image = await f.call(`/arena/activity-images/${imageKey}`);
    expect(image.headers.get("Content-Type")).toBe("image/png"); expect(image.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(png);
    expect(await (await f.call("/arena/bootstrap")).text()).not.toContain("image_bytes");
    f.env.STATION_ID = "other"; await f.call("/arena/bootstrap");
    expect((await f.call(`/arena/activity-images/${imageKey}`)).status).toBe(404);
    expect((await f.call("/admin/arena/activities", "POST", { ...draft, image_key: imageKey }, cookie)).status).toBe(400);
  });
  it("synkar nya säljare och behåller historik när säljaren inaktiveras", async () => {
    const f = setup(), cookie = await f.ready(), a = await f.create(cookie);
    await f.registration(a);
    f.db.prepare("UPDATE staff SET active=0 WHERE id='emma'").run();
    // No stale bootstrap cache permits another registration for an inactive local person.
    expect((await f.registration(a)).status).toBe(400);
    await f.call("/arena/bootstrap");
    const stats = await (await f.call("/arena/stats")).json() as ArenaStats;
    expect(stats.leaderboard.find(p => p.id === "mastertest:emma")).toMatchObject({ active: 0, count: 1, points: 2 });
    f.db.prepare("INSERT INTO staff(id,name,color,created_at,active) VALUES('new','Ny person','#123456','now',1)").run();
    const boot = await (await f.call("/arena/bootstrap")).json() as { sellers: { name: string }[] };
    expect(boot.sellers.some(s => s.name === "Ny person")).toBe(true);
  });
  it("beräknar personliga mål och kampanjprogress över deras egna perioder", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
    const f = setup(), cookie = await f.ready(), a = await f.create(cookie, 2);
    const goal = { seller_id: "mastertest:emma", period_type: "week", start_date: "2026-10-12", end_date: "2026-10-18", target_points: 4 };
    expect((await f.call("/admin/arena/goals", "POST", goal, cookie)).status).toBe(201);
    expect((await f.call("/admin/arena/goals", "POST", { ...goal, seller_id: null }, cookie)).status).toBe(201);
    const campaign = { name: "Helgfokus", activity_id: a, start_date: "2026-10-12", end_date: "2026-10-18", target_points: 20, target_count: 10, active: 1 };
    expect((await f.call("/admin/arena/campaigns", "POST", campaign, cookie)).status).toBe(201);
    expect((await f.call("/admin/arena/campaigns", "POST", campaign, cookie)).status).toBe(409);
    await f.registration(a);
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    const before = await (await f.call("/arena/stats")).json() as ArenaStats; await f.registration(a);
    const stats = await (await f.call("/arena/stats")).json() as ArenaStats;
    expect(stats.count).toBe(1); expect(stats.personal_goals[0].points).toBe(4); expect(stats.station_goals[0].points).toBe(4);
    expect(stats.campaign).toMatchObject({ count: 2, points: 4 });
    expect(arenaAchievement(before, stats, "mastertest:emma")).toMatchObject({ text: "Personliga målet uppnått!", special: true });
  });
});

describe("Arena validering och Stockholmsperioder", () => {
  it("firar ett stationsmål när gränsen passeras och inte vid nästa uppdatering", () => {
    const before: ArenaStats = { range: { start:"2026-10-12", end:"2026-10-18", from:"", to:"" }, points:148, count:74, today:{points:0,count:0,sellers:0}, leaderboard:[], campaign:null, personal_goals:[], station_goals:[{id:"week",period_type:"week",start_date:"2026-10-12",end_date:"2026-10-18",target_points:150,points:148}] };
    const after = { ...before, points:150, count:75, station_goals:[{ ...before.station_goals[0], points:150 }] };
    expect(arenaAchievement(before, after, "seller")).toMatchObject({ kind:"station-goal", special:true, goal:{ target_points:150, points:150 } });
    expect(arenaAchievement(after, after, "seller").special).toBe(false);
    expect(arenaAchievement(null, after, "seller").special).toBe(false);
  });
  it("validerar aktiviteter inklusive bråkpoäng och okända klientfält", () => {
    expect(activityInput({ ...draft, points: 0.5 }).points).toBe(0.5);
    for (const points of [-1, NaN, Infinity, "1", 0.123, 10001]) expect(() => activityInput({ ...draft, points })).toThrow();
    for (const extra of [{ name: "" }, { active: 2 }, { sort_order: 0.5 }, { image_key: "https://evil.test" }, { station_id: "other" }]) expect(() => activityInput({ ...draft, ...extra })).toThrow();
    expect(() => goalInput({ seller_id: null, period_type: "week", start_date: "2026-10-13", end_date: "2026-10-19", target_points: 10 })).toThrow();
  });
  it("använder lokal midnatt, måndag och DST utan att blanda perioder", () => {
    const range = (query: string, date: string) => arenaRange(new URL(`https://arena.test/?${query}`), new Date(date));
    expect(range("period=today", "2026-03-28T23:30:00Z")).toMatchObject({ start: "2026-03-29", from: "2026-03-28T23:00:00.000Z", to: "2026-03-29T22:00:00.000Z" });
    expect(range("period=today", "2026-10-25T12:00:00Z")).toMatchObject({ from: "2026-10-24T22:00:00.000Z", to: "2026-10-25T23:00:00.000Z" });
    expect(range("period=week", "2026-10-13T12:00:00Z")).toMatchObject({ start: "2026-10-12", end: "2026-10-18" });
    expect(range("period=month", "2026-02-13T12:00:00Z")).toMatchObject({ start: "2026-02-01", end: "2026-02-28" });
    for (const query of ["period=bad", "period=custom&start=2026-02-30&end=2026-03-01", "period=custom&start=2025-01-01&end=2026-10-13", "station_id=other"])
      expect(() => range(query, "2026-10-13T12:00:00Z")).toThrow();
  });
  it("avvisar SVG, felaktig MIME, överstora bilder och felaktiga bildheader", () => {
    const png = new Uint8Array(24); png.set([137,80,78,71,13,10,26,10]); png.set([73,72,68,82], 12);
    const view = new DataView(png.buffer); view.setUint32(16, 640); view.setUint32(20, 512);
    expect(arenaImage(png, "image/png")).toEqual({ width: 640, height: 512 });
    expect(() => arenaImage(png, "image/webp")).toThrow(); expect(() => arenaImage(png, "image/svg+xml")).toThrow();
    view.setUint32(16, 641); expect(() => arenaImage(png, "image/png")).toThrow();
    expect(() => arenaImage(new Uint8Array(4), "image/png")).toThrow();
  });
});
