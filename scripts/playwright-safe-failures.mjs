import { readFileSync } from "node:fs";
import { join } from "node:path";

// Extract only a tracked test location and a known assertion type. The report's
// raw messages, page content, screenshots and network data stay private.
export function safeFailures(report, directory) {
  const failures = [];
  function visit(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        if (spec.tests?.every((test) => test.status === "expected")) continue;
        const reportedFile = spec.file?.replaceAll("\\", "/");
        const file = reportedFile?.startsWith("e2e/") ? reportedFile : `e2e/${reportedFile}`;
        if (!/^e2e\/[a-z0-9-]+\.spec\.ts$/i.test(file)) continue;
        const error = spec.tests?.flatMap((test) => test.results ?? [])
          .flatMap((result) => result.errors ?? [])[0];
        const stack = String(error?.stack ?? "");
        const match = stack.match(/(?:^|[\\/])([a-z0-9-]+\.spec\.ts):(\d+):(\d+)/im);
        const line = Number(error?.location?.line ?? (match ? match[2] : spec.line));
        let assertion = "test_failure";
        const message = String(error?.message ?? "");
        const known = message.match(/\b(toBeVisible|toBeDisabled|toHaveValue|toContainText|toBe|toEqual|toHaveText|toHaveCount)\b/);
        if (known) assertion = known[1];
        else if (/timeout/i.test(message)) assertion = "timeout";
        else if (/locator/i.test(message)) assertion = "locator";
        let source = "";
        if (Number.isInteger(line) && line > 0) {
          const lines = readFileSync(join(directory, file), "utf8").split(/\r?\n/);
          const candidate = lines[line - 1]?.trim() ?? "";
          if (/^(?:await\s+)?expect\b|^\)\.(?:to|not\.)|^\.(?:to|not\.)/.test(candidate))
            source = candidate.slice(0, 140);
        }
        failures.push({ file, line, assertion, source });
        if (failures.length >= 5) return;
      }
      visit(suite.suites);
      if (failures.length >= 5) return;
    }
  }
  visit(report.suites);
  return failures;
}
