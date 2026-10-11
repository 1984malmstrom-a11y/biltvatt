import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixture } from "./fixture";
import { emptyHandbookContent, type HandbookContent } from "../shared/handbook";
import { SECURITY_PLACEHOLDER, contentHasSensitiveAccessText, redactImportedAccessText } from "../shared/handbook-security";

const migration = (name: string) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");

describe("Personalpärmen V2.9", () => {
  it("utökar bara dokumenttabellerna och bevarar versioner, utkast och historik", () => {
    const db = new DatabaseSync(":memory:");
    try {
      for (const name of ["0001_initial.sql", "0002_admin_maintenance.sql", "0003_push_notifications.sql", "0004_station_dashboard.sql", "0005_station_dashboard_v2.sql", "0006_station_monthly_figures.sql", "0007_station_handbook.sql"]) db.exec(migration(name));
      db.exec("INSERT INTO station_handbook_heads(station_id,kind,published_version_id,draft_title,draft_description,draft_json,draft_reviewed,revision,updated_at) VALUES('tingsryd','opening','old-version','Utkast','Beskrivning','{}',1,7,'2026-10-01'); INSERT INTO station_handbook_versions(id,station_id,kind,title,description,content_json,published_at) VALUES('old-version','tingsryd','opening','Öppning','Historik','{}','2026-10-01'); INSERT INTO station_handbook_checks(station_id,kind,task_date,item_id,done,revision,updated_at) VALUES('tingsryd','opening','2026-10-01','old-task',1,3,'2026-10-01');");
      const heads = db.prepare("SELECT * FROM station_handbook_heads").all();
      const versions = db.prepare("SELECT * FROM station_handbook_versions").all();
      const checks = db.prepare("SELECT * FROM station_handbook_checks").all();
      const sales = db.prepare("SELECT count(*) AS n FROM sales").get();
      db.exec(migration("0008_station_handbook_freshfood.sql"));
      expect(db.prepare("SELECT * FROM station_handbook_heads WHERE kind='opening'").all()).toEqual(heads);
      expect(db.prepare("SELECT * FROM station_handbook_versions WHERE kind='opening'").all()).toEqual(versions);
      expect(db.prepare("SELECT * FROM station_handbook_checks").all()).toEqual(checks);
      expect(db.prepare("SELECT count(*) AS n FROM sales").get()).toEqual(sales);
      db.exec("INSERT INTO station_handbook_heads(station_id,kind,updated_at) VALUES('tingsryd','freshfood','2026-10-02'); INSERT INTO station_handbook_versions(id,station_id,kind,title,description,content_json,published_at) VALUES('fresh-version','tingsryd','freshfood','FreshFood','','{}','2026-10-02');");
      expect(() => db.exec("INSERT INTO station_handbook_checks(station_id,kind,task_date,item_id,done,updated_at) VALUES('tingsryd','freshfood','2026-10-02','x',1,'2026-10-02')")).toThrow();
      expect(db.prepare("PRAGMA integrity_check").get()).toMatchObject({ integrity_check: "ok" });
    } finally { db.close(); }
  });

  it("låter bara admin spara och publicera FreshFood som läsguide", async () => {
    const f = fixture();
    try {
      const admin = await f.login();
      const created = await f.call("/admin/station/activation-codes", "POST", { device_label: "Testenhet" }, admin);
      const { code } = await created.json() as { code: string };
      const viewer = (await f.call("/station/activate", "POST", { code })).headers.get("Set-Cookie")!.split(";")[0];
      const content: HandbookContent = emptyHandbookContent();
      content.blocks = [{ type: "heading", text: "Tas upp på dagen", level: 2 }, { type: "paragraph", text: "Syntetisk regel för dagen." }];
      const payload = { title: "FreshFood", description: "Syntetisk testguide", content, reviewed: false, expected_revision: 0 };
      expect((await f.call("/admin/station/handbook/freshfood/draft", "PUT", payload, viewer)).status).toBe(401);
      expect((await f.call("/admin/station/handbook/freshfood/draft", "PUT", payload, admin)).status).toBe(200);
      expect((await f.call("/station/handbook/freshfood", "GET", undefined, viewer)).status).toBe(404);
      expect((await f.call("/admin/station/handbook/freshfood/publish", "POST", { expected_revision: 1 }, admin)).status).toBe(200);
      const live = await f.call("/station/handbook/freshfood", "GET", undefined, viewer);
      expect((await live.json() as { content: HandbookContent; checks: unknown[] }).checks).toEqual([]);
      expect((await f.call("/station/handbook/freshfood/checks/02a99ce6-57e0-49fc-a634-7551dfa61654", "PUT", { day: "2026-10-11", done: true, expected_revision: 0 }, viewer)).status).toBe(404);
    } finally { f.db.close(); }
  });

  it("rensar misstänkta åtkomstuppgifter och blockerar både råtext och markeringar", async () => {
    const redacted = redactImportedAccessText("Testkod 0000");
    expect(redacted.redacted).toBe(true);
    expect(redacted.text).toContain(SECURITY_PLACEHOLDER);
    expect(redacted.text).not.toContain("0000");
    const f = fixture();
    try {
      const admin = await f.login();
      const content = emptyHandbookContent();
      content.blocks = [{ type: "check", id: "02a99ce6-57e0-49fc-a634-7551dfa61654", text: "Testkod 0000" }];
      const save = (revision: number) => f.call("/admin/station/handbook/opening/draft", "PUT", { title: "Öppning", description: "Syntetiskt test", content, reviewed: false, expected_revision: revision }, admin);
      expect((await save(0)).status).toBe(400);
      content.blocks[0] = { type: "check", id: "02a99ce6-57e0-49fc-a634-7551dfa61654", text: redacted.text };
      expect(contentHasSensitiveAccessText(content)).toBe(true);
      expect((await save(0)).status).toBe(200);
      expect((await f.call("/admin/station/handbook/opening/publish", "POST", { expected_revision: 1 }, admin)).status).toBe(400);
      expect((await f.call("/station/handbook/opening", "GET", undefined, admin)).status).toBe(404);
      content.blocks[0] = { type: "check", id: "02a99ce6-57e0-49fc-a634-7551dfa61654", text: "Följ behörig säkerhetsinstruktion för inpassering" };
      expect((await save(1)).status).toBe(200);
      expect((await f.call("/admin/station/handbook/opening/publish", "POST", { expected_revision: 2 }, admin)).status).toBe(200);
    } finally { f.db.close(); }
  });
});
