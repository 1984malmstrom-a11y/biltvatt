import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
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

it("0005 följt av 0006 lägger bara till stationsdata och bevarar Tvättligans rader", () => {
  const db = new DatabaseSync(":memory:");
  const migrate = (name: string) =>
    db.exec(readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8"));
  try {
    for (const name of [
      "0001_initial.sql", "0002_admin_maintenance.sql",
      "0003_push_notifications.sql", "0004_station_dashboard.sql",
    ]) migrate(name);
    db.exec("INSERT INTO sales(id,request_id,undo_token_hash,staff_id,wash_program_id,price_sek,sold_at,created_at) VALUES('old-sale','old-request','old-receipt-hash','emma','preemium',379,'2026-09-01T10:00:00Z','2026-09-01T10:00:00Z')");
    const legacy = ["sales", "staff", "wash_programs", "push_subscriptions", "station_store_daily_sales"];
    const snapshot = () => legacy.map((name) =>
      db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all());
    const before = snapshot();
    migrate("0005_station_dashboard_v2.sql");
    migrate("0006_station_monthly_figures.sql");
    expect(snapshot()).toEqual(before);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('station_schedule_periods','station_shifts','station_tasks','station_task_write_limits','station_notices','station_monthly_figures') ORDER BY name").all()).toHaveLength(6);
    expect(db.prepare("PRAGMA table_info(station_notices)").all().some((column) => column.name === "expires_time")).toBe(true);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    db.close();
  }
});

it("verifierar en syntetisk fullständig D1-export och stoppar en trasig backup", () => {
  const directory = mkdtempSync(join(tmpdir(), "station-v2-backup-"));
  const valid = join(directory, "valid.sql");
  const invalid = join(directory, "invalid.sql");
  try {
    writeFileSync(valid, ["0001_initial.sql", "0002_admin_maintenance.sql",
      "0003_push_notifications.sql", "0004_station_dashboard.sql"].map((name) =>
      readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8")).join("\n"));
    writeFileSync(invalid, "not a database export");
    const script = new URL("../scripts/verify-d1-backup.mjs", import.meta.url);
    const good = spawnSync(process.execPath, [script.pathname, valid], { encoding: "utf8" });
    expect(good.status).toBe(0);
    expect(JSON.parse(good.stdout)).toMatchObject({ verified: true, counts: {
      sales: 0, staff: 5, station_store_daily_sales: 0,
    } });
    const keysScript = new URL("../scripts/station-v2-backup-keys.mjs", import.meta.url);
    const keys = spawnSync(process.execPath, [keysScript.pathname, valid], { encoding: "utf8" });
    expect(keys.status).toBe(0);
    expect(JSON.parse(keys.stdout)).toMatchObject({
      staff: ["emma", "johan", "kalle", "lisa", "peter"],
      sales: [], push_subscriptions: [], station_view_sessions: [],
    });
    const bad = spawnSync(process.execPath, [script.pathname, invalid], { encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toBe("");
    expect(bad.stderr).toContain("Stoppa lanseringen");
    const badKeys = spawnSync(process.execPath, [keysScript.pathname, invalid], { encoding: "utf8" });
    expect(badKeys.status).toBe(1);
    expect(badKeys.stdout).toBe("");
    const snapshotScript = new URL("../scripts/station-v2-snapshot.mjs", import.meta.url);
    const integrity = spawnSync(process.execPath, [snapshotScript.pathname, "query", valid, "PRAGMA integrity_check"], { encoding: "utf8" });
    expect(integrity.status).toBe(0);
    expect(JSON.parse(integrity.stdout)).toMatchObject({
      ok: true, results: [{ integrity_check: "ok" }],
    });
    const mutation = spawnSync(process.execPath, [snapshotScript.pathname, "query", valid, "DELETE FROM sales"], { encoding: "utf8" });
    expect(JSON.parse(mutation.stdout)).toMatchObject({
      ok: false, errorType: "invalid_read_only_query",
    });
    const corrupted = spawnSync(process.execPath, [snapshotScript.pathname, "query", invalid, "PRAGMA integrity_check"], { encoding: "utf8" });
    expect(JSON.parse(corrupted.stdout)).toMatchObject({
      ok: false, errorType: "snapshot_or_query_failed",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
