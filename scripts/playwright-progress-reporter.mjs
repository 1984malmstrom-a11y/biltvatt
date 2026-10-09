// Record only tracked test locations, never browser output or assertion values.
import { appendFileSync } from "node:fs";
import { relative } from "node:path";

export default class SafeProgressReporter {
  record(event, test) {
    const path = process.env.STATION_V2_E2E_PROGRESS_FILE;
    if (!path) return;
    const file = relative(process.cwd(), test.location.file).replaceAll("\\", "/");
    const line = test.location.line;
    if (!/^e2e\/[a-z0-9-]+\.spec\.ts$/.test(file) ||
        !Number.isInteger(line) || line < 1) return;
    appendFileSync(path, `${JSON.stringify({ event, file, line })}\n`);
  }
  onTestBegin(test) { this.record("begin", test); }
  onTestEnd(test) { this.record("end", test); }
}
