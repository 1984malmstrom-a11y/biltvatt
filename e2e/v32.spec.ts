import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const previewDir = process.env.V32_PREVIEW_DIR;
if (previewDir) mkdirSync(previewDir, { recursive: true });

async function synthetic(page: Page) {
  const tasks = [
    { id: "00000000-0000-4000-8000-000000000001", text: "Fyll på kaffehyllan", done: 1, revision: 1, created_at: "2026-10-14T07:00:00Z" },
    { id: "00000000-0000-4000-8000-000000000002", text: "Kontrollera leveransen", done: 0, revision: 0, created_at: "2026-10-14T07:01:00Z" },
  ];
  const taskEvents = [
    { id: 4, task_date: "2026-10-14", action: "completed", occurred_at: "2026-10-14T12:32:00Z", label: "Fyll på kaffehyllan" },
    { id: 3, task_date: "2026-10-14", action: "reopened", occurred_at: "2026-10-14T12:21:00Z", label: "Kontrollera leveransen" },
    { id: 2, task_date: "2026-10-14", action: "edited", occurred_at: "2026-10-14T11:12:00Z", label: "Kontrollera leveransen" },
    { id: 1, task_date: "2026-10-14", action: "created", occurred_at: "2026-10-14T08:15:00Z", label: "Kontrollera leveransen" },
  ];
  const waste = [{ id: "00000000-0000-4000-8000-000000000010", product_name: "Syntetisk mjölk 1 L", expires_on: "2026-10-15", resolved: 0, revision: 1, created_at: "2026-10-14T07:00:00Z" }];
  const wasteEvents = [
    { id: 3, action: "date_changed", occurred_at: "2026-10-14T10:03:00Z", label: "Syntetisk mjölk 1 L", old_expires_on: "2026-10-14", new_expires_on: "2026-10-15" },
    { id: 2, action: "resolved", occurred_at: "2026-10-14T09:42:00Z", label: "Syntetisk mjölk 1 L", old_expires_on: null, new_expires_on: null },
    { id: 1, action: "created", occurred_at: "2026-10-14T08:15:00Z", label: "Syntetisk mjölk 1 L", old_expires_on: null, new_expires_on: "2026-10-14" },
  ];
  await page.route("**/api/station/dashboard", (route) => route.fulfill({ json: {
    business_date: "2026-10-13", comparison_date: "2025-10-14", net_sales_ore: 2539300,
    comparison_sales_ore: 2483600, difference_ore: 55700, percent: 2.2, updated_at: null, week: [],
  } }));
  await page.route("**/api/station/v2", (route) => route.fulfill({ json: {
    today: "2026-10-14", shifts: [], tasks, notices: [], updated_at: null,
  } }));
  await page.route("**/api/station/v2/tasks/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/history")) return route.fulfill({ json: { events: taskEvents, next_cursor: null } });
    const task = tasks.find((row) => path.endsWith(row.id))!;
    const payload = route.request().postDataJSON() as { done: boolean };
    task.done = payload.done ? 1 : 0; task.revision++;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/station/waste**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path.endsWith("/history") ? { events: wasteEvents, next_cursor: null } : { items: waste } });
  });
  await page.route("**/api/station/handbook", (route) => route.fulfill({ json: { documents: [
    { kind: "bakeoff", title: "Bakeoff – Upplockningsschema", description: "Veckans upplockning", published_at: "2026-10-13T09:00:00Z", available: true },
    { kind: "opening", title: "Öppningsrutiner", description: "Starta dagen", published_at: "2026-10-05T09:00:00Z", available: true },
    { kind: "closing", title: "Stängningsrutiner", description: "Avsluta dagen", published_at: "2026-10-14T08:00:00Z", available: true },
    { kind: "freshfood", title: "FreshFood", description: "Mat och märkning", published_at: null, available: false },
  ] } }));
  return { tasks };
}

test("firande efter bekräftad sista uppgift, ingen repris vid omladdning och reducerad rörelse", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-14T12:00:00Z") });
  await page.setViewportSize({ width: 1024, height: 768 });
  await synthetic(page);
  await page.goto("/station?weather-demo=1");
  const card = page.locator(".v2-tasks");
  await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  await card.getByRole("button", { name: /Kontrollera leveransen/ }).click();
  await expect(card.getByText("Snyggt jobbat, team Tingsryd!")).toBeVisible();
  await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
  if (previewDir) await page.screenshot({ path: join(previewDir, "01-todo-firande-1024.png") });
  await page.clock.runFor(1400);
  await expect(card.getByText("Snyggt jobbat, team Tingsryd!")).toBeVisible();
  await page.clock.runFor(500);
  await expect(card.getByText("Snyggt jobbat, team Tingsryd!")).toHaveCount(0);
  await page.reload();
  await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
  await expect(card.getByText("Snyggt jobbat, team Tingsryd!")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await card.getByRole("button", { name: /Kontrollera leveransen/ }).click();
  await card.getByRole("button", { name: /Kontrollera leveransen/ }).click();
  await expect(card.getByText("Snyggt jobbat, team Tingsryd!")).toBeVisible();
  await expect(card.locator(".v32-task-celebration")).toHaveCSS("animation-name", "none");
});

test("tom lista och misslyckad serverändring ger inget firande", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-14T12:00:00Z") });
  await synthetic(page);
  await page.route("**/api/station/v2", (route) => route.fulfill({ json: {
    today: "2026-10-14", shifts: [], tasks: [], notices: [], updated_at: null,
  } }));
  await page.goto("/station?weather-demo=1");
  const card = page.locator(".v2-tasks");
  await expect(card.getByText("Inga uppgifter för idag.")).toBeVisible();
  await page.clock.runFor(1600);
  await expect(card.locator(".v32-task-celebration")).toHaveCount(0);
  await page.unroute("**/api/station/v2");
  await synthetic(page);
  await page.route("**/api/station/v2/tasks/00000000-0000-4000-8000-000000000002", (route) =>
    route.fulfill({ status: 409, json: { error: "Revisionskonflikt" } }));
  await page.reload();
  await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  await card.getByRole("button", { name: /Kontrollera leveransen/ }).click();
  await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  await expect(card.locator(".v32-task-celebration")).toHaveCount(0);
});

test("NYTT och händelsehistorik i befintliga popupfönster på desktop och mobil", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-14T12:00:00Z") });
  await synthetic(page);
  for (const [width, height] of [[1366, 768], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/station?weather-demo=1");
    await page.getByRole("button", { name: /Personalpärm/ }).first().click();
    const handbook = page.getByRole("dialog", { name: "Personalpärmen" });
    await expect(handbook.locator(".hb-card-new")).toHaveCount(2);
    await expect(handbook.locator(".hb-card").filter({ hasText: "Öppningsrutiner" }).locator(".hb-card-new")).toHaveCount(0);
    if (previewDir) await handbook.screenshot({ path: join(previewDir, width === 1366 ? "02-personalparm-nytt.png" : "05-mobil-personalparm.png") });
    await handbook.getByRole("button", { name: "Stäng Personalpärmen" }).click();
    await page.locator(".v2-tasks").getByRole("button", { name: "Lägg till eller hantera" }).click();
    const todo = page.getByRole("dialog", { name: "Dagens to-do" });
    await todo.getByRole("button", { name: "Visa historik" }).click();
    await expect(todo.locator(".v32-history-list li")).toHaveCount(4);
    await expect(todo.locator(".v32-history-list li").first()).toContainText("14:32");
    if (previewDir) await todo.screenshot({ path: join(previewDir, width === 1366 ? "03-todo-historik.png" : "06-mobil-todo-historik.png") });
    await todo.getByRole("button", { name: "Till dagens uppgifter" }).click();
    await expect(todo.getByRole("button", { name: "Visa historik" })).toBeVisible();
    await todo.getByRole("button", { name: "Stäng" }).click();
    await page.getByRole("button", { name: "Se hela listan →" }).click();
    const wasteDialog = page.getByRole("dialog", { name: "Svinnlistan" });
    await wasteDialog.getByRole("button", { name: "Visa historik" }).click();
    await expect(wasteDialog.locator(".v32-history-list li")).toHaveCount(3);
    await expect(wasteDialog.getByText(/14\/10 till 15\/10/)).toBeVisible();
    if (previewDir) await wasteDialog.screenshot({ path: join(previewDir, width === 1366 ? "04-svinn-historik.png" : "07-mobil-svinn-historik.png") });
    await wasteDialog.getByRole("button", { name: "Till Svinnlistan" }).click();
    await expect(wasteDialog.getByRole("button", { name: "Visa historik" })).toBeVisible();
    await wasteDialog.getByRole("button", { name: "Stäng Svinnlistan" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
