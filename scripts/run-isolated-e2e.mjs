// Run the tracked application in a fresh local-only copy. Never reuse a dev
// server, local D1, .dev.vars, browser origin or service worker from a prior run.
// stdout is a small safe JSON status; npm/Playwright output is never forwarded.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import { safeFailures } from "./playwright-safe-failures.mjs";

const root = resolve(import.meta.dirname, "..");
const bootstrapOnly = process.argv.length === 3 && process.argv[2] === "--bootstrap-only";
if (process.argv.length > 2 && !bootstrapOnly) throw new Error("invalid_test_mode");
const reply = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const progress = (stage) => process.stderr.write(`isolated_e2e_stage=${stage}\n`);
const baseEnv = { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false",
  npm_config_cache: join(tmpdir(), "station-v2-e2e-npm-cache") };
for (const key of [
  "ADMIN_PIN", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT",
  "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_KEY", "CLOUDFLARE_EMAIL",
  "CLOUDFLARE_ENV", "CLOUDFLARE_ACCOUNT_ID", "CF_API_TOKEN", "CF_API_KEY",
  "CF_ACCOUNT_ID", "PLAYWRIGHT_JSON_OUTPUT_FILE",
]) delete baseEnv[key];

function run(program, args, cwd, env = baseEnv, timeout = 180_000) {
  return spawnSync(program, args, {
    cwd, env, stdio: "ignore", windowsHide: true, timeout,
  });
}
function npmCli() {
  const locations = [
    process.env.npm_execpath,
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  if (process.platform === "win32") {
    const found = spawnSync("where.exe", ["npm.cmd"], {
      encoding: "utf8", windowsHide: true, timeout: 5000,
    });
    for (const path of String(found.stdout ?? "").split(/\r?\n/).filter(Boolean))
      locations.push(join(dirname(path), "node_modules", "npm", "bin", "npm-cli.js"));
  }
  return locations.find((path) => path && existsSync(path));
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
let configHome;
let outcome;
try {
  directory = mkdtempSync(join(tmpdir(), "station-v2-e2e-"));
  copyTracked(directory);
  const cli = npmCli();
  if (!cli) throw new Error("npm_cli_not_found");
  // Keep Wrangler configuration and logs outside the Vite watch tree.
  configHome = mkdtempSync(join(tmpdir(), "station-v2-e2e-config-"));
  // Chromium on Windows uses APPDATA for its own runtime state. Keep that
  // system path intact; Wrangler's local-only commands use the isolated cwd.
  const localEnv = { ...baseEnv, XDG_CONFIG_HOME: configHome };
  progress("npm_ci");
  let result = run(process.execPath, [cli, "ci", "--no-audit", "--no-fund"], directory, localEnv, 240_000);
  if (result.status !== 0) outcome = { ok: false,
    stage: result.error?.code === "ETIMEDOUT" ? "isolated_npm_ci_timeout" : "isolated_npm_ci",
    exitCode: result.status };
  if (!outcome) {
    progress("local_secret");
    result = run(process.execPath, ["scripts/local-secret.mjs"], directory, localEnv, 15_000);
    if (result.status !== 0) outcome = { ok: false, stage: "isolated_local_setup", exitCode: result.status };
  }
  if (!outcome) {
    // This is the exact local migration from npm run setup, with --local fixed.
    progress("local_migrations");
    result = run(process.execPath, ["node_modules/wrangler/wrangler-dist/cli.js",
      "d1", "migrations", "apply", "tvattligan", "--local"], directory, localEnv, 120_000);
    if (result.status !== 0) outcome = { ok: false, stage: "isolated_local_setup", exitCode: result.status };
  }
  if (!outcome) {
    // Build only inside the disposable copy, with its synthetic local secret.
    // Wrangler dev then serves these assets and the Worker strictly locally.
    progress("local_build");
    result = run(process.execPath, ["node_modules/vite/bin/vite.js", "build"], directory, localEnv, 120_000);
    if (result.status !== 0) outcome = { ok: false, stage: result.error?.code === "ETIMEDOUT"
      ? "isolated_local_build_timeout" : "isolated_local_build", exitCode: result.status };
  }
  if (!outcome) {
    progress(bootstrapOnly ? "playwright_bootstrap" : "playwright");
    const port = await freePort();
    const reportPath = join(directory, "playwright-result.json");
    const progressPath = join(directory, "playwright-progress.jsonl");
    const env = { ...localEnv, STATION_V2_E2E_ISOLATED: "1",
      STATION_V2_E2E_PORT: String(port), PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
      STATION_V2_E2E_PROGRESS_FILE: progressPath };
    result = run(process.execPath, ["node_modules/@playwright/test/cli.js", "test",
      ...(bootstrapOnly ? ["e2e/app.spec.ts", "--grep", "säljflöde, dubbelklicksskydd"] : []),
      "--reporter=json,./scripts/playwright-progress-reporter.mjs"], directory, env,
    bootstrapOnly ? 90_000 : 300_000);
    if (result.status === 0) {
      const report = JSON.parse(readFileSync(reportPath, "utf8"));
      outcome = { ok: true, stage: "isolated_playwright", passed: report.stats?.expected ?? null };
    } else {
      let failures = [];
      try { failures = safeFailures(JSON.parse(readFileSync(reportPath, "utf8")), directory); }
      catch { /* A missing report points to browser or webserver startup. */ }
      if (result.error?.code === "ETIMEDOUT" && !failures.length) {
        try {
          const events = readFileSync(progressPath, "utf8").trim().split("\n")
            .map((line) => JSON.parse(line));
          const firstFailed = events.find((event) => event.event === "end" &&
            ["failed", "timedOut"].includes(event.status));
          const active = events.at(-1)?.event === "begin" ? events.at(-1) : undefined;
          const stalled = firstFailed ?? active;
          if (stalled && /^e2e\/[a-z0-9-]+\.spec\.ts$/.test(stalled.file))
            failures = [{ file: stalled.file, line: stalled.line,
              assertion: firstFailed?.assertion ?? "timeout", source: "" }];
        } catch { /* No test began; startup, browser launch or server may be waiting. */ }
      }
      let diagnostic;
      try {
        const events = readFileSync(progressPath, "utf8").trim().split("\n")
          .map((line) => JSON.parse(line));
        const event = events.find((item) => item.event === "bootstrap_diagnostic");
        if (event && ["rootStatus", "staffStatus", "moduleStatus", "pageErrorCount", "staffCount", "consoleErrorCount", "failedRequestCount", "rootChildCount", "badScriptStatus"]
          .every((key) => Number.isInteger(event[key]) && event[key] >= -1 && event[key] <= 599) &&
          typeof event.headingVisibleLater === "boolean" &&
          ["javascript", "html", "other", "unavailable"].includes(event.moduleMime) &&
          ["none", "module_mime", "module_resolution", "csp", "fetch", "http_status", "other"].includes(event.consoleCategory) &&
          (event.badScriptPath === "none" || event.badScriptPath === "other" ||
           /^\/[a-zA-Z0-9_./@:%-]{1,150}$/.test(event.badScriptPath))) {
          diagnostic = { rootStatus: event.rootStatus, staffStatus: event.staffStatus,
            moduleStatus: event.moduleStatus, pageErrorCount: event.pageErrorCount,
            staffCount: event.staffCount, headingVisibleLater: event.headingVisibleLater,
            consoleErrorCount: event.consoleErrorCount, failedRequestCount: event.failedRequestCount,
            rootChildCount: event.rootChildCount, moduleMime: event.moduleMime,
            consoleCategory: event.consoleCategory, badScriptPath: event.badScriptPath,
            badScriptStatus: event.badScriptStatus };
        }
      } catch { /* No safe bootstrap diagnostic was recorded. */ }
      outcome = { ok: false, stage: result.error?.code === "ETIMEDOUT"
        ? "isolated_playwright_timeout"
        : failures.length ? "assertion" : "webserver_browser_or_runner",
        exitCode: result.status, failures, ...(diagnostic ? { diagnostic } : {}) };
    }
  }
} catch {
  outcome = { ok: false, stage: "isolated_runner" };
} finally {
  if (directory) {
    try { rmSync(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 }); }
    catch { /* No production data or credentials were copied into this directory. */ }
  }
  if (configHome) {
    try { rmSync(configHome, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 }); }
    catch { /* Only isolated local test configuration was stored here. */ }
  }
}
reply(outcome);
