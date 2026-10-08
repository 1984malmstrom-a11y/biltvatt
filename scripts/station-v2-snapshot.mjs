// The launch script uses this for a private read-only D1 export and local SQL checks.
// Wrangler stderr and stdout are never forwarded on failure: they may contain
// private data or authentication details.
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const mode = process.argv[2];
const path = process.argv[3];
const sql = process.argv[4];
const reply = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

function kindOfFailure(output) {
  if (/authentication|not authenticated|log in/i.test(output)) return "authentication";
  if (/permission|forbidden|unauthorized/i.test(output)) return "permission";
  if (/timeout|timed out|ETIMEDOUT/i.test(output)) return "timeout";
  if (/ENOTFOUND|DNS/i.test(output)) return "dns";
  if (/certificate|TLS|SSL/i.test(output)) return "tls";
  if (/fetch failed|network/i.test(output)) return "network";
  return "wrangler_error";
}

if (mode === "export") {
  if (!path) {
    reply({ ok: false, stage: "export", errorType: "missing_path" });
  } else {
    const cli = resolve("node_modules/wrangler/wrangler-dist/cli.js");
    const child = spawnSync(process.execPath, [
      "--no-warnings", cli, "d1", "export", "tvattligan", "--remote",
      "--skip-confirmation", "--config", "wrangler.jsonc", "--output", path,
    ], {
      cwd: process.cwd(), encoding: "utf8", windowsHide: true,
      timeout: 120_000, maxBuffer: 2 * 1024 * 1024,
    });
    if (child.status === 0) {
      try {
        const bytes = statSync(path).size;
        if (bytes < 100) throw new Error("empty export");
        reply({ ok: true, stage: "export", bytes });
      } catch {
        reply({ ok: false, stage: "export", errorType: "missing_or_empty_export" });
      }
    } else {
      const unsigned = child.status === null ? null : (child.status >>> 0);
      reply({
        ok: false, stage: "export", exitCode: child.status,
        windowsStatus: unsigned === 0xC0000409 ? "0xC0000409" : null,
        errorType: child.error?.code === "ETIMEDOUT" ? "timeout"
          : unsigned === 0xC0000409 ? "native_process_crash"
          : child.error?.code ?? kindOfFailure(`${child.stderr ?? ""}\n${child.stdout ?? ""}`),
      });
    }
  }
} else if (mode === "query") {
  if (!path || !sql || /;|--|\/\*/.test(sql) ||
      !/^(?:SELECT\s|PRAGMA\s(?:integrity_check|foreign_key_check|table_info\([A-Za-z_]+\))\s*$)/i.test(sql)) {
    reply({ ok: false, stage: "snapshot_query", errorType: "invalid_read_only_query" });
  } else {
    let db;
    try {
      if (statSync(path).size > 32 * 1024 * 1024) throw new Error("oversize");
      db = new DatabaseSync(":memory:");
      db.exec(readFileSync(path, "utf8"));
      reply({ ok: true, stage: "snapshot_query", results: db.prepare(sql).all() });
    } catch {
      reply({ ok: false, stage: "snapshot_query", errorType: "snapshot_or_query_failed" });
    } finally {
      db?.close();
    }
  }
} else {
  reply({ ok: false, stage: "input", errorType: "unknown_operation" });
}
