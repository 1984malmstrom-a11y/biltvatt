import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fixture } from "../tests/fixture";

const previewDir = process.env.TODO_PREVIEW_DIR;
if (previewDir) mkdirSync(previewDir, { recursive: true });

async function realStation(page: Page) {
  const station = fixture(); // Real Worker handlers and an isolated, migrated SQLite D1 adapter.
  const admin = await station.login();
  const activation = await station.call("/admin/station/activation-codes", "POST", { device_label: "To-do test" }, admin);
  expect(activation.status).toBe(200);
  const { code } = await activation.json() as { code: string };
  const activated = await station.call("/station/activate", "POST", { code });
  expect(activated.status).toBe(200);
  const viewer = activated.headers.get("Set-Cookie")!.split(";")[0];
  const names = ["Fyll på kaffehyllan", "Kontrollera leveransen", "Städa entrén", "Se över kylen"];
  for (const text of names) expect((await station.call("/station/v2/tasks", "POST", { text }, viewer)).status).toBe(201);
  const initial = await (await station.call("/station/v2", "GET", undefined, viewer)).json() as {
    tasks: { id: string; text: string; revision: number; recurring?: boolean }[];
  };
  // Keep exactly one task incomplete, even on a Wednesday or Thursday.
  for (const task of initial.tasks.filter((row) => row.text !== "Se över kylen")) {
    expect((await station.call(`/station/v2/tasks/${task.id}`, "PUT", {
      text: task.text, done: true, expected_revision: task.revision,
    }, viewer)).status).toBe(200);
  }
  await page.route("**/api/station/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postData();
    const response = await station.call(
      `${url.pathname.slice(4)}${url.search}`,
      request.method(),
      body ? JSON.parse(body) as unknown : undefined,
      viewer,
    );
    await route.fulfill({ status: response.status, body: await response.text(), contentType: "application/json" });
  });
  return { station, viewer, names, initialCount: initial.tasks.length };
}

test("riktig Worker: sista uppgiften firas på kassaskärm trots misslyckad försäljningshämtning", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const { station, initialCount } = await realStation(page);
  let salesReads = 0;
  await page.route("**/api/station/dashboard", async (route) => {
    salesReads++;
    if (salesReads > 1) return route.fulfill({ status: 503, json: { error: "Försäljning tillfälligt nere" } });
    return route.fallback();
  });
  try {
    await page.goto("/station?weather-demo=1");
    const card = page.locator(".v2-tasks");
    await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(initialCount - 1));
    await expect(card.locator(".v2-task-row").first()).toContainText("Se över kylen");
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => salesReads).toBeGreaterThan(1);
    await card.getByRole("button", { name: /Se över kylen/ }).click();
    await expect(card.getByText("Snyggt jobbat, team Tingsryd!")).toBeVisible();
    await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(initialCount));
    await expect(card).toHaveClass(/is-celebrating/);
    if (previewDir) await page.screenshot({ path: join(previewDir, "todo-celebration-cashier-1024.png") });
    await expect(card.getByText("Snyggt jobbat, team Tingsryd!")).toHaveCount(0, { timeout: 3000 });
    await page.reload();
    await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(initialCount));
    await expect(card.locator(".v32-task-celebration")).toHaveCount(0);
    await card.getByRole("button", { name: /Se över kylen/ }).click();
    await expect(card.locator(".v2-task-row").first()).toContainText("Se över kylen");
    await card.getByRole("button", { name: /Se över kylen/ }).click();
    await expect(card.getByText("Snyggt jobbat, team Tingsryd!")).toBeVisible();
  } finally { await page.unrouteAll({ behavior: "wait" }); station.db.close(); }
});

test("riktig Worker: popupen visar firandet utan att vänta på långsam försäljning", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const { station, initialCount } = await realStation(page);
  let salesReads = 0;
  let releaseSales: (() => void) | undefined;
  const salesHold = new Promise<void>((resolve) => { releaseSales = resolve; });
  await page.route("**/api/station/dashboard", async (route) => {
    salesReads++;
    if (salesReads > 1) await salesHold;
    return route.fallback();
  });
  try {
    await page.goto("/station?weather-demo=1");
    const card = page.locator(".v2-tasks");
    await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(initialCount - 1));
    await card.locator(".v2-task-manage").click();
    const dialog = page.getByRole("dialog", { name: "Dagens to-do" });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => salesReads).toBeGreaterThan(1);
    await dialog.getByRole("button", { name: /Se över kylen/ }).click();
    await expect(dialog.getByText("Snyggt jobbat, team Tingsryd!")).toBeVisible();
    await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(initialCount));
    if (previewDir) await page.screenshot({ path: join(previewDir, "todo-celebration-popup-1366.png") });
  } finally { releaseSales?.(); await page.unrouteAll({ behavior: "wait" }); station.db.close(); }
});
