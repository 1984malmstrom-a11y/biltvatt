import { expect, test, type Locator, type Page } from "@playwright/test";
import JSZip from "jszip";
import { mkdirSync } from "node:fs";
import { emptyHandbookContent, HANDBOOK_KINDS, stockholmToday, stockholmWeekday, WEEKDAYS, WEEKDAY_LABELS, type HandbookContent, type HandbookKind } from "../shared/handbook";

const previewDir = process.env.V28_PREVIEW_DIR;
if (previewDir) mkdirSync(previewDir, { recursive: true });
const gridPreviewDir = process.env.V28_GRID_PREVIEW_DIR;
if (gridPreviewDir) mkdirSync(gridPreviewDir, { recursive: true });
const id1 = "f8a39c1b-6b73-4fe3-9c3e-d45a785b6221";
const id2 = "02a99ce6-57e0-49fc-a634-7551dfa61654";
function docs() {
  const bakeoff = emptyHandbookContent();
  bakeoff.blocks.push({ type: "paragraph", text: "Kontrollera alltid aktuell leverans innan upplockning." });
  for (const day of Object.keys(bakeoff.days) as (keyof HandbookContent["days"])[]) {
    bakeoff.days[day] = [{ product: "Kanelbulle", quantity: "12 st" }, { product: "Fralla", quantity: "8 st" }, { product: "Croissant", quantity: "6 st" }];
  }
  const opening = emptyHandbookContent();
  opening.blocks = [{ type: "heading", text: "Innan butiken öppnar", level: 2 }, { type: "check", id: id1, text: "Starta kaffe och kontrollera frukostytan" }, { type: "check", id: "4231c370-a7c9-43fd-9760-cf6867b3c900", text: "Fyll på kylda drycker och smörgåsar" }, { type: "check", id: "60da6430-9171-4693-b163-35861212351e", text: "Kontrollera entré och kassayta" }];
  const closing = emptyHandbookContent();
  closing.blocks = [{ type: "heading", text: "När dagen avslutas", level: 2 }, { type: "check", id: id2, text: "Stäng av kaffemaskinen och rengör ytorna" }, { type: "check", id: "79913d7e-8e88-4264-a9b0-e75ed0dd6ae5", text: "Kontrollera att dörrar är låsta" }, { type: "check", id: "a7e5bcef-1957-4c1b-b843-387ffb53c86a", text: "Lämna över viktig information till nästa pass" }];
  const freshfood = emptyHandbookContent();
  freshfood.blocks = [{ type: "heading", text: "Tas upp på dagen", level: 2 }, { type: "paragraph", text: "Syntetiskt exempel för hållbarhet." }];
  return { bakeoff, opening, closing, freshfood };
}
const titles = { bakeoff: "Bakeoff – Upplockningsschema", opening: "Öppningsrutiner", closing: "Stängningsrutiner", freshfood: "FreshFood" };
function live(kind: HandbookKind, content: HandbookContent, checks: {item_id:string;done:number;revision:number}[] = []) {
  return { kind, id: `synthetic-${kind}`, title: titles[kind], description: kind === "bakeoff" ? "Dagens produkter och antal i ett tydligt veckoschema." : "Gemensam daglig checklista för hela stationen.", content, day: stockholmToday(), checks };
}
async function mockReader(page: Page) {
  const content = docs();
  const state = { opening: [{ item_id: id1, done: 1, revision: 1 }], closing: [] as {item_id:string;done:number;revision:number}[] };
  await page.route("**/api/station/handbook**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/station/handbook") return route.fulfill({ json: { documents: HANDBOOK_KINDS.map((kind) => ({ kind, title: titles[kind], description: live(kind, content[kind]).description, available: true })) } });
    const kind = pathname.split("/")[4] as HandbookKind;
    if (pathname.includes("/checks/")) {
      const item = pathname.split("/").at(-1)!;
      const data = route.request().postDataJSON() as { done: boolean; expected_revision: number };
      const checks = state[kind as "opening" | "closing"];
      const row = checks.find((entry) => entry.item_id === item);
      if ((row?.revision ?? 0) !== data.expected_revision) return route.fulfill({ status: 409, json: { error: "Statusen ändrades på annan enhet." } });
      if (row) { row.done = Number(data.done); row.revision++; }
      else checks.push({ item_id: item, done: Number(data.done), revision: 1 });
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: live(kind, content[kind], kind === "opening" || kind === "closing" ? state[kind] : []) });
  });
}
async function mockDashboard(page: Page) {
  await page.route("**/api/station/dashboard", (route) => route.fulfill({ json: { business_date: "2026-10-10", comparison_date: "2025-10-11", net_sales_ore: 2850000, comparison_sales_ore: 2600000, difference_ore: 250000, percent: 9.6, updated_at: null, week: [] } }));
  await page.route("**/api/station/v2", (route) => route.fulfill({ json: { today: "2026-10-11", shifts: [], tasks: [], notices: [{ id: "synthetic-notice", title: "Tävling – måndag", message: "Läs mer i personalpärmen om dagens rutiner.", updated_at: "2026-10-11T07:00:00Z" }], updated_at: null } }));
}
function syntheticDocx() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml", '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Upplockning</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Produkt</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Måndag</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Tisdag</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Fralla</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>12 st</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>8 st</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>');
  return zip.generateAsync({ type: "nodebuffer" });
}

async function expectChecklistColumns(dialog: Locator, width: number) {
  const geometry = await dialog.locator(".hb-blocks").evaluate((grid) => ({
    columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
    positions: [...grid.querySelectorAll<HTMLElement>(".hb-check")].slice(0, 3).map((item) => {
      const box = item.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right };
    }),
  }));
  expect(geometry.positions).toHaveLength(3);
  if (width <= 700) {
    expect(geometry.columns).toBe(1);
    expect(geometry.positions[1].left).toBeCloseTo(geometry.positions[0].left, 0);
    expect(geometry.positions[1].top).toBeGreaterThan(geometry.positions[0].top);
  } else {
    expect(geometry.columns).toBe(2);
    expect(geometry.positions[1].left).toBeGreaterThan(geometry.positions[0].right);
    expect(geometry.positions[1].top).toBeCloseTo(geometry.positions[0].top, 0);
    expect(geometry.positions[2].top).toBeGreaterThan(geometry.positions[0].top);
  }
}

test("Personalpärmen växlar vy i en tillgänglig popup och bevarar checklistestatus", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-11T10:00:00Z") });
  await mockDashboard(page);
  for (const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:1366,height:768},{width:1024,height:768},{width:1024,height:650},{width:390,height:844}]) {
    await page.unroute("**/api/station/handbook**");
    await mockReader(page);
    await page.setViewportSize(viewport);
    await page.goto("/station?weather-demo=1");
    await expect(page.locator(".v2-info").getByRole("button", { name: "Personalpärm" })).toHaveCount(0);
    await page.evaluate(() => { document.querySelector<HTMLElement>(".station-v2-shell")!.dataset.popupTestMarker = "kept"; });
    const trigger = page.getByRole("button", { name: "Personalpärm", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Personalpärmen" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".hb-card")).toHaveCount(4);
    await expect(page).toHaveURL(/\/station\?weather-demo=1$/);
    expect(await page.evaluate(() => document.getElementById("root")?.inert && document.body.style.overflow === "hidden" && document.activeElement?.closest("[role=dialog]") !== null)).toBe(true);
    expect(await page.evaluate(() => {
      const panel = document.querySelector(".hb-dialog")!.getBoundingClientRect();
      const toolbar = document.querySelector(".hb-dialog-toolbar")!.getBoundingClientRect();
      return document.documentElement.scrollWidth <= innerWidth && panel.left >= 0 && panel.right <= innerWidth && panel.top >= 0 && panel.bottom <= innerHeight && toolbar.bottom <= panel.bottom;
    })).toBe(true);
    if (previewDir && viewport.width === 1440) await page.screenshot({ path: `${previewDir}/01-dashboard-popup-desktop.png` });
    if (previewDir && viewport.width === 1024 && viewport.height === 768) await page.screenshot({ path: `${previewDir}/04-popup-cashier-1024x768.png` });
    if (previewDir && viewport.width === 390) await page.screenshot({ path: `${previewDir}/05-popup-mobile.png` });
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => document.activeElement?.closest("[role=dialog]") !== null)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dialog.getByRole("button", { name: /Bakeoff – Upplockningsschema/ }).click();
    await expect(dialog.getByRole("tab", { name: "HELG" })).toHaveAttribute("aria-selected", "true");
    await dialog.getByRole("tab", { name: "VARDAGAR" }).click();
    await expect(dialog).toContainText("Kanelbulle");
    await expect(dialog.getByRole("button", { name: "Till Personalpärmen" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(dialog.getByRole("button", { name: "Till Personalpärmen" })).toBeVisible();
    await expect(dialog.getByRole("tab", { name: "Måndag" })).toHaveAttribute("aria-selected", "true");
    if (viewport.width === 390) expect(await page.evaluate(() => {
      const tabs = [...document.querySelectorAll<HTMLElement>(".hb-dialog .hb-days button")];
      return tabs.every((tab) => tab.getBoundingClientRect().left >= 0 && tab.getBoundingClientRect().right <= innerWidth);
    })).toBe(true);
    await dialog.getByRole("tab", { name: "Tisdag" }).click();
    await expect(dialog.getByRole("tabpanel")).toContainText("Croissant");
    if (previewDir && viewport.width === 1440) await page.screenshot({ path: `${previewDir}/02-popup-bakeoff.png` });
    await dialog.getByRole("button", { name: "Till Personalpärmen" }).click();
    await expect(dialog.locator(".hb-card")).toHaveCount(4);
    await expect(dialog.getByRole("button", { name: /Bakeoff – Upplockningsschema/ })).toBeFocused();
    await dialog.getByRole("button", { name: /Öppningsrutiner/ }).click();
    await expect(dialog.getByText("1 av 3 klara")).toBeVisible();
    await expectChecklistColumns(dialog, viewport.width);
    await dialog.getByRole("checkbox").first().focus();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("checkbox").nth(1)).toBeFocused();
    await dialog.getByRole("checkbox").nth(1).click();
    await expect(dialog.getByText("2 av 3 klara")).toBeVisible();
    if (previewDir && viewport.width === 1440) await page.screenshot({ path: `${previewDir}/03-popup-opening-checked.png` });
    await dialog.getByRole("checkbox").nth(1).click();
    await expect(dialog.getByText("1 av 3 klara")).toBeVisible();
    await dialog.getByRole("checkbox").nth(1).click();
    await expect(dialog.getByText("2 av 3 klara")).toBeVisible();
    await dialog.getByRole("button", { name: "Till Personalpärmen" }).click();
    await dialog.getByRole("button", { name: /Stängningsrutiner/ }).click();
    await expect(dialog.getByText("0 av 3 klara")).toBeVisible();
    await expectChecklistColumns(dialog, viewport.width);
    await dialog.getByRole("button", { name: "Till Personalpärmen" }).click();
    await dialog.getByRole("button", { name: /Öppningsrutiner/ }).click();
    await expect(dialog.getByText("2 av 3 klara")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dialog.getByRole("button", { name: "Stäng Personalpärmen" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => !document.getElementById("root")?.inert && document.body.style.overflow === "" && document.querySelector<HTMLElement>(".station-v2-shell")?.dataset.popupTestMarker === "kept")).toBe(true);
    await trigger.click();
    await expect(dialog.locator(".hb-card")).toHaveCount(4);
    await dialog.getByRole("button", { name: /Öppningsrutiner/ }).click();
    await expect(dialog.getByText("2 av 3 klara")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    if (viewport.width === 1024 && viewport.height === 768) {
      await page.reload();
      await page.getByRole("button", { name: "Personalpärm", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: /Öppningsrutiner/ }).click();
      await expect(page.getByRole("dialog").getByText("2 av 3 klara")).toBeVisible();
    }
  }
});

test("Båda rutinerna visar långa checklistor i två kolumner på större skärmar", async ({ page }) => {
  await mockDashboard(page);
  await mockReader(page);
  const content = docs();
  for (let index = 0; index < 21; index++) {
    content.opening.blocks.push({ type: "check", id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, text: `Syntetiskt öppningsmoment ${String(index + 4).padStart(2, "0")} – kontrollera stationens ytor` });
    content.closing.blocks.push({ type: "check", id: `11111111-0000-4000-8000-${String(index).padStart(12, "0")}`, text: `Syntetiskt stängningsmoment ${String(index + 4).padStart(2, "0")} – kontrollera stationens ytor` });
  }
  const checked = (kind: "opening" | "closing", count: number) => content[kind].blocks.filter((block) => block.type === "check").slice(0, count).map((block) => ({ item_id: block.id, done: 1, revision: 1 }));
  await page.route("**/api/station/handbook/opening", (route) => route.fulfill({ json: live("opening", content.opening, checked("opening", 8)) }));
  await page.route("**/api/station/handbook/closing", (route) => route.fulfill({ json: live("closing", content.closing, checked("closing", 3)) }));
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 1024, height: 650 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/station?weather-demo=1");
    await page.getByRole("button", { name: "Personalpärm", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Personalpärmen" });
    await dialog.getByRole("button", { name: /Öppningsrutiner/ }).click();
    await expect(dialog.getByText("8 av 24 klara")).toBeVisible();
    await expect(dialog.getByText(/Syntetiskt öppningsmoment 24/)).toBeAttached();
    await expectChecklistColumns(dialog, viewport.width);
    if (gridPreviewDir && viewport.width === 1440) await page.screenshot({ path: `${gridPreviewDir}/01-opening-desktop-1440x900.png` });
    if (gridPreviewDir && viewport.width === 1024 && viewport.height === 768) await page.screenshot({ path: `${gridPreviewDir}/03-opening-cashier-1024x768.png` });
    if (gridPreviewDir && viewport.width === 390) await page.screenshot({ path: `${gridPreviewDir}/05-opening-mobile-390x844.png` });
    const before = await dialog.locator(".hb-dialog-toolbar").boundingBox();
    await dialog.locator(".hb-dialog-body").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect(await dialog.locator(".hb-dialog-body").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await dialog.locator(".hb-dialog-toolbar").boundingBox()).toEqual(before);
    await expect(dialog.getByRole("button", { name: "Stäng Personalpärmen" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.style.overflow === "hidden")).toBe(true);
    await dialog.getByRole("button", { name: "Till Personalpärmen" }).click();
    await expect(dialog.locator(".hb-card")).toHaveCount(4);
    expect(await dialog.locator(".hb-dialog-body").evaluate((element) => element.scrollTop)).toBe(0);
    await dialog.getByRole("button", { name: /Stängningsrutiner/ }).click();
    await expect(dialog.getByText("3 av 24 klara")).toBeVisible();
    await expectChecklistColumns(dialog, viewport.width);
    if (gridPreviewDir && viewport.width === 1440) await page.screenshot({ path: `${gridPreviewDir}/02-closing-desktop-1440x900.png` });
    if (gridPreviewDir && viewport.width === 1024 && viewport.height === 650) await page.screenshot({ path: `${gridPreviewDir}/04-closing-cashier-1024x650.png` });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});

test("Word-import av syntetisk tabell förhandsgranskas och kan sparas som utkast", async ({ page }) => {
  const content = docs();
  let saved: unknown = null;
  await page.route("**/api/admin/station/store-sales", (route) => route.fulfill({ json: { yesterday: "2026-10-10", rows: [] } }));
  await page.route("**/api/admin/station/view-sessions", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/station/v2/schedule", (route) => route.fulfill({ json: { periods: [], shifts: [] } }));
  await page.route("**/api/admin/station/v2/notices", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/station/v2/monthly", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/station/handbook", (route) => route.fulfill({ json: { documents: HANDBOOK_KINDS.map((kind) => ({ kind, revision: saved && kind === "bakeoff" ? 1 : 0, draft: kind === "bakeoff" ? saved : null, published: { ...live(kind, content[kind]), published_at: "2026-10-01T08:00:00Z" } })) } }));
  await page.route("**/api/admin/station/handbook/bakeoff/draft", (route) => { saved = route.request().postDataJSON(); return route.fulfill({ json: { ok: true, revision: 1 } }); });
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/station/admin");
  const admin = page.locator(".hb-admin");
  await expect(admin.getByRole("heading", { name: "Personalpärmen" })).toBeVisible();
  await admin.locator("input[type=file]").setInputFiles({ name: "syntetisk-bakeoff.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: await syntheticDocx() });
  await expect(admin.locator(".hb-day-edit").first()).toBeVisible();
  await expect(admin.locator(".hb-day-edit").first()).toContainText("");
  await expect(admin.getByRole("textbox", { name: "Produkt 1" })).toHaveValue("Fralla");
  await expect(admin.getByRole("textbox", { name: "Antal 1" })).toHaveValue("12 st");
  await admin.getByRole("button", { name: "Förhandsgranska" }).click();
  await admin.locator(".hb-admin-preview").getByRole("tab", { name: "VARDAGAR" }).click();
  await admin.locator(".hb-admin-preview").getByRole("tab", { name: "Måndag" }).click();
  await expect(admin.locator(".hb-admin-preview")).toContainText("Fralla");
  await admin.getByRole("button", { name: "Spara utkast" }).click();
  await expect(admin.getByText("Utkastet är sparat. Det syns ännu inte för personalen.")).toBeVisible();
  expect(saved).toMatchObject({ reviewed: false, content: { days: { monday: [{ product: "Fralla", quantity: "12 st" }], tuesday: [{ product: "Fralla", quantity: "8 st" }] } } });
  await admin.getByRole("tab", { name: "Öppningsrutiner" }).click();
  await admin.getByRole("textbox", { name: "Redigera check 2" }).fill("Starta kaffe och kontrollera frukostytan noga");
  await expect(admin.locator(".hb-change-summary")).toContainText("Ändrat: Starta kaffe och kontrollera frukostytan → Starta kaffe och kontrollera frukostytan noga");
});

test("Personalpärm-knappen har egen plats i headern på kassaskärm, surfplatta och mobil", async ({ page }) => {
  await mockDashboard(page);
  await mockReader(page);
  for (const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:1024,height:768},{width:1024,height:650},{width:768,height:1024},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.goto("/station?weather-demo=1");
    const trigger = page.getByRole("button", { name: "Personalpärm", exact: true });
    await expect(trigger).toBeVisible();
    await expect(trigger.locator("svg")).toHaveCount(1);
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await expect(page.locator(".v2-info h3")).toHaveText("Tävling – måndag");
    await expect(page.locator(".v2-info").getByRole("button", { name: "Personalpärm" })).toHaveCount(0);
    expect(await page.evaluate(() => {
      const header = document.querySelector(".v2-header")!.getBoundingClientRect();
      const boxes = [".v2-brand", ".v2-header-shortcuts", ".v2-lovable-link", ".v2-handbook-trigger", ".v2-weather", ".v2-admin-link"].map((selector) => document.querySelector(selector)!.getBoundingClientRect());
      const within = (box: DOMRect) => box.left >= header.left && box.right <= header.right && box.top >= header.top && box.bottom <= header.bottom;
      const apart = (a: DOMRect, b: DOMRect) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      return document.documentElement.scrollWidth <= innerWidth && boxes.every(within) &&
        apart(boxes[0], boxes[1]) && apart(boxes[1], boxes[4]) && apart(boxes[1], boxes[5]) && apart(boxes[4], boxes[5]);
    })).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Personalpärmen" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  }
});
