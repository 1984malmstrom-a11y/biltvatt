// Run the tracked application in a fresh local-only copy. Never reuse a dev
// server, local D1, .dev.vars, browser origin or service worker from a prior run.
// stdout is a small safe JSON status; npm/Playwright output is never forwarded.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import { safeFailures } from "./playwright-safe-failures.mjs";

const root = resolve(import.meta.dirname, "..");
const reply = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const baseEnv = { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false",
  npm_config_cache: join(tmpdir(), "station-v2-e2e-npm-cache") };
for (const key of [
  "ADMIN_PIN", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT",
  "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_KEY", "CLOUDFLARE_EMAIL",
  "CLOUDFLARE_ENV", "PLAYWRIGHT_JSON_OUTPUT_FILE",
]) delete baseEnv[key];

function run(program, args, cwd, env = baseEnv, timeout = 180_000) {
  return spawnSync(program, args, {
    cwd, env, encoding: "utf8", windowsHide: true,
    shell: process.platform === "win32" && program === npm,
    timeout, maxBuffer: 8 * 1024 * 1024,
  });
}
function copyTracked(destination) {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root, encoding: "buffer", windowsHide: true, maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error("tracked_files");
  for (const relative of result.stdout.toString("utf8").split("\0").filter(Boolean)) {
    const source = resolve(root, relative);
    const target = resolve(destination, relative);
    if (!source.startsWith(root + sep) || !target.startsWith(destination + sep) ||
        isAbsolute(relative)) throw new Error("unsafe_path");
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
}
function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}
let directory;
let outcome;
try {
  directory = mkdtempSync(join(tmpdir(), "station-v2-e2e-"));
  copyTracked(directory);
  const configHome = join(directory, "config");
  mkdirSync(configHome, { recursive: true });
  const localEnv = { ...baseEnv, XDG_CONFIG_HOME: configHome,
    ...(process.platform === "win32" ? { APPDATA: configHome } : {}) };
  let result = run(npm, ["ci", "--no-audit", "--no-fund"], directory, localEnv, 240_000);
  if (result.status !== 0) outcome = { ok: false, stage: "isolated_npm_ci", exitCode: result.status };
  if (!outcome) {
    result = run(npm, ["run", "setup"], directory, localEnv, 120_000);
    if (result.status !== 0) outcome = { ok: false, stage: "isolated_local_setup", exitCode: result.status };
  }
  if (!outcome) {
    const port = await freePort();
    const reportPath = join(directory, "playwright-result.json");
    const env = { ...localEnv, STATION_V2_E2E_ISOLATED: "1",
      STATION_V2_E2E_PORT: String(port), PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath };
    result = run(npm, ["run", "test:e2e", "--", "--reporter=json"], directory, env, 300_000);
    if (result.status === 0) {
      const report = JSON.parse(readFileSync(reportPath, "utf8"));
      outcome = { ok: true, stage: "isolated_playwright", passed: report.stats?.expected ?? null };
    } else {
      let failures = [];
      try { failures = safeFailures(JSON.parse(readFileSync(reportPath, "utf8")), directory); }
      catch { /* A missing report points to browser or webserver startup. */ }
      outcome = { ok: false, stage: failures.length ? "assertion" : "webserver_browser_or_runner",
        exitCode: result.status, failures };
    }
  }
} catch {
  outcome = { ok: false, stage: "isolated_runner" };
} finally {
  if (directory) {
    try { rmSync(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 }); }
    catch { /* No production data or credentials were copied into this directory. */ }
  }
}
reply(outcome);
