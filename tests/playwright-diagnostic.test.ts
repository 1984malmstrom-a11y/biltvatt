import { expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-ignore The runtime helper is deliberately plain JavaScript.
import { safeFailures } from "../scripts/playwright-safe-failures.mjs";

it("rapporterar felande påståenderad utan PIN, tokens eller sidinnehåll", () => {
  const root = mkdtempSync(join(tmpdir(), "station-v2-diagnostic-"));
  try {
    mkdirSync(join(root, "e2e"));
    writeFileSync(join(root, "e2e", "pwa-league.spec.ts"),
      'test("Notiser", async () => {\n  await expect(page.getByText("VAPID saknas")).toBeVisible();\n});\n');
    const report = { suites: [{ specs: [{ file: "pwa-league.spec.ts", line: 1,
      tests: [{ status: "unexpected", results: [{ errors: [{
        message: "Error: expect(locator).toBeVisible() PIN=123456 token=private-value",
        stack: "at e2e/pwa-league.spec.ts:2:9",
      }] }] }],
    }] }] };
    const result = safeFailures(report, root);
    expect(result).toEqual([{ file: "e2e/pwa-league.spec.ts", line: 2,
      assertion: "toBeVisible", source: 'await expect(page.getByText("VAPID saknas")).toBeVisible();' }]);
    expect(JSON.stringify(result)).not.toMatch(/123456|private-value/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
