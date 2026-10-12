import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixture } from "./fixture";
import { issueDateTime, type Issue, type IssueEvent, type IssueEventPage, type IssuePage } from "../shared/issues";

async function viewer(f: ReturnType<typeof fixture>) {
  const admin = await f.login();
  const made = await f.call("/admin/station/activation-codes", "POST", { device_label: "Testenhet" }, admin);
  const { code } = await made.json() as { code: string };
  const activated = await f.call("/station/activate", "POST", { code });
  return activated.headers.get("Set-Cookie")!.split(";")[0];
}
const read = async <T>(response: Response) => await response.json() as T;

describe("V3.3 Fel & åtgärder", () => {
  it("lägger endast till separata ärende- och händelsetabeller", () => {
    const db = new DatabaseSync(":memory:");
    try {
      for (const name of ["0001_initial.sql", "0002_admin_maintenance.sql", "0003_push_notifications.sql", "0004_station_dashboard.sql", "0005_station_dashboard_v2.sql", "0006_station_monthly_figures.sql", "0007_station_handbook.sql", "0008_station_handbook_freshfood.sql", "0009_station_waste.sql", "0010_station_event_history.sql"])
        db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
      db.exec("INSERT INTO station_tasks(id,station_id,task_date,text,created_at,updated_at) VALUES('prior','tingsryd','2026-10-11','Tidigare uppgift','2026-10-11','2026-10-11')");
      const schema = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
      const oldTask = db.prepare("SELECT * FROM station_tasks WHERE id='prior'").get();
      db.exec(readFileSync(new URL("../migrations/0011_station_issues.sql", import.meta.url), "utf8"));
      expect(db.prepare("SELECT * FROM station_tasks WHERE id='prior'").get()).toEqual(oldTask);
      for (const row of schema) expect(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(row.name)).toMatchObject({ sql: row.sql });
      expect(db.prepare("PRAGMA integrity_check").get()).toMatchObject({ integrity_check: "ok" });
    } finally { db.close(); }
  });

  it("kräver stationssession och sparar serverdatum, korrekt siffra och stabil sortering", async () => {
    const f = fixture();
    try {
      expect((await f.call("/station/issues/summary")).status).toBe(401);
      expect((await f.call("/station/issues", "POST", { title: "Testfel" })).status).toBe(401);
      const cookie = await viewer(f);
      expect((await f.call("/station/issues", "POST", { title: "  " }, cookie)).status).toBe(400);
      const first = await f.call("/station/issues", "POST", { title: "Kaffemaskin läcker", description: "Droppar vid utloppet", location: "Kassa" }, cookie);
      expect(first.status).toBe(201);
      const { id } = await read<{ id: string }>(first);
      const second = await f.call("/station/issues", "POST", { title: "Dörrklockan fungerar inte" }, cookie);
      expect(second.status).toBe(201);
      const summary = await read<{ unresolved: number }>(await f.call("/station/issues/summary", "GET", undefined, cookie));
      expect(summary.unresolved).toBe(2);
      const page = await read<IssuePage>(await f.call("/station/issues?status=open", "GET", undefined, cookie));
      expect(page.items.map((row) => row.title).sort()).toEqual(["Dörrklockan fungerar inte", "Kaffemaskin läcker"]);
      expect(page.items.map((row) => `${row.created_at}|${row.id}`)).toEqual(page.items.map((row) => `${row.created_at}|${row.id}`).sort().reverse());
      const detail = await read<{ issue: Issue }>(await f.call(`/station/issues/${id}`, "GET", undefined, cookie));
      expect(detail.issue).toMatchObject({ id, title: "Kaffemaskin läcker", completed: 0, revision: 1 });
      expect(Date.now() - Date.parse(detail.issue.created_at)).toBeLessThan(5000);
      expect(issueDateTime("2026-10-11T22:15:00Z")).toContain("00:15");
      expect((await f.call("/station/issues?status=other", "GET", undefined, cookie)).status).toBe(400);
    } finally { f.db.close(); }
  });

  it("bevarar samtidiga anteckningar, hanterar konflikt och loggar bara lyckade ändringar", async () => {
    const f = fixture();
    try {
      const a = await viewer(f), b = await viewer(f);
      const { id } = await read<{ id: string }>(await f.call("/station/issues", "POST", { title: "Kaffemaskin 2" }, a));
      const note = (text: string, cookie: string) => f.call(`/station/issues/${id}/notes`, "POST", { text }, cookie);
      expect((await Promise.all([note("Fel anmält till service", a), note("Väntar på reservdel", b)])).map((response) => response.status)).toEqual([201, 201]);
      const current = async () => (await read<{ issue: Issue }>(await f.call(`/station/issues/${id}`, "GET", undefined, a))).issue;
      expect((await current()).completed).toBe(0);
      const complete = (cookie: string) => f.call(`/station/issues/${id}/status`, "PUT", { completed: true, expected_revision: 1 }, cookie);
      expect((await Promise.all([complete(a), complete(b)])).map((response) => response.status).sort()).toEqual([200, 409]);
      expect((await current()).completed_at).toBeTruthy();
      expect((await read<{ unresolved: number }>(await f.call("/station/issues/summary", "GET", undefined, b))).unresolved).toBe(0);
      expect((await f.call(`/station/issues/${id}/status`, "PUT", { completed: false, expected_revision: 1 }, b)).status).toBe(409);
      expect((await f.call(`/station/issues/${id}/status`, "PUT", { completed: false, expected_revision: 2 }, b)).status).toBe(200);
      expect((await current()).completed_at).toBeNull();
      expect((await f.call(`/station/issues/${id}`, "PUT", { title: "Kaffemaskin 2 läcker", description: "", location: "", expected_revision: 3 }, a)).status).toBe(200);
      const history = await read<IssueEventPage>(await f.call(`/station/issues/${id}/events`, "GET", undefined, b));
      expect(history.events.map((event) => event.action)).toEqual(["edited", "reopened", "completed", "note", "note", "created"]);
      expect(history.events.filter((event) => event.action === "note").map((event) => event.note_text).sort()).toEqual(["Fel anmält till service", "Väntar på reservdel"]);
      expect((await read<IssuePage>(await f.call("/station/issues?status=open", "GET", undefined, a))).items[0].id).toBe(id);
      expect((await f.call(`/station/issues/${id}/events`, "POST", { action: "created" }, a)).status).toBe(405);
      expect((await f.call(`/station/issues/${id}`, "DELETE", { expected_revision: 4 }, a)).status).toBe(405);
    } finally { f.db.close(); }
  });

  it("paginerar lång historik utan dubbletter", async () => {
    const f = fixture();
    try {
      const cookie = await viewer(f);
      const { id } = await read<{ id: string }>(await f.call("/station/issues", "POST", { title: "Testärende" }, cookie));
      const insert = f.db.prepare("INSERT INTO station_issue_events(station_id,issue_id,action,note_text,occurred_at) VALUES(?,?,?,?,?)");
      for (let index = 0; index < 34; index++) insert.run("tingsryd", id, "note", `Syntetisk anteckning ${index}`, new Date().toISOString());
      const first = await read<IssueEventPage>(await f.call(`/station/issues/${id}/events`, "GET", undefined, cookie));
      expect(first.events).toHaveLength(30);
      const second = await read<IssueEventPage>(await f.call(`/station/issues/${id}/events?before=${first.next_cursor}`, "GET", undefined, cookie));
      expect(second.events).toHaveLength(5);
      expect(second.next_cursor).toBeNull();
      expect(new Set([...first.events, ...second.events].map((event: IssueEvent) => event.id)).size).toBe(35);
    } finally { f.db.close(); }
  });

  it("paginerar ärendelistor med stabil ordning och sorterar slutförda efter sluttid", async () => {
    const f = fixture();
    try {
      const cookie = await viewer(f);
      const insert = f.db.prepare("INSERT INTO station_issues(id,station_id,title,created_at,updated_at) VALUES(?,?,?,?,?)");
      for (let index = 1; index <= 35; index++) insert.run(`00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, "tingsryd", `Syntetiskt fel ${index}`, "2026-10-11T09:00:00.000Z", "2026-10-11T09:00:00.000Z");
      const first = await read<IssuePage>(await f.call("/station/issues?status=open", "GET", undefined, cookie));
      expect(first.items).toHaveLength(30);
      expect(first.items[0].title).toBe("Syntetiskt fel 35");
      const second = await read<IssuePage>(await f.call(`/station/issues?status=open&before=${encodeURIComponent(first.next_cursor!)}`, "GET", undefined, cookie));
      expect(second.items).toHaveLength(5);
      expect(second.next_cursor).toBeNull();
      expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(35);
      expect((await f.call("/station/issues?before=ogiltigt", "GET", undefined, cookie)).status).toBe(400);
      f.db.prepare("UPDATE station_issues SET completed=1,completed_at=? WHERE title=?").run("2026-10-11T12:00:00.000Z", "Syntetiskt fel 1");
      f.db.prepare("UPDATE station_issues SET completed=1,completed_at=? WHERE title=?").run("2026-10-11T13:00:00.000Z", "Syntetiskt fel 2");
      const done = await read<IssuePage>(await f.call("/station/issues?status=completed", "GET", undefined, cookie));
      expect(done.items.map((item) => item.title)).toEqual(["Syntetiskt fel 2", "Syntetiskt fel 1"]);
    } finally { f.db.close(); }
  });
});
