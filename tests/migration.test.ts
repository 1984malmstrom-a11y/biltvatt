import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";

it("0003 är additiv på en databas med historik och bevarar all befintlig affärsdata", () => {
  const db = new DatabaseSync(":memory:");
  const migrate = (name: string) =>
    db.exec(
      readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8"),
    );
  try {
    migrate("0001_initial.sql");
    migrate("0002_admin_maintenance.sql");
    db.exec(
      "INSERT INTO sales(id,request_id,undo_token_hash,staff_id,wash_program_id,price_sek,sold_at,created_at) VALUES('old-sale','old-request','old-private-receipt-hash','emma','preemium',379,'2026-09-01T10:00:00.000Z','2026-09-01T10:00:00.000Z'); UPDATE settings SET value='32' WHERE key='daily_goal';",
    );
    const tables = [
      "staff",
      "wash_programs",
      "sales",
      "sales_audit",
      "staff_audit",
      "admin_sessions",
      "login_attempts",
      "reset_batches",
      "maintenance_previews",
      "maintenance_preview_sales",
    ];
    const snapshot = () =>
      tables.map((table) =>
        db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      );
    const before = snapshot();
    const goals = db.prepare("SELECT * FROM settings ORDER BY key").all();
    migrate("0003_push_notifications.sql");
    expect(snapshot()).toEqual(before);
    expect(
      db
        .prepare(
          "SELECT * FROM settings WHERE key IN('daily_goal','monthly_goal') ORDER BY key",
        )
        .all(),
    ).toEqual(goals);
    expect(
      db.prepare("SELECT value FROM settings WHERE key='push_enabled'").get()
        ?.value,
    ).toBe("0");
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN('push_subscriptions','notification_events') ORDER BY name",
        )
        .all(),
    ).toHaveLength(2);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    db.close();
  }
});
