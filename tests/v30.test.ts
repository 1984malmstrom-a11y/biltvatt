import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixture } from "./fixture";
import { emptyHandbookContent, emptyWeekend, preserveUnchangedChecks } from "../shared/handbook";
import { sortWaste, wasteStatus, type WasteItem } from "../shared/waste";
import { redactImportedAccessText, SECURITY_PLACEHOLDER } from "../shared/handbook-security";

describe("V3.0", () => {
  it("bevarar befintliga D1-rader när Svinnlistans tabell läggs till", () => {
    const db = new DatabaseSync(":memory:");
    try {
      for (const name of ["0001_initial.sql", "0002_admin_maintenance.sql", "0003_push_notifications.sql", "0004_station_dashboard.sql", "0005_station_dashboard_v2.sql", "0006_station_monthly_figures.sql", "0007_station_handbook.sql", "0008_station_handbook_freshfood.sql"])
        db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
      db.exec("INSERT INTO station_handbook_checks(station_id,kind,task_date,item_id,done,updated_at) VALUES('tingsryd','opening','2026-10-10','x',1,'2026-10-10')");
      const before = db.prepare("SELECT * FROM station_handbook_checks").all();
      db.exec(readFileSync(new URL("../migrations/0009_station_waste.sql", import.meta.url), "utf8"));
      expect(db.prepare("SELECT * FROM station_handbook_checks").all()).toEqual(before);
      expect(db.prepare("PRAGMA integrity_check").get()).toMatchObject({ integrity_check: "ok" });
    } finally { db.close(); }
  });
  it("sorterar stabilt och skiljer mellan utgånget, idag och imorgon", () => {
    expect(["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"].map((day) => wasteStatus(day, "2026-10-11")))
      .toEqual(["expired", "today", "tomorrow", "later"]);
    const row = (id: string, expires_on: string, created_at: string) => ({ id, expires_on, created_at }) as WasteItem;
    expect(sortWaste([row("c", "2026-10-12", "a"), row("b", "2026-10-11", "a"), row("a", "2026-10-11", "a")]).map((item) => item.id))
      .toEqual(["a", "b", "c"]);
  });
  it("kräver stationstillgång och hanterar delade ändringar, konflikter, undo och radering", async () => {
    const f = fixture();
    try {
      expect((await f.call("/station/waste")).status).toBe(401);
      const admin = await f.login();
      const created = await f.call("/admin/station/activation-codes", "POST", { device_label: "Station" }, admin);
      const { code } = await created.json() as { code: string };
      const viewer = (await f.call("/station/activate", "POST", { code })).headers.get("Set-Cookie")!.split(";")[0];
      const secondCodeResponse = await f.call("/admin/station/activation-codes", "POST", { device_label: "Andra enheten" }, admin);
      const { code: secondCode } = await secondCodeResponse.json() as { code: string };
      const secondViewer = (await f.call("/station/activate", "POST", { code: secondCode })).headers.get("Set-Cookie")!.split(";")[0];
      expect((await f.call("/station/waste", "POST", { product_name: "Mjölk", expires_on: "2026-10-12" })).status).toBe(401);
      expect((await f.call("/station/waste", "POST", { product_name: "Mjölk", expires_on: "2026-10-12" }, viewer)).status).toBe(201);
      expect((await f.call("/station/waste", "POST", { product_name: "Mjölk", expires_on: "2026-10-13" }, viewer)).status).toBe(201);
      const rows = (await (await f.call("/station/waste", "GET", undefined, admin)).json() as { items: WasteItem[] }).items;
      expect(rows).toHaveLength(2);
      expect(rows.map((item) => item.expires_on)).toEqual(["2026-10-12", "2026-10-13"]);
      const first = rows[0];
      const update = { product_name: "Mjölk 1L", expires_on: first.expires_on, resolved: true, expected_revision: first.revision };
      expect((await f.call(`/station/waste/${first.id}`, "PUT", update, viewer)).status).toBe(200);
      expect(((await (await f.call("/station/waste", "GET", undefined, secondViewer)).json() as { items: WasteItem[] }).items.find((item) => item.id === first.id)?.resolved)).toBe(1);
      expect((await f.call(`/station/waste/${first.id}`, "PUT", update, admin)).status).toBe(409);
      expect((await f.call(`/station/waste/${first.id}`, "PUT", { ...update, resolved: false, expected_revision: 2 }, admin)).status).toBe(200);
      expect((await f.call(`/station/waste/${first.id}`, "DELETE", { expected_revision: 2 }, viewer)).status).toBe(409);
      expect((await f.call(`/station/waste/${first.id}`, "DELETE", { expected_revision: 3 }, viewer)).status).toBe(200);
      expect((await f.call("/station/waste", "GET", undefined, admin)).status).toBe(200);
    } finally { f.db.close(); }
  });
  it("bevarar helgens schema och checklistans oförändrade ID:n", () => {
    const content = emptyHandbookContent();
    content.weekend = emptyWeekend();
    content.weekend.Huvudvagn.push({ product: "Testprodukt", quantity: "2 st" });
    expect(content.days.saturday).toEqual([]);
    const id = crypto.randomUUID();
    const previous = emptyHandbookContent(); previous.blocks = [{ type: "check", id, text: "Öppna butiken" }];
    const same = structuredClone(previous);
    expect(preserveUnchangedChecks(same, previous).blocks[0]).toMatchObject({ id });
    same.blocks[0] = { type: "check", id, text: "Öppna entrén" };
    expect((preserveUnchangedChecks(same, previous).blocks[0] as { id: string }).id).not.toBe(id);
  });
  it("bevarar begriplig handling före hemlig uppgift och flaggar otydligt innehåll", () => {
    const safe = redactImportedAccessText("Larma av butiken med testkod 0000");
    expect(safe.text).toBe("Larma av butiken enligt gällande säkerhetsrutin.");
    expect(safe.text).not.toContain("0000");
    expect(redactImportedAccessText("Testkod 0000").text).toBe(SECURITY_PLACEHOLDER);
  });
});
