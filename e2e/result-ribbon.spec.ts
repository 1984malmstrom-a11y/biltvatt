import { expect, test } from "@playwright/test";

const sizes = [
  [1366, 768], [1440, 900], [1536, 700],
  [1920, 1080], [1280, 1024], [390, 844],
] as const;
const amounts = [945000, 3190700, 5500000, 10568000] as const;

test("hela beloppet ligger i den färgade penselformen i godkända viewportar", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-08T09:00:00Z") });
  await page.route("**/api/station/weather", (route) => route.fulfill({ json: {
    source: "SMHI SNOW1gv1", kind: "forecast",
    now: { time: "2026-10-08T10:00:00Z", temperature: 12, symbol: 3 },
    tomorrow: { time: "2026-10-09T10:00:00Z", temperature: 11, symbol: 6 },
  } }));
  await page.route("**/api/station/v2", (route) => route.fulfill({ json: {
    today: "2026-10-08", updated_at: null,
    shifts: [
      { id: "demo-1", first_name: "Demo A", starts_at: "06:00", ends_at: "14:00" },
      { id: "demo-2", first_name: "Demo B", starts_at: "10:00", ends_at: "18:00" },
      { id: "demo-3", first_name: "Demo C", starts_at: "14:00", ends_at: "22:00" },
    ],
    tasks: [
      { id: "demo-task-1", text: "Fyll på kylar", done: 1, revision: 0, created_at: "" },
      { id: "demo-task-2", text: "Kontrollera kampanjer", done: 0, revision: 0, created_at: "" },
      { id: "demo-task-3", text: "Se över entrén", done: 0, revision: 0, created_at: "" },
    ],
    notices: [{ id: "demo-notice", title: "Demoinformation", message: "Syntetiskt innehåll för layoutgranskning.", updated_at: "" }],
  } }));

  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const amount of amounts) {
      await test.step(`${width}×${height}: ${amount / 100} kr`, async () => {
        await page.route("**/api/station/dashboard", (route) => route.fulfill({ json: {
          business_date: "2026-10-07", comparison_date: "2025-10-08",
          net_sales_ore: amount, comparison_sales_ore: 3408700,
          difference_ore: amount - 3408700, percent: 12.8, updated_at: null,
          week: Array.from({ length: 7 }, (_, index) => ({
            date: `2026-10-0${index + 1}`,
            net_sales_ore: index === 6 ? amount : (19 + index * 2) * 100000,
            comparison_sales_ore: (18 + index * 2) * 100000,
            percent: 6,
          })),
        } }));
        await page.goto("/station");
        const ribbon = page.locator(".v2-result-ribbon");
        const label = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(amount / 100);
        await expect(ribbon.locator(".v2-amount")).toHaveText(label);
        await page.evaluate(async () => { await document.fonts.ready; });
        await page.waitForTimeout(400);
        const geometry = await ribbon.evaluate((element) => {
          const amount = element.querySelector(".v2-amount")!;
          const brush = element.querySelector(".v2-ribbon-main") as SVGGeometryElement;
          const label = amount.getBoundingClientRect();
          const parent = element.getBoundingClientRect();
          const change = document.querySelector(".v2-change")!.getBoundingClientRect();
          const style = getComputedStyle(amount);
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d")!;
          ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const metrics = ctx.measureText(amount.textContent!);
          const baseline = label.top + (label.height - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2 + metrics.fontBoundingBoxAscent;
          const inkTop = baseline - metrics.actualBoundingBoxAscent;
          const inkBottom = baseline + metrics.actualBoundingBoxDescent;
          const inverse = brush.getScreenCTM()!.inverse();
          const xSamples = [label.left + 3, (label.left + label.right) / 2, label.right - 3];
          const ySamples = [inkTop - 2, inkBottom + 2];
          const inside = (x: number, y: number) =>
            brush.isPointInFill(new DOMPoint(x, y).matrixTransform(inverse));
          // The font's tallest and lowest glyphs do not occupy both end letters.
          // Check full height behind the digits and side room at their midline.
          const samples = [
            xSamples.map((x) => inside(x, (inkTop + inkBottom) / 2)),
            ySamples.map((y) => inside(xSamples[1], y)),
          ];
          const colored = samples.every((row) => row.every(Boolean));
          return { colored, samples, inkTop, inkBottom, labelLeft: label.left, labelRight: label.right,
            brushLeft: brush.getBoundingClientRect().left, brushRight: brush.getBoundingClientRect().right,
            brushTransform: getComputedStyle(brush.parentElement!).transform,
            labelTop: label.top, labelBottom: label.bottom,
            ribbonTop: parent.top, ribbonBottom: parent.bottom, changeTop: change.top,
            scrollWidth: document.documentElement.scrollWidth };
        });
        expect(geometry.colored, JSON.stringify({ width, height, amount, geometry })).toBe(true);
        expect(geometry.inkTop).toBeGreaterThan(geometry.ribbonTop);
        expect(geometry.inkBottom).toBeLessThan(geometry.ribbonBottom);
        expect(geometry.ribbonBottom).toBeLessThanOrEqual(geometry.changeTop + 1);
        expect(geometry.scrollWidth).toBeLessThanOrEqual(width);
        if (width <= 1280 || height > 980) expect(geometry.brushTransform).toBe("none");
        if (amount === 3190700 && [1440, 1536].includes(width)) {
          await page.screenshot({ path: `test-results/result-ribbon-${width}x${height}.png` });
          await ribbon.screenshot({ path: `test-results/result-ribbon-closeup-${width}x${height}.png` });
        }
      });
    }
  }
});
