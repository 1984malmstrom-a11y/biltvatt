import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { emptyHandbookContent, type HandbookContent } from "../shared/handbook";
import { recurringTaskForDay } from "../shared/recurring-tasks";
import type { WasteItem } from "../shared/waste";

const previewDir = process.env.V30_PREVIEW_DIR;
if (previewDir) mkdirSync(previewDir, { recursive: true });
const wasteRows: WasteItem[] = Array.from({ length: 12 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  product_name: `Syntetisk produkt ${index + 1}`, expires_on: ["2026-10-12", "2026-10-14", "2026-10-15", "2026-10-18"][index % 4],
  resolved: index >= 10 ? 1 : 0, revision: 1, created_at: `2026-10-01T00:00:${String(index).padStart(2, "0")}Z`, updated_at: "2026-10-01T00:00:00Z",
}));
async function mock(page: Page) {
  await page.route("**/api/station/dashboard", (route) => route.fulfill({ json: {
    business_date: "2026-10-13", comparison_date: "2025-10-14", net_sales_ore: 2539300,
    comparison_sales_ore: 2483600, difference_ore: 55700, percent: 2.2, updated_at: null,
    week: Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${String(i + 7).padStart(2, "0")}`, net_sales_ore: 2000000 + i * 90000, comparison_sales_ore: 1900000, percent: 3 })),
  } }));
  await page.route("**/api/station/v2", (route) => route.fulfill({ json: {
    today: "2026-10-14", shifts: [
      { id: "1", first_name: "Mira", starts_at: "07:30", ends_at: "15:30" },
      { id: "2", first_name: "Malvina", starts_at: "10:15", ends_at: "14:00" },
      { id: "3", first_name: "Thim", starts_at: "14:00", ends_at: "22:15" },
    ], tasks: [
      { ...recurringTaskForDay("2026-10-14")!, recurring: true, done: 0, revision: 0 },
      { id: "1", text: "Kontrollera dagens leverans", done: 0, revision: 1 },
      { id: "2", text: "Fyll på kaffe", done: 1, revision: 1 },
      { id: "3", text: "Gå igenom leverans", done: 0, revision: 1 },
    ],
    notices: [{ id: "1", title: "Tävling – måndag", message: "Läs hela meddelandet i Viktig info.", updated_at: "" }],
  } }));
  await page.route("**/api/station/weather", (route) => route.fulfill({ json: { source: "SMHI", kind: "forecast", now: { time: "2026-10-14T10:00:00Z", temperature: 9, symbol: 3 }, tomorrow: { time: "2026-10-15T10:00:00Z", temperature: 8, symbol: 4 } } }));
  await page.route("**/api/station/waste**", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { items: wasteRows } });
    return route.fulfill({ json: { ok: true } });
  });
}
function routine(kind: "opening" | "closing"): HandbookContent {
  const content = emptyHandbookContent();
  for (const [index, time] of ["05:30", "06:00", "07:00"].entries()) {
    content.blocks.push({ type: "heading", text: kind === "opening" ? time : ["17:00", "19:30", "21:30"][index], level: 2 });
    for (let i = 0; i < 8; i++) content.blocks.push({ type: "check", id: `00000000-0000-4000-8000-${String(index * 8 + i + (kind === "closing" ? 100 : 1)).padStart(12, "0")}`, text: `Syntetiskt ${kind === "opening" ? "öppnings" : "stängnings"}moment ${index * 8 + i + 1}` });
  }
  return content;
}
async function mockHandbook(page: Page) {
  await page.route("**/api/station/handbook**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/station/handbook") return route.fulfill({ json: { documents: ["bakeoff", "opening", "closing", "freshfood"].map((kind) => ({ kind, title: kind === "bakeoff" ? "Bakeoff – Upplockningsschema" : kind === "opening" ? "Öppningsrutiner" : kind === "closing" ? "Stängningsrutiner" : "FreshFood", description: "", available: true })) } });
    const kind = path.split("/")[4] as "bakeoff" | "opening" | "closing" | "freshfood";
    const content = kind === "opening" || kind === "closing" ? routine(kind) : emptyHandbookContent();
    if (kind === "bakeoff") for (const group of ["Huvudvagn", "Reservvagn", "Frysen"]) content.blocks.push({ type: "heading", text: group, level: 2 }, { type: "table", rows: [["Produkt", "Antal"], ["Syntetisk bulle", "8 st"]] });
    return route.fulfill({ json: { kind, id: "synthetic", title: kind === "bakeoff" ? "Bakeoff – Upplockningsschema" : kind === "opening" ? "Öppningsrutiner" : "Stängningsrutiner", description: "Syntetiskt exempel", content, day: "2026-10-11", checks: content.blocks.filter((block) => block.type === "check").slice(0, kind === "opening" ? 5 : 3).map((block) => ({ item_id: block.id, done: 1, revision: 1 })) } });
  });
}

test("V3.0 dashboard och Svinnlista på samtliga skärmar", async ({ page }) => {
  test.setTimeout(90000);
  await page.clock.install({ time: new Date("2026-10-14T09:00:00Z") });
  await mock(page);
  for (const [width, height, file] of [[1920,1080,"01-dashboard-1920.png"],[1536,864,""],[1440,900,""],[1366,768,"02-dashboard-1366.png"],[1280,1024,""],[1024,768,"03-kassaskarm-1024.png"],[1024,650,"13-kassaskarm-1024x650.png"],[390,844,""]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/station");
    await expect(page.locator(".v2-waste .waste-row")).toHaveCount(5);
    await expect(page.locator(".v2-info h3")).toHaveText("Tävling – måndag");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width >= 1366 && height >= 768) expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height);
    if (width === 1920 || width === 1366 || width === 1024 && height === 768) {
      const wash = page.locator(".v30-top-pair .v2-wash");
      const fontSize = await wash.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
      expect(fontSize).toBeGreaterThanOrEqual(width === 1920 ? 24 : 20);
      const card = await wash.boundingBox();
      const icon = await wash.locator("svg").first().boundingBox();
      const label = await wash.locator("span").boundingBox();
      expect(icon!.width).toBeGreaterThanOrEqual(42);
      expect(icon!.x).toBeGreaterThanOrEqual(card!.x);
      expect(label!.x + label!.width).toBeLessThanOrEqual(card!.x + card!.width);
      expect(icon!.y + icon!.height).toBeLessThanOrEqual(width === 1024 ? card!.y + card!.height : label!.y);
    }
    if (width === 1366) {
      expect(await page.locator(".v30-top-pair .v2-shift-row").first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(15);
      expect(await page.locator(".v2-waste .waste-row-copy strong").first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(13);
      if (previewDir) {
        await page.locator(".v30-top-pair .v2-wash").screenshot({ path: join(previewDir, "11-tvattligan-narbild.png") });
        await page.locator(".v2-waste").screenshot({ path: join(previewDir, "12-svinnlistan-narbild.png") });
      }
    }
    if (width === 1024) {
      const tasks = page.locator(".v2-side .v2-tasks");
      await expect(tasks.locator(".v2-task-row:visible")).toHaveCount(4);
      await expect(tasks.locator(".v2-task-row").first()).toContainText("Hallmiba beställning senast 22.00");
      await expect(tasks.getByRole("progressbar")).toBeVisible();
      await expect(tasks.getByRole("button", { name: "Lägg till eller hantera" })).toBeVisible();
      const todo = await tasks.boundingBox();
      const staff = await page.locator(".v30-top-pair .v2-shifts").boundingBox();
      const wash = await page.locator(".v30-top-pair .v2-wash").boundingBox();
      expect(todo!.x + todo!.width).toBeLessThanOrEqual(staff!.x);
      expect(staff!.y + staff!.height).toBeLessThanOrEqual(wash!.y);
      expect(await tasks.locator(".v2-task-row").first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(15);
      const check = await tasks.locator(".v2-check").first().boundingBox();
      expect(check!.width).toBeGreaterThanOrEqual(24);
      expect(check!.height).toBe(check!.width);
      if (previewDir) await tasks.screenshot({ path: join(previewDir, height === 768 ? "14-todo-1024x768.png" : "15-todo-1024x650.png") });
    }
    if (width === 1024 && height === 768) {
      const lastRow = await page.locator(".v2-waste .waste-row").last().boundingBox();
      const more = await page.getByRole("button", { name: "Se hela listan →" }).boundingBox();
      const card = await page.locator(".v30-bottom").boundingBox();
      const footer = await page.locator(".v2-footer").boundingBox();
      expect(lastRow!.y + lastRow!.height).toBeLessThanOrEqual(more!.y);
      expect(card!.y + card!.height).toBeLessThanOrEqual(footer!.y);
    }
    if (file && previewDir) await page.screenshot({ path: join(previewDir, file), fullPage: true });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/station");
  await page.getByRole("button", { name: "Se hela listan →" }).click();
  const dialog = page.getByRole("dialog", { name: "Svinnlistan" });
  await expect(dialog.locator(".waste-list .waste-row")).toHaveCount(10);
  if (previewDir) await page.screenshot({ path: join(previewDir, "04-svinnlista-popup.png") });
  await expect(dialog.locator(".waste-tomorrow").first()).toContainText("Går ut imorgon");
  await expect(dialog.locator(".waste-today").first()).toContainText("Går ut idag");
  await expect(dialog.locator(".waste-expired").first()).toContainText("Utgånget");
  if (previewDir) await dialog.screenshot({ path: join(previewDir, "05-datumvarningar.png") });
  await dialog.getByRole("tab", { name: /Åtgärdade/ }).click();
  await expect(dialog.locator(".waste-list .waste-row")).toHaveCount(2);
  await dialog.getByRole("tab", { name: /Aktiva/ }).click();
  await page.clock.fastForward(13 * 60 * 60 * 1000);
  await expect(dialog.locator(".waste-today")).toHaveCount(2);
  await expect(dialog.locator(".waste-tomorrow")).toHaveCount(0);
});

test("V3.0 Personalpärm visar kvadratiska tvåkolumnsrutiner och separat tom helg", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-11T09:00:00Z") });
  await page.setViewportSize({ width: 1366, height: 768 });
  await mock(page); await mockHandbook(page); await page.goto("/station");
  await page.getByRole("button", { name: "Personalpärm", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Personalpärmen" });
  for (const [label, file] of [["Öppningsrutiner", "06-oppningsrutiner.png"],["Stängningsrutiner", "07-stangningsrutiner.png"]] as const) {
    await dialog.getByRole("button", { name: new RegExp(label) }).click();
    const grid = dialog.locator(".hb-blocks");
    expect(await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(2);
    const box = await dialog.locator(".hb-check input").first().boundingBox();
    expect(box?.width).toBe(24); expect(box?.height).toBe(24);
    if (previewDir) await page.screenshot({ path: join(previewDir, file) });
    await dialog.getByRole("button", { name: "Till Personalpärmen" }).click();
  }
  await dialog.getByRole("button", { name: /Bakeoff/ }).click();
  await dialog.getByRole("tab", { name: "VARDAGAR" }).click();
  await expect(dialog.locator(".hb-bakeoff-group")).toHaveCount(3);
  await page.waitForTimeout(250);
  if (previewDir) await page.screenshot({ path: join(previewDir, "08-bakeoff-vardagar.png") });
  await dialog.getByRole("tab", { name: "HELG" }).click();
  await expect(dialog).toContainText("Helgens upplockningsschema är ännu inte inlagt.");
  await page.waitForTimeout(250);
  if (previewDir) await page.screenshot({ path: join(previewDir, "09-bakeoff-helg.png") });
});

test("V3.0 Stationsadmin kan redigera och lägga till checklistemoment", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/admin/station/store-sales", (route) => route.fulfill({ json: { yesterday: "2026-10-10", rows: [] } }));
  await page.route("**/api/admin/station/view-sessions", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/station/v2/schedule", (route) => route.fulfill({ json: { periods: [], shifts: [] } }));
  await page.route("**/api/admin/station/v2/notices", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/station/v2/monthly", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/station/handbook", (route) => route.fulfill({ json: { documents: ["bakeoff", "opening", "closing", "freshfood"].map((kind) => ({ kind, revision: 0, draft: null, published: kind === "opening" ? { id: "synthetic", title: "Öppningsrutiner", description: "Syntetisk rutin", content: routine("opening"), published_at: "2026-10-10" } : null })) } }));
  await page.goto("/station/admin");
  const admin = page.locator(".hb-admin");
  await admin.getByRole("tab", { name: "Öppningsrutiner" }).click();
  await admin.getByRole("textbox", { name: "Redigera check 2", exact: true }).fill("Korrigerat syntetiskt öppningsmoment");
  await admin.getByRole("button", { name: "Moment", exact: true }).click();
  await expect(admin.locator(".hb-change-summary")).toContainText("Korrigerat syntetiskt öppningsmoment");
  await admin.getByRole("button", { name: "Förhandsgranska" }).click();
  if (previewDir) await admin.screenshot({ path: join(previewDir, "10-admin-rutinredigering.png") });
});
