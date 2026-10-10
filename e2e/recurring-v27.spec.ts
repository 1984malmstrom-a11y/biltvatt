import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { addDays } from "../worker/stats";
import { recurringTaskForDay } from "../shared/recurring-tasks";

const previewDir = process.env.V27_PREVIEW_DIR;
if (previewDir) mkdirSync(previewDir, { recursive: true });

async function syntheticStation(page: Page, firstDay: string) {
  const state = { day: firstDay, done: false, revision: 0, reads: 0 };
  const manual = [
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", text: "Kontrollera kylar", done: 1, revision: 0, created_at: "2026-10-14T07:00:00Z" },
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", text: "Fyll på kaffe", done: 0, revision: 0, created_at: "2026-10-14T07:01:00Z" },
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", text: "Gå igenom leverans", done: 0, revision: 0, created_at: "2026-10-14T07:02:00Z" },
  ];
  await page.route("**/api/station/dashboard", (route) => route.fulfill({ json: {
    business_date: addDays(state.day, -1), comparison_date: addDays(state.day, -365),
    net_sales_ore: 3845000, comparison_sales_ore: 3408700,
    difference_ore: 436300, percent: 12.8, updated_at: null,
    week: [
      { date: addDays(state.day, -3), net_sales_ore: 3200000, comparison_sales_ore: 2980000, percent: 7.4 },
      { date: addDays(state.day, -2), net_sales_ore: 3500000, comparison_sales_ore: 3100000, percent: 12.9 },
      { date: addDays(state.day, -1), net_sales_ore: 3845000, comparison_sales_ore: 3408700, percent: 12.8 },
    ],
  } }));
  await page.route("**/api/station/v2", (route) => {
    state.reads++;
    const recurring = recurringTaskForDay(state.day);
    return route.fulfill({ json: {
      today: state.day, updated_at: null,
      shifts: [
        { id: "shift-a", first_name: "Alva", starts_at: "06:00", ends_at: "14:00" },
        { id: "shift-b", first_name: "Bo", starts_at: "14:00", ends_at: "22:00" },
      ],
      tasks: [
        ...(recurring ? [{ ...recurring, recurring: true, done: state.done ? 1 : 0, revision: state.revision, created_at: `${state.day}T00:00:00` }] : []),
        ...manual,
      ],
      notices: [{ id: "notice-demo", title: "Demoinformation", message: "Syntetisk information för visuell granskning.", updated_at: "" }],
    } });
  });
  await page.route("**/api/station/v2/tasks/**", (route) => {
    const data = route.request().postDataJSON() as { text: string; done: boolean; expected_revision: number };
    const recurring = recurringTaskForDay(state.day);
    if (route.request().method() !== "PUT" || route.request().url().split("/").at(-1) !== recurring?.id ||
        data.text !== recurring.text || data.expected_revision !== state.revision) {
      return route.fulfill({ status: 409, json: { error: "Konflikt" } });
    }
    state.done = data.done;
    state.revision++;
    return route.fulfill({ json: { ok: true } });
  });
  return state;
}

async function waitForArtwork(page: Page) {
  await expect.poll(() => page.locator(".v2-ferrari-art").evaluate((image: HTMLImageElement) =>
    image.complete && image.naturalWidth > 0)).toBe(true);
}

test("onsdag: fast uppgift ligger först, räknas och kan bockas av och ångras", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-14T10:00:00Z") });
  await syntheticStation(page, "2026-10-14");
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/station?weather-demo=1");
  await waitForArtwork(page);
  const tasks = page.locator(".v2-tasks");
  const recurring = tasks.locator(".v2-task-row").first();
  await expect(recurring).toContainText("Hallmiba beställning senast 22.00");
  await expect(recurring.locator(".v2-recurring-icon")).toBeVisible();
  await expect(tasks.locator(".v2-panel-head span")).toHaveText("1 av 4 klara");
  await expect(tasks.locator(".v2-task-row").nth(1)).toContainText("Kontrollera kylar");
  if (previewDir) await page.screenshot({ path: `${previewDir}/dashboard-onsdag.png` });

  await recurring.click();
  await expect(recurring).toHaveClass(/done/);
  await expect(tasks.locator(".v2-panel-head span")).toHaveText("2 av 4 klara");
  await tasks.locator(".v2-task-manage").click();
  const dialog = page.getByRole("dialog", { name: "Dagens to-do" });
  const fixedRow = dialog.locator(".v2-detail-row").first();
  await expect(fixedRow).toContainText("Hallmiba beställning senast 22.00");
  await expect(fixedRow.getByRole("button", { name: "Ändra" })).toHaveCount(0);
  await expect(fixedRow.getByRole("button", { name: "Ta bort" })).toHaveCount(0);
  await expect(fixedRow.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "Ändra" })).toHaveCount(3);
  if (previewDir) await dialog.screenshot({ path: `${previewDir}/todo-klar.png` });
  await fixedRow.getByRole("button").click();
  await expect(fixedRow.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  await expect(tasks.locator(".v2-panel-head span")).toHaveText("1 av 4 klara");
});

test("torsdag: fast uppgift förblir synlig efter 12 och prioriteras på mobil och kassaskärmar", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-15T10:30:00Z") }); // 12:30 in Stockholm
  await syntheticStation(page, "2026-10-15");
  for (const viewport of [
    { width: 1366, height: 768 }, { width: 1536, height: 700 },
    { width: 1280, height: 1024 }, { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/station?weather-demo=1");
    const recurring = page.locator(".v2-task-row").first();
    await expect(recurring).toContainText("Tobaksbeställning senast 12.00");
    await expect(recurring).toBeVisible();
    expect(await page.evaluate(() => {
      const button = document.querySelector(".v2-task-row")!;
      const task = button.getBoundingClientRect();
      const label = button.querySelectorAll("span")[1].getBoundingClientRect();
      const icon = button.querySelector(".v2-recurring-icon")!.getBoundingClientRect();
      const panel = document.querySelector(".v2-tasks")!.getBoundingClientRect();
      return document.documentElement.scrollWidth <= innerWidth &&
        task.left >= panel.left && task.right <= panel.right && task.bottom <= panel.bottom &&
        label.right <= icon.left && icon.right <= task.right;
    })).toBe(true);
    if (previewDir && viewport.width === 1366) {
      await waitForArtwork(page);
      await page.screenshot({ path: `${previewDir}/dashboard-torsdag.png` });
    }
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/station?weather-demo=1");
  const gap = await page.evaluate(() => {
    const lovable = document.querySelector(".v2-lovable-link")!.getBoundingClientRect();
    const weather = document.querySelector(".v2-weather")!.getBoundingClientRect();
    return weather.left - lovable.right;
  });
  expect(gap).toBeGreaterThanOrEqual(35);
  await expect(page.locator(".v2-lovable-link")).toHaveCSS("margin-right", "24px");
  const movement = await page.evaluate(() => {
    const lovable = document.querySelector<HTMLElement>(".v2-lovable-link")!;
    const weather = document.querySelector(".v2-weather")!;
    const shifted = { lovable: lovable.getBoundingClientRect().left, weather: weather.getBoundingClientRect().left };
    lovable.style.marginRight = "0px";
    const original = { lovable: lovable.getBoundingClientRect().left, weather: weather.getBoundingClientRect().left };
    lovable.style.removeProperty("margin-right");
    return { lovable: original.lovable - shifted.lovable, weather: original.weather - shifted.weather };
  });
  expect(movement.lovable).toBeCloseTo(24, 0);
  expect(movement.weather).toBeCloseTo(0, 0);
  if (previewDir) await page.locator(".v2-header").screenshot({ path: `${previewDir}/header-lovable.png` });
});

test("svensk midnatt byter onsdagens uppgift mot torsdagens medan dashboarden står öppen", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-14T21:59:58Z") });
  const state = await syntheticStation(page, "2026-10-14");
  await page.goto("/station?weather-demo=1");
  await expect(page.locator(".v2-task-row").first()).toContainText("Hallmiba beställning senast 22.00");
  const reads = state.reads;
  state.day = "2026-10-15";
  state.done = false;
  state.revision = 0;
  await page.clock.fastForward(2500);
  await expect(page.locator(".v2-task-row").first()).toContainText("Tobaksbeställning senast 12.00");
  expect(state.reads).toBeGreaterThan(reads);
});
