import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const tables = [
  "sales", "sales_audit", "staff", "wash_programs", "push_subscriptions",
  "notification_events", "station_store_daily_sales", "station_view_sessions",
];

const path = process.argv[2];
if (!path) {
  process.stderr.write("Ange sökvägen till en privat D1-export (.sql).\n");
  process.exit(2);
}

let db;
try {
  const bytes = readFileSync(path);
  if (bytes.length < 100) throw new Error("empty backup");
  db = new DatabaseSync(":memory:");
  db.exec(bytes.toString("utf8"));
  const integrity = db.prepare("PRAGMA integrity_check").get()?.integrity_check;
  const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
  if (integrity !== "ok" || foreignKeys.length) throw new Error("invalid backup");
  const counts = Object.fromEntries(tables.map((table) => [
    table, db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get()?.count,
  ]));
  process.stdout.write(JSON.stringify({
    verified: true,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    counts,
  }, null, 2) + "\n");
} catch {
  process.stderr.write("Backupen kunde inte läsas in och verifieras. Stoppa lanseringen.\n");
  process.exitCode = 1;
} finally {
  db?.close();
}
