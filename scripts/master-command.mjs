// Deliberate safety gate for the reusable MASTER only.
// Existing Tingsryd deployment credentials and database IDs must never be reused.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const raw = readFileSync(resolve(root, "wrangler.jsonc"), "utf8");
const json = JSON.parse(raw.replace(/,\s*([}\]])/g, "$1"));
const binding = json.d1_databases?.find((item) => item.binding === "DB");
const prodId = "695033b7-6bb2-47a3-a9c3-08d4ca818088";
const validName = (value) => typeof value === "string" && /^[a-z0-9][a-z0-9_-]{2,60}$/.test(value);
const safe = validName(json.name) && json.name !== "tvattligan" &&
  validName(binding?.database_name) && binding.database_name !== "tvattligan" &&
  binding.database_id !== prodId &&
  typeof binding.database_id === "string" &&
  /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(binding.database_id) &&
  binding.database_id !== "00000000-0000-0000-0000-000000000000" &&
  binding.migrations_dir === "migrations-master" &&
  validName(json.vars?.STATION_ID) && json.vars.STATION_ID !== "tingsryd";
const cmd = process.argv[2] || "check";
function run(program, args) {
  const child = spawnSync(process.platform === "win32" ? program + ".cmd" : program, args, {
    cwd: root, stdio: "inherit", shell: process.platform === "win32",
  });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status || 1);
}
if (cmd === "prepare") {
  run("node", ["scripts/prepare-master-migrations.mjs"]);
  process.exit(0);
}
if (!safe) {
  console.error("STOPP: MASTER saknar ett nytt Worker-namn, ett nytt D1-ID eller ett separat stations-ID.");
  console.error("Inget kommando mot Cloudflare har körts. Ändra enbart MASTER-grenens wrangler.jsonc.");
  process.exit(1);
}
console.log("MASTER-verifiering OK: Worker och D1 är separerade från Tingsryd.");
if (cmd === "check") process.exit(0);
run("node", ["scripts/prepare-master-migrations.mjs"]);
if (cmd === "migrate-local" || cmd === "migrate-remote") {
  run("npx", ["--no-install", "wrangler", "d1", "migrations", "apply", binding.database_name,
    cmd === "migrate-remote" ? "--remote" : "--local", "--config", "wrangler.jsonc"]);
} else if (cmd === "deploy") {
  run("npm", ["run", "build"]);
  run("npx", ["--no-install", "wrangler", "deploy", "--config", "wrangler.jsonc"]);
} else {
  console.error("Okänt MASTER-kommando:", cmd);
  process.exit(2);
}
