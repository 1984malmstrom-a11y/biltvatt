import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixture } from "./fixture";
import { publicationIsNew, safeHistoryLabel, historyTime, type HistoryPage, type TaskHistoryEvent, type WasteHistoryEvent } from "../shared/station-history";
import { stockholmDay } from "../worker/stats";

async function stationCookie(f: ReturnType<typeof fixture>) {
  const admin = await f.login();
  const made = await f.call("/admin/station/activation-codes", "POST", { device_label: "Test" }, admin);
  const { code } = await made.json() as { code: string };
  const activated = await f.call("/station/activate", "POST", { code });
  return activated.headers.get("Set-Cookie")!.split(";")[0];
}

describe("V3.2", () => {
  it("lägger till historik utan att ändra befintliga datatabeller eller skapa äldre händelser", () => {
    const db = new DatabaseSync(":memory:");
    try {
      for (const name of ["0001_initial.sql", "0002_admin_maintenance.sql", "0003_push_notifications.sql", "0004_station_dashboard.sql", "0005_station_dashboard_v2.sql", "0006_station_monthly_figures.sql", "0007_station_handbook.sql", "0008_station_handbook_freshfood.sql", "0009_station_waste.sql"])
        db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
      db.exec("INSERT INTO station_tasks(id,station_id,task_date,text,created_at,updated_at) VALUES('old','tingsryd','2026-10-10','Äldre uppgift','2026-10-10','2026-10-10'); INSERT INTO station_waste_items(id,station_id,product_name,expires_on,created_at,updated_at) VALUES('old','tingsryd','Äldre produkt','2026-10-12','2026-10-10','2026-10-10')");
      const tableSchema = (name: string) => (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name) as { sql: string }).sql;
      const before = [tableSchema("station_tasks"), tableSchema("station_waste_items")];
      db.exec(readFileSync(new URL("../migrations/0010_station_event_history.sql", import.meta.url), "utf8"));
      expect([tableSchema("station_tasks"), tableSchema("station_waste_items")]).toEqual(before);
      expect((db.prepare("SELECT COUNT(*) AS n FROM station_task_events").get() as { n: number }).n).toBe(0);
      expect((db.prepare("SELECT COUNT(*) AS n FROM station_waste_events").get() as { n: number }).n).toBe(0);
      expect(db.prepare("PRAGMA integrity_check").get()).toMatchObject({ integrity_check: "ok" });
    } finally { db.close(); }
  });

  it("räknar sju svenska kalenderdagar från publicering och skyddar historiketetter", () => {
    const now = new Date("2026-10-11T22:30:00Z"); // 12 October in Stockholm
    expect(publicationIsNew("2026-10-05T12:00:00Z", now)).toBe(false);
    expect(publicationIsNew("2026-10-06T12:00:00Z", now)).toBe(true);
    expect(publicationIsNew("2026-10-12T00:00:00Z", now)).toBe(true);
    expect(publicationIsNew(null, now)).toBe(false);
    expect(safeHistoryLabel("Öppna kassan med kod 1234")).toBeNull();
    expect(safeHistoryLabel("Fyll på kylar")).toBe("Fyll på kylar");
    expect(historyTime("2026-10-11T22:30:00Z")).toBe("00:30");
  });

  it("hämtar NYTT-datum från publicerad version även om nyare utkast finns", async () => {
    const f = fixture();
    try {
      const viewer = await stationCookie(f);
      const published = "2026-10-05T09:00:00Z";
      f.db.prepare("INSERT INTO station_handbook_versions(id,station_id,kind,title,description,content_json,published_at) VALUES(?,?,?,?,?,?,?)")
        .run("live", "tingsryd", "bakeoff", "Bakeoff", "", "{}", published);
      f.db.prepare("INSERT INTO station_handbook_heads(station_id,kind,published_version_id,draft_title,draft_description,draft_json,updated_at) VALUES(?,?,?,?,?,?,?)")
        .run("tingsryd", "bakeoff", "live", "Nytt utkast", "", "{}", "2026-10-14T09:00:00Z");
      const summary = async () => (await (await f.call("/station/handbook", "GET", undefined, viewer)).json() as { documents: { kind: string; title: string | null; published_at: string | null; available: boolean }[] }).documents.find((row) => row.kind === "bakeoff")!;
      expect(await summary()).toMatchObject({ title: "Bakeoff", published_at: published, available: true });
      f.db.prepare("UPDATE station_handbook_heads SET published_version_id=NULL WHERE station_id='tingsryd' AND kind='bakeoff'").run();
      expect(await summary()).toMatchObject({ published_at: null, available: false });
    } finally { f.db.close(); }
  });

  it("sparar endast lyckade To-do-händelser och delar historiken mellan sessioner", async () => {
    const f = fixture();
    try {
      const viewer = await stationCookie(f);
      const admin = await f.login();
      const day = stockholmDay();
      expect((await f.call(`/station/v2/tasks/history?day=${day}`)).status).toBe(401);
      expect((await f.call("/station/v2/tasks", "POST", { text: "Fyll på kylar" }, viewer)).status).toBe(201);
      const row = f.db.prepare("SELECT id FROM station_tasks WHERE text='Fyll på kylar'").get() as { id: string };
      const change = (text: string, done: boolean, expected_revision: number) => f.call(`/station/v2/tasks/${row.id}`, "PUT", { text, done, expected_revision }, viewer);
      expect((await change("Fyll på kylar", true, 0)).status).toBe(200);
      expect((await change("Fyll på kylar", false, 0)).status).toBe(409);
      expect((await change("Fyll på kylar", false, 1)).status).toBe(200);
      expect((await change("Fyll på kylarna", false, 2)).status).toBe(200);
      expect((await f.call(`/station/v2/tasks/${row.id}`, "DELETE", { expected_revision: 3 }, viewer)).status).toBe(200);
      const read = async () => (await (await f.call(`/station/v2/tasks/history?day=${day}`, "GET", undefined, admin)).json()) as HistoryPage<TaskHistoryEvent>;
      expect((await read()).events.map((event) => event.action)).toEqual(["deleted", "edited", "reopened", "completed", "created"]);
      expect((await read()).next_cursor).toBeNull();
      expect((await f.call(`/station/v2/tasks/history?day=${day}&before=nope`, "GET", undefined, viewer)).status).toBe(400);
    } finally { f.db.close(); }
  });

  it("sparar datumändringar, undo och radering av Svinnlistan utan konflikthändelser", async () => {
    const f = fixture();
    try {
      const viewer = await stationCookie(f);
      expect((await f.call("/station/waste/history")).status).toBe(401);
      expect((await f.call("/station/waste", "POST", { product_name: "Mjölk", expires_on: "2026-10-15" }, viewer)).status).toBe(201);
      const row = f.db.prepare("SELECT id FROM station_waste_items WHERE product_name='Mjölk'").get() as { id: string };
      const update = (product_name: string, expires_on: string, resolved: boolean, expected_revision: number) =>
        f.call(`/station/waste/${row.id}`, "PUT", { product_name, expires_on, resolved, expected_revision }, viewer);
      expect((await update("Mjölk 1 L", "2026-10-16", false, 1)).status).toBe(200);
      expect((await update("Mjölk 1 L", "2026-10-16", true, 1)).status).toBe(409);
      expect((await update("Mjölk 1 L", "2026-10-16", true, 2)).status).toBe(200);
      expect((await update("Mjölk 1 L", "2026-10-16", false, 3)).status).toBe(200);
      expect((await f.call(`/station/waste/${row.id}`, "DELETE", { expected_revision: 4 }, viewer)).status).toBe(200);
      const events = (await (await f.call("/station/waste/history", "GET", undefined, viewer)).json() as HistoryPage<WasteHistoryEvent>).events;
      expect(events.map((event) => event.action)).toEqual(["deleted", "reopened", "resolved", "renamed", "date_changed", "created"]);
      expect(events.find((event) => event.action === "date_changed")).toMatchObject({ old_expires_on: "2026-10-15", new_expires_on: "2026-10-16" });
    } finally { f.db.close(); }
  });

  it("begränsar och paginerar historik utan att visa kommande poster på nästa sida", async () => {
    const f = fixture();
    try {
      const viewer = await stationCookie(f);
      const day = stockholmDay();
      const insert = f.db.prepare("INSERT INTO station_task_events(station_id,task_date,task_id,action,occurred_at) VALUES(?,?,?,?,?)");
      for (let index = 0; index < 35; index++) insert.run("tingsryd", day, `synthetic-${index}`, "created", new Date(Date.now() + index).toISOString());
      const first = await (await f.call(`/station/v2/tasks/history?day=${day}`, "GET", undefined, viewer)).json() as HistoryPage<TaskHistoryEvent>;
      expect(first.events).toHaveLength(30);
      expect(first.next_cursor).toBe(first.events.at(-1)?.id);
      const second = await (await f.call(`/station/v2/tasks/history?day=${day}&before=${first.next_cursor}`, "GET", undefined, viewer)).json() as HistoryPage<TaskHistoryEvent>;
      expect(second.events).toHaveLength(5);
      expect(second.next_cursor).toBeNull();
      expect(new Set([...first.events, ...second.events].map((event) => event.id)).size).toBe(35);
    } finally { f.db.close(); }
  });
});
