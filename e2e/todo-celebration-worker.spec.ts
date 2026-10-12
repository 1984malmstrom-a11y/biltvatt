import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fixture } from "../tests/fixture";

const previewDir = process.env.TODO_PREVIEW_DIR;
if (previewDir) mkdirSync(previewDir, { recursive: true });

async function realStation(page: Page, names = ["Fyll på kaffehyllan", "Kontrollera leveransen", "Städa entrén", "Se över kylen"]) {
  const station = fixture(); // Real Worker handlers and an isolated, migrated SQLite D1 adapter.
  const admin = await station.login();
  const activation = await station.call("/admin/station/activation-codes", "POST", { device_label: "To-do test" }, admin);
  expect(activation.status).toBe(200);
  const { code } = await activation.json() as { code: string };
  const activated = await station.call("/station/activate", "POST", { code });
  expect(activated.status).toBe(200);
  const viewer = activated.headers.get("Set-Cookie")!.split(";")[0];
  for (const text of names) expect((await station.call("/station/v2/tasks", "POST", { text }, viewer)).status).toBe(201);
  const initial = await (await station.call("/station/v2", "GET", undefined, viewer)).json() as {
    tasks: { id: string; text: string; revision: number; recurring?: boolean }[];
  };
  // Keep exactly one task incomplete, even on a Wednesday or Thursday.
  for (const task of initial.tasks.filter((row) => row.text !== names.at(-1))) {
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

async function visiblyOnScreen(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    // The celebration intentionally ignores pointer events; enable hit testing only here.
    const inlinePointerEvents = (element as HTMLElement).style.pointerEvents;
    (element as HTMLElement).style.pointerEvents = "auto";
    const onTop = element.contains(document.elementFromPoint(x, y));
    (element as HTMLElement).style.pointerEvents = inlinePointerEvents;
    return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight &&
      rect.left >= 0 && rect.right <= innerWidth && style.visibility === "visible" &&
      Number(style.opacity) > 0 && onTop;
  });
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
    expect(await visiblyOnScreen(page, ".v2-tasks .v32-task-celebration")).toBe(true);
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
    expect(await visiblyOnScreen(page, ".v2-modal .v32-task-celebration-modal")).toBe(true);
    await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(initialCount));
    if (previewDir) await page.screenshot({ path: join(previewDir, "todo-celebration-popup-1366.png") });
  } finally { releaseSales?.(); await page.unrouteAll({ behavior: "wait" }); station.db.close(); }
});

test("lyckad Worker-uppdatering firas även när efterföljande To-do-GET misslyckas", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const { station, initialCount } = await realStation(page);
  try {
    await page.goto("/station?weather-demo=1");
    const card = page.locator(".v2-tasks");
    await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(initialCount - 1));
    await page.route("**/api/station/v2", (route) => route.fulfill({ status: 503, json: { error: "Tillfälligt läsfel" } }));
    await card.getByRole("button", { name: /Se över kylen/ }).click();
    expect((station.db.prepare("SELECT done FROM station_tasks WHERE text='Se över kylen'").get() as { done: number }).done).toBe(1);
    await expect(card.getByText("Snyggt jobbat, team Tingsryd!")).toBeVisible();
  } finally { await page.unrouteAll({ behavior: "wait" }); station.db.close(); }
});

test("enda uppgiften firas först efter långsamt PUT och syns även med reducerad rörelse", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { station } = await realStation(page, ["Se över kylen"]);
  let releaseWrite: (() => void) | undefined;
  const heldWrite = new Promise<void>((resolve) => { releaseWrite = resolve; });
  let writeStarted = false;
  try {
    await page.goto("/station?weather-demo=1");
    const card = page.locator(".v2-tasks");
    await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    await page.route("**/api/station/v2/tasks/**", async (route) => {
      writeStarted = true;
      await heldWrite;
      await route.fallback();
    });
    await card.getByRole("button", { name: /Se över kylen/ }).click();
    await expect.poll(() => writeStarted).toBe(true);
    await expect(card.locator(".v32-task-celebration")).toHaveCount(0);
    releaseWrite?.();
    await expect(card.getByText("Snyggt jobbat, team Tingsryd!")).toBeVisible();
    expect(await visiblyOnScreen(page, ".v2-tasks .v32-task-celebration")).toBe(true);
    expect(await card.locator(".v32-task-celebration").evaluate((element) =>
      getComputedStyle(element, "::before").animationName)).toBe("none");
    await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    if (previewDir) await page.screenshot({ path: join(previewDir, "todo-celebration-single-desktop-1366.png") });
  } finally { releaseWrite?.(); await page.unrouteAll({ behavior: "wait" }); station.db.close(); }
});

test("annan enhet kan lägga till uppgift eller orsaka revisionskonflikt utan felaktigt firande", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const { station, viewer, initialCount } = await realStation(page);
  try {
    await page.goto("/station?weather-demo=1");
    const card = page.locator(".v2-tasks");
    await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(initialCount - 1));
    expect((await station.call("/station/v2/tasks", "POST", { text: "Tillagd på annan enhet" }, viewer)).status).toBe(201);
    await card.getByRole("button", { name: /Se över kylen/ }).click();
    await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(initialCount));
    await expect(card.locator(".v32-task-celebration")).toHaveCount(0);
    await expect(card.locator(".v2-panel-head span")).toHaveText(`${initialCount} av ${initialCount + 1} klara`);
    await expect(card.locator(".v2-task-row").first()).toContainText("Tillagd på annan enhet");
    const task = (await (await station.call("/station/v2", "GET", undefined, viewer)).json() as {
      tasks: { id: string; text: string; revision: number }[];
    }).tasks.find((row) => row.text === "Tillagd på annan enhet")!;
    expect((await station.call(`/station/v2/tasks/${task.id}`, "PUT", {
      text: task.text, done: true, expected_revision: task.revision,
    }, viewer)).status).toBe(200);
    await card.getByRole("button", { name: /Tillagd på annan enhet/ }).click();
    await expect(card.locator(".v32-task-celebration")).toHaveCount(0);
    await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(initialCount + 1));
  } finally { await page.unrouteAll({ behavior: "wait" }); station.db.close(); }
});
