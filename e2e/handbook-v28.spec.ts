import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";
import { mkdirSync } from "node:fs";
import { emptyHandbookContent, HANDBOOK_KINDS, stockholmToday, type HandbookContent, type HandbookKind } from "../shared/handbook";

const previewDir = process.env.V28_PREVIEW_DIR;
if (previewDir) mkdirSync(previewDir, { recursive: true });
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
  return { bakeoff, opening, closing };
}
const titles = { bakeoff: "Bakeoff – Upplockningsschema", opening: "Öppningsrutiner", closing: "Stängningsrutiner" };
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
    return route.fulfill({ json: live(kind, content[kind], kind === "bakeoff" ? [] : state[kind]) });
  });
}
function syntheticDocx() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml", '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Upplockning</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Produkt</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Måndag</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Tisdag</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Fralla</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>12 st</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>8 st</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>');
  return zip.generateAsync({ type: "nodebuffer" });
}

test("Personalpärmen visar tre dokument med separata checklistor och passar kassaskärm och mobil", async ({ page }) => {
  for (const viewport of [{width:1440,height:900},{width:1024,height:768},{width:1024,height:650},{width:390,height:844}]) {
    await page.unroute("**/api/station/handbook**");
    await mockReader(page);
    await page.setViewportSize(viewport);
    await page.goto("/station/handbook");
    await expect(page.getByRole("heading", { name: "Personalpärmen" })).toBeVisible();
    await expect(page.locator(".hb-card")).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (previewDir && viewport.width === 1440) await page.screenshot({ path: `${previewDir}/01-personalparm-start.png` });
    await page.getByRole("button", { name: /Bakeoff – Upplockningsschema/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Kanelbulle");
    if (viewport.width === 390) expect(await page.evaluate(() => {
      const tabs = [...document.querySelectorAll<HTMLElement>(".hb-dialog .hb-days button")];
      return tabs[0].getBoundingClientRect().left >= 0 && tabs[6].getBoundingClientRect().right <= innerWidth && tabs[6].getBoundingClientRect().top > tabs[0].getBoundingClientRect().top;
    })).toBe(true);
    await page.getByRole("tab", { name: "Söndag" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("Croissant");
    if (previewDir && viewport.width === 1024 && viewport.height === 768) await page.screenshot({ path: `${previewDir}/02-bakeoff-kassaskarm.png` });
    await page.getByRole("button", { name: "Stäng", exact: true }).click();
    await page.getByRole("button", { name: /Öppningsrutiner/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("1 av 3 klara")).toBeVisible();
    if (previewDir && viewport.width === 1024 && viewport.height === 768) await page.screenshot({ path: `${previewDir}/03-oppningsrutiner-kassaskarm.png` });
    await dialog.getByRole("checkbox").nth(1).click();
    await expect(dialog.getByText("2 av 3 klara")).toBeVisible();
    await page.getByRole("button", { name: "Stäng", exact: true }).click();
    await page.getByRole("button", { name: /Stängningsrutiner/ }).click();
    await expect(page.getByRole("dialog").getByText("0 av 3 klara")).toBeVisible();
    if (previewDir && viewport.width === 390) await page.screenshot({ path: `${previewDir}/04-stangningsrutiner-mobil.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Stäng", exact: true }).click();
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
  await admin.locator(".hb-admin-preview").getByRole("tab", { name: "Måndag" }).click();
  await expect(admin.locator(".hb-admin-preview")).toContainText("Fralla");
  if (previewDir) await admin.screenshot({ path: `${previewDir}/05-admin-wordimport.png` });
  await admin.getByRole("button", { name: "Spara utkast" }).click();
  await expect(admin.getByText("Utkastet är sparat. Det syns ännu inte för personalen.")).toBeVisible();
  expect(saved).toMatchObject({ reviewed: false, content: { days: { monday: [{ product: "Fralla", quantity: "12 st" }], tuesday: [{ product: "Fralla", quantity: "8 st" }] } } });
  await admin.getByRole("tab", { name: "Öppningsrutiner" }).click();
  await admin.getByRole("textbox", { name: "Redigera check 2" }).fill("Starta kaffe och kontrollera frukostytan noga");
  await expect(admin.locator(".hb-change-summary")).toContainText("Ändrat: Starta kaffe och kontrollera frukostytan → Starta kaffe och kontrollera frukostytan noga");
});

test("länken till Personalpärmen ryms i Viktig info på kassaskärm och mobil", async ({ page }) => {
  await page.route("**/api/station/dashboard", (route) => route.fulfill({ json: { business_date: "2026-10-10", comparison_date: "2025-10-11", net_sales_ore: 2850000, comparison_sales_ore: 2600000, difference_ore: 250000, percent: 9.6, updated_at: null, week: [] } }));
  await page.route("**/api/station/v2", (route) => route.fulfill({ json: { today: "2026-10-11", shifts: [], tasks: [], notices: [{ id: "synthetic-notice", title: "Tävling – måndag", message: "Läs mer i personalpärmen om dagens rutiner.", updated_at: "2026-10-11T07:00:00Z" }], updated_at: null } }));
  for (const viewport of [{width:1366,height:768},{width:1024,height:768},{width:1024,height:650},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.goto("/station?weather-demo=1");
    const link = page.getByRole("link", { name: "PERSONALPÄRM" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/station/handbook");
    expect(await page.evaluate(() => {
      const panel = document.querySelector(".v2-info")!.getBoundingClientRect();
      const link = document.querySelector(".v2-info-actions a")!.getBoundingClientRect();
      const button = document.querySelector(".v2-info-actions button")!.getBoundingClientRect();
      return document.documentElement.scrollWidth <= innerWidth && link.left >= panel.left && link.right <= panel.right && link.top >= panel.top && link.bottom <= panel.bottom && (link.left >= button.right || link.top >= button.bottom);
    })).toBe(true);
  }
});
