// Record only tracked test locations, never browser output or assertion values.
import { appendFileSync } from "node:fs";
import { relative } from "node:path";

export default class SafeProgressReporter {
  record(event, test, result) {
    const path = process.env.STATION_V2_E2E_PROGRESS_FILE;
    if (!path) return;
    const file = relative(process.cwd(), test.location.file).replaceAll("\\", "/");
    const line = result?.errors?.[0]?.location?.line ?? test.location.line;
    if (!/^e2e\/[a-z0-9-]+\.spec\.ts$/.test(file) ||
        !Number.isInteger(line) || line < 1) return;
    const status = ["passed", "failed", "timedOut", "skipped", "interrupted"]
      .includes(result?.status) ? result.status : undefined;
    const assertion = String(result?.errors?.[0]?.message ?? "")
      .match(/\b(toBeVisible|toBeDisabled|toHaveValue|toContainText|toBe|toEqual|toHaveText|toHaveCount)\b/)?.[1]
      ?? (status === "timedOut" ? "timeout" : "test_failure");
    appendFileSync(path, `${JSON.stringify({ event, file, line,
      ...(status ? { status, assertion } : {}) })}\n`);
  }
  onTestBegin(test) { this.record("begin", test); }
  onTestEnd(test, result) { this.record("end", test, result); }
}
