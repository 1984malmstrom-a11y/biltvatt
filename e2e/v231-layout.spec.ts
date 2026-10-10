import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const phase = process.env.V231_PHASE === "before" ? "before" : "after";
const reviewDirectory = join(tmpdir(), "v231-review", phase);
mkdirSync(reviewDirectory, { recursive: true });

async function syntheticStation(page: Page) {
  await page.route("**/api/station/dashboard", (route) => route.fulfill({ json: {
    business_date: "2026-10-07", comparison_date: "2025-10-08",
    net_sales_ore: 3845000, comparison_sales_ore: 3408700,
    difference_ore: 436300, percent: 12.8, updated_at: null,
    week: Array.from({ length: 7 }, (_, index) => ({
      date: `2026-10-0${index + 1}`,
      net_sales_ore: (20 + index * 3) * 100000,
      comparison_sales_ore: (18 + index * 3) * 100000,
      percent: 8,
    })),
  } }));
  await page.route("**/api/station/v2", (route) => route.fulfill({ json: {
    today: "2026-10-08", updated_at: null,
    shifts: [
      { id: "1", first_name: "Demo A", starts_at: "06:00", ends_at: "14:00" },
      { id: "2", first_name: "Demo B", starts_at: "08:00", ends_at: "16:00" },
      { id: "3", first_name: "Demo C", starts_at: "14:00", ends_at: "22:00" },
    ],
    tasks: Array.from({ length: 4 }, (_, index) => ({
      id: String(index), text: `Demouppgift ${index + 1}`, done: index < 2,
      revision: 0, created_at: "",
    })),
    notices: [{ id: "demo", title: "Demomeddelande", message: "Syntetiskt innehåll för layoutkontroll.", updated_at: "" }],
  } }));
}

const desktopSizes = [[1728, 770], [1536, 700], [1440, 700], [1366, 680],
  [1280, 1024], [1024, 768], [1920, 900], [1024, 650],
  [1280, 850], [1366, 768], [1920, 950], [1920, 1080],
  [1366, 580], [1024, 550]] as const;

for (const [width, height] of [...desktopSizes, [390, 844] as const]) {
  test(`V2.3.1 station layout ${width}×${height}`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-08T09:00:00Z") });
    await page.setViewportSize({ width, height });
    await syntheticStation(page);
    await page.goto("/station");
    await expect(page.locator(".v2-message")).toContainText("Starkt jobbat, team Tingsryd!");
    await expect(page.locator(".v2-info h3")).toHaveText("Demomeddelande");
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.waitForTimeout(420);
    const geometry = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector(selector)!;
        const box = element.getBoundingClientRect();
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom,
          height: box.height, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
      };
      return {
        documentHeight: document.documentElement.scrollHeight,
        documentWidth: document.documentElement.scrollWidth,
        sales: rect(".v2-sales-card"), copy: rect(".v2-sales-copy"),
        message: rect(".v2-message"), ribbon: rect(".v2-result-ribbon"),
        visual: rect(".v2-sales-visual"), side: rect(".v2-side"),
        shifts: rect(".v2-shifts"), tasks: rect(".v2-tasks"),
        taskPreview: rect(".v2-task-preview"),
        lastTask: rect(".v2-task-row:last-child"),
        taskManage: rect(".v2-task-manage"),
        promo: rect(".v2-station-image"), info: rect(".v2-info"),
        infoTitle: rect(".v2-info h3"), infoButton: rect(".v2-info button"),
        wash: rect(".v2-wash"),
      };
    });
    console.log(`V231 ${phase} ${width}x${height}: ${JSON.stringify({
      documentHeight: geometry.documentHeight, documentWidth: geometry.documentWidth,
      salesBottom: geometry.sales.bottom, messageBottom: geometry.message.bottom,
      promoTop: geometry.promo.top, taskBottom: geometry.tasks.bottom,
      lastTaskBottom: geometry.lastTask.bottom, taskManageBottom: geometry.taskManage.bottom,
    })}`);
    await page.screenshot({ path: join(reviewDirectory, `${width}x${height}.png`) });
    if (phase === "before") return;

    const tolerance = 1;
    expect(geometry.documentWidth).toBeLessThanOrEqual(width);
    if (width > 700) {
      expect(geometry.message.top).toBeGreaterThanOrEqual(geometry.sales.top - tolerance);
      expect(geometry.message.bottom).toBeLessThanOrEqual(geometry.sales.bottom - 2);
      expect(geometry.message.bottom).toBeLessThanOrEqual(geometry.copy.bottom + tolerance);
      expect(geometry.sales.bottom).toBeLessThanOrEqual(geometry.promo.top + tolerance);
      expect(geometry.infoTitle.top).toBeGreaterThanOrEqual(geometry.info.top - tolerance);
      expect(geometry.infoTitle.bottom).toBeLessThanOrEqual(geometry.info.bottom + tolerance);
      expect(geometry.infoButton.bottom).toBeLessThanOrEqual(geometry.info.bottom + tolerance);
      expect(geometry.lastTask.bottom).toBeLessThanOrEqual(geometry.taskPreview.bottom + tolerance);
      expect(geometry.taskManage.bottom).toBeLessThanOrEqual(geometry.tasks.bottom - 4);
      if (width >= 1300) {
        expect(geometry.shifts.bottom).toBeLessThanOrEqual(geometry.tasks.top + tolerance);
      } else {
        expect(geometry.shifts.right).toBeLessThanOrEqual(geometry.tasks.left + tolerance);
      }
      expect(geometry.tasks.bottom).toBeLessThanOrEqual(geometry.wash.top + tolerance);
      expect(geometry.wash.bottom).toBeLessThanOrEqual(geometry.documentHeight + tolerance);
      expect(geometry.copy.scrollHeight).toBeLessThanOrEqual(geometry.copy.clientHeight + tolerance);
      expect(geometry.sales.scrollHeight).toBeLessThanOrEqual(geometry.sales.clientHeight + tolerance);
      if (height >= 700) expect(geometry.documentHeight).toBeLessThanOrEqual(height);
    }
  });
}
