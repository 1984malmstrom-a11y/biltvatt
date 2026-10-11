import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { recurringTaskForDay } from "../shared/recurring-tasks";

const previewDir = process.env.V31_PREVIEW_DIR;
if (previewDir) mkdirSync(previewDir, { recursive: true });

async function syntheticDashboard(page: Page) {
  const recurring = recurringTaskForDay("2026-10-14")!;
  const tasks = [
    { ...recurring, recurring: true, done: 1, revision: 1, created_at: "2026-10-14T00:00:00Z" },
    { id: "manual-a", text: "Redan klar A", done: 1, revision: 1, created_at: "2026-10-14T07:00:00Z" },
    { id: "manual-b", text: "Redan klar B", done: 1, revision: 1, created_at: "2026-10-14T07:01:00Z" },
    { id: "manual-open", text: "Kontrollera dagens leverans", done: 0, revision: 1, created_at: "2026-10-14T07:02:00Z" },
  ];
  await page.route("**/api/station/dashboard", (route) => route.fulfill({ json: {
    business_date: "2026-10-13", comparison_date: "2025-10-14", net_sales_ore: 2539300,
    comparison_sales_ore: 2483600, difference_ore: 55700, percent: 2.2, updated_at: null, week: [],
  } }));
  await page.route("**/api/station/v2", (route) => route.fulfill({ json: {
    today: "2026-10-14", shifts: [], tasks, notices: [], updated_at: null,
  } }));
  await page.route("**/api/station/v2/tasks/**", (route) => {
    const id = route.request().url().split("/").at(-1);
    const task = tasks.find((item) => item.id === id)!;
    const data = route.request().postDataJSON() as { done: boolean };
    task.done = data.done ? 1 : 0;
    task.revision++;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/station/waste**", (route) => route.fulfill({ json: { items: [] } }));
}

test("tre av fyra klara visar den enda öppna uppgiften först i kort och full lista", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-14T09:00:00Z") });
  await syntheticDashboard(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/station?weather-demo=1");
  const card = page.locator(".v2-tasks");
  const rows = card.locator(".v2-task-row");
  await expect(card.locator(".v2-panel-head span")).toHaveText("3 av 4 klara");
  await expect(rows.first()).toContainText("Kontrollera dagens leverans");
  await expect(rows.first()).toBeVisible();
  await card.getByRole("button", { name: "Lägg till eller hantera" }).click();
  const dialog = page.getByRole("dialog", { name: "Dagens to-do" });
  await expect(dialog.locator(".v2-detail-row").first()).toContainText("Kontrollera dagens leverans");
  await expect(dialog.locator(".v2-detail-row").nth(1)).toContainText("Hallmiba beställning senast 22.00");

  await dialog.getByRole("button", { name: /Kontrollera dagens leverans/ }).click();
  await expect(card.locator(".v2-panel-head span")).toHaveText("4 av 4 klara");
  await expect(rows.first()).toContainText("Hallmiba beställning senast 22.00");
  await dialog.getByRole("button", { name: /Kontrollera dagens leverans/ }).click();
  await expect(card.locator(".v2-panel-head span")).toHaveText("3 av 4 klara");
  await expect(rows.first()).toContainText("Kontrollera dagens leverans");
  await expect(dialog.locator(".v2-detail-row")).toHaveCount(4);
  await dialog.getByRole("button", { name: "Stäng" }).click();
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(rows.first()).toContainText("Kontrollera dagens leverans");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1366);
});

test("Ferrari-innehållet sveper inuti kortet och stannar vid reducerad rörelse", async ({ page }) => {
  await syntheticDashboard(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/station?weather-demo=1");
  const image = page.locator(".v2-ferrari-art");
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  const motion = await image.evaluate((element) => {
    const card = element.parentElement!;
    const before = card.getBoundingClientRect();
    const animation = element.getAnimations()[0];
    if (!animation) return null;
    animation.pause();
    animation.currentTime = 0;
    const start = element.getBoundingClientRect();
    const startOpacity = getComputedStyle(element).opacity;
    animation.currentTime = 680;
    const end = element.getBoundingClientRect();
    const after = card.getBoundingClientRect();
    return {
      name: getComputedStyle(element).animationName,
      duration: getComputedStyle(element).animationDuration,
      background: getComputedStyle(card).backgroundImage,
      overflow: getComputedStyle(card).overflow,
      cardStayed: before.x === after.x && before.y === after.y && before.width === after.width,
      movedFromRight: start.x > end.x,
      startOpacity,
      endOpacity: getComputedStyle(element).opacity,
    };
  });
  expect(motion).toMatchObject({
    name: "ferrari-sweep-in", duration: "0.68s", overflow: "hidden",
    cardStayed: true, movedFromRight: true, startOpacity: "0", endOpacity: "1",
  });
  expect(motion!.background).toContain("gradient");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  await page.reload();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  await page.waitForTimeout(800);
  await expect(image).toHaveCSS("opacity", "1");
  if (previewDir) await page.locator(".v2-station-image").screenshot({ path: join(previewDir, "ferrari-intro-klar.png") });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(image).toHaveCSS("animation-name", "none");
  await expect(image).toHaveCSS("opacity", "1");
});
