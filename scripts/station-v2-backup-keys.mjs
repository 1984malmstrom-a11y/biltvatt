// Emit only in-memory row keys for the private launch script. Never log this output.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const queries = {
  sales: "SELECT id AS key FROM sales",
  sales_audit: "SELECT CAST(id AS TEXT) AS key FROM sales_audit",
  staff: "SELECT id AS key FROM staff",
  wash_programs: "SELECT id AS key FROM wash_programs",
  push_subscriptions: "SELECT id AS key FROM push_subscriptions",
  notification_events: "SELECT id AS key FROM notification_events",
  station_store_daily_sales: "SELECT station_id || '|' || business_date AS key FROM station_store_daily_sales",
  station_store_sales_audit: "SELECT CAST(id AS TEXT) AS key FROM station_store_sales_audit",
  station_schedule_periods: "SELECT id AS key FROM station_schedule_periods",
  station_shifts: "SELECT id AS key FROM station_shifts",
  station_view_sessions: "SELECT token_hash AS key FROM station_view_sessions",
};
const additiveV2Tables = ["station_schedule_periods", "station_shifts"];

const path = process.argv[2];
if (!path) {
  process.stderr.write("Ange sökvägen till en privat D1-backup.\n");
  process.exit(2);
}
let db;
try {
  const sql = readFileSync(path);
  if (sql.length < 100) throw new Error("empty backup");
  db = new DatabaseSync(":memory:");
  db.exec(sql.toString("utf8"));
  if (db.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok" ||
      db.prepare("PRAGMA foreign_key_check").all().length) {
    throw new Error("invalid backup");
  }
  const availableV2 = new Set(db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('station_schedule_periods','station_shifts')",
  ).all().map((row) => row.name));
  // The approved private V1 backup predates migration 0005. Both additive
  // schedule tables are absent there; current backups must contain both.
  if (availableV2.size !== 0 && availableV2.size !== additiveV2Tables.length)
    throw new Error("incomplete V2 schedule schema");
  if (availableV2.size === 0 && db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='d1_migrations'",
  ).get() && db.prepare(
    "SELECT 1 FROM d1_migrations WHERE name='0005_station_dashboard_v2.sql'",
  ).get()) throw new Error("applied V2 migration without schedule tables");
  const keys = Object.fromEntries(Object.entries(queries).map(([name, query]) => [
    name, additiveV2Tables.includes(name) && !availableV2.has(name)
      ? [] : db.prepare(query).all().map((row) => String(row.key)).sort(),
  ]));
  process.stdout.write(JSON.stringify(keys));
} catch {
  process.stderr.write("Backupens rader kunde inte läsas säkert. Stoppa lanseringen.\n");
  process.exitCode = 1;
} finally {
  db?.close();
}
