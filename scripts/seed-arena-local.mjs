// Optional, LOCAL demo only. No staff or registrations are invented by bootstrap.
// Wrangler's --local flag is fixed and this script accepts no remote overrides.
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

if (process.argv.length > 2) throw new Error("Detta lokala demoscript tar inga argument.");
const root = resolve(import.meta.dirname, "..");
const config = JSON.parse(readFileSync(join(root, "wrangler.jsonc"), "utf8").replace(/,\s*([}\]])/g, "$1"));
const key = config.vars?.STATION_ID;
if (key !== "mastertest") throw new Error("Demo tillåts endast för lokal STATION_ID=mastertest.");
const binding = config.d1_databases.find(b => b.binding === "ARENA_DB");
if (!binding) throw new Error("ARENA_DB saknas.");
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const now = new Date().toISOString();
const localDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const startDay = `${localDay.slice(0, 7)}-01`;
const nextMonth = new Date(`${startDay}T12:00:00Z`); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 1);
const midnight = date => {
  const utc = Date.parse(`${date}T00:00:00Z`);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Stockholm", hour: "2-digit", hourCycle: "h23" }).format(new Date(utc - 7200000)));
  return new Date(utc - ((hour + 2) % 24) * 3600000).toISOString();
};
const campaignStart = midnight(startDay), campaignEnd = midnight(nextMonth.toISOString().slice(0, 10));
const sample = [
  ["Biltvätt", 2, "Biltvätt", "", ""], ["Extra dryck", 1, "Dryck", "", ""],
  ["Korv", 1, "Mat", "", ""], ["Spolarvätska", 1, "Bilvård", "", ""],
  ["Två för", 1, "Dryck", "2 FÖR", "25:–"], ["Räksallad", 0.5, "Mat", "", ""], ["Isskrapa", 1, "Bilvård", "", ""],
];
const imageId = randomUUID();
const imageBytes = readFileSync(join(root, "public/wash-programs/finast-600.webp"));
const chunks = [];
for (let at = 0; at < imageBytes.length; at += 16000) chunks.push(imageBytes.subarray(at, at + 16000).toString("hex"));
// Reuse the repository's existing approved image for local focus preview only.
const sql = [
  `INSERT OR IGNORE INTO arena_stations(id,station_key,name,status,created_at,updated_at) VALUES(${quote(key)},${quote(key)},'Stationen · lokal demo','active',${quote(now)},${quote(now)});`,
  // D1 limits SQL statement length. Assemble bytes in small local statements.
  `INSERT INTO arena_activity_images(id,station_id,mime_type,image_bytes,width,height,created_at) VALUES(${quote(imageId)},${quote(key)},'image/webp',X'${chunks[0]}',600,450,${quote(now)});`,
  ...chunks.slice(1).map(chunk => `UPDATE arena_activity_images SET image_bytes=CAST(image_bytes || X'${chunk}' AS BLOB) WHERE id=${quote(imageId)};`),
  ...sample.map(([name, points, category, offer, price], i) => `INSERT OR IGNORE INTO arena_activities(id,station_id,name,points,category,offer_text,price_text,image_key,sort_order,active,created_at,updated_at) VALUES('mastertest:local-demo-${i}',${quote(key)},${quote(name)},${points},${quote(category)},${quote(offer)},${quote(price)},${i === 0 ? quote(imageId) : "NULL"},${i},1,${quote(now)},${quote(now)});`),
  `INSERT OR IGNORE INTO arena_campaigns(id,station_id,name,activity_id,start_at,end_at,target_count,target_points,active,created_at,updated_at) SELECT 'mastertest:local-demo-focus',${quote(key)},'MÅNADENS FOKUS','mastertest:local-demo-0',${quote(campaignStart)},${quote(campaignEnd)},250,500,1,${quote(now)},${quote(now)} WHERE NOT EXISTS(SELECT 1 FROM arena_campaigns WHERE station_id=${quote(key)} AND active=1);`,
  // Delete the new image if this was a repeated seed and the existing demo already has an image.
  `DELETE FROM arena_activity_images WHERE id=${quote(imageId)} AND NOT EXISTS(SELECT 1 FROM arena_activities WHERE image_key=${quote(imageId)});`,
].join("\n");
const scratch = mkdtempSync(join(tmpdir(), "arena-local-demo-"));
try {
  const file = join(scratch, "demo.sql"); writeFileSync(file, sql);
  const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
  for (const name of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_KEY", "CLOUDFLARE_EMAIL", "CF_API_TOKEN", "CF_API_KEY"]) delete env[name];
  const result = spawnSync(process.execPath, ["node_modules/wrangler/wrangler-dist/cli.js", "d1", "execute", binding.database_name, "--local", "--config", "wrangler.jsonc", "--file", file], { cwd: root, env, stdio: "inherit" });
  if (result.status !== 0) process.exitCode = result.status || 1;
  else console.log("Lokala Arena-demoaktiviteter skapade. Öppna /arena för staff-sync. Ladda upp egna produktbilder i admin.");
} finally { rmSync(scratch, { recursive: true, force: true }); }
