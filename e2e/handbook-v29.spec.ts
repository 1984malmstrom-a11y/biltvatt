import { expect, test, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { emptyHandbookContent, HANDBOOK_KINDS, HANDBOOK_LABELS, stockholmToday, type HandbookContent, type HandbookKind } from "../shared/handbook";
import { SECURITY_PLACEHOLDER, contentHasUnredactedAccessText } from "../shared/handbook-security";

const paths: Record<HandbookKind, string | undefined> = {
  bakeoff: process.env.V29_BAKEOFF_DOCX,
  opening: process.env.V29_OPENING_DOCX,
  closing: process.env.V29_CLOSING_DOCX,
  freshfood: process.env.V29_FRESHFOOD_DOCX,
};
const previewDir = process.env.V29_PREVIEW_DIR;
const ready = HANDBOOK_KINDS.every((kind) => paths[kind]);

type Saved = { title: string; description: string; content: HandbookContent; reviewed: boolean };
async function mockAdmin(page: Page, drafts: Partial<Record<HandbookKind, Saved>>) {
  await page.route("**/api/admin/station/store-sales", (route) => route.fulfill({ json: { yesterday: "2026-10-10", rows: [] } }));
  await page.route("**/api/admin/station/view-sessions", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/station/v2/schedule", (route) => route.fulfill({ json: { periods: [], shifts: [] } }));
  await page.route("**/api/admin/station/v2/notices", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/station/v2/monthly", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/station/handbook", (route) => route.fulfill({ json: { documents: HANDBOOK_KINDS.map((kind) => ({ kind, revision: drafts[kind] ? 1 : 0, draft: drafts[kind] ?? null, published: null })) } }));
  await page.route("**/api/admin/station/handbook/*/draft", (route) => {
    const kind = new URL(route.request().url()).pathname.split("/")[5] as HandbookKind;
    const data = route.request().postDataJSON() as Saved;
    drafts[kind] = { title: data.title, description: data.description, content: data.content, reviewed: data.reviewed };
    return route.fulfill({ json: { ok: true, revision: 1 } });
  });
}
async function mockReader(page: Page, drafts: Partial<Record<HandbookKind, Saved>>) {
  await page.route("**/api/station/dashboard", (route) => route.fulfill({ json: { business_date: "2026-10-10", comparison_date: "2025-10-11", net_sales_ore: 2850000, comparison_sales_ore: 2600000, difference_ore: 250000, percent: 9.6, updated_at: null, week: [] } }));
  await page.route("**/api/station/v2", (route) => route.fulfill({ json: { today: "2026-10-11", shifts: [], tasks: [], notices: [], updated_at: null } }));
  await page.route("**/api/station/handbook**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/station/handbook") return route.fulfill({ json: { documents: HANDBOOK_KINDS.map((kind) => ({ kind, title: HANDBOOK_LABELS[kind], description: "", available: true })) } });
    const kind = path.split("/")[4] as HandbookKind;
    const content = drafts[kind]?.content ?? emptyHandbookContent();
    const checks = (kind === "opening" || kind === "closing") ? content.blocks.filter((block) => block.type === "check").slice(0, kind === "opening" ? 5 : 3).map((block) => ({ item_id: block.id, done: 1, revision: 1 })) : [];
    return route.fulfill({ json: { kind, id: `local-preview-${kind}`, title: HANDBOOK_LABELS[kind], description: "", content, day: stockholmToday(), checks } });
  });
}

test("fyra riktiga Word-filer importeras separat och visas i lokal förhandsvisning", async ({ page }) => {
  test.skip(!ready, "Kräver fyra lokala V29_*_DOCX-sökvägar; originalfiler läggs aldrig i Git.");
  const drafts: Partial<Record<HandbookKind, Saved>> = {};
  await mockAdmin(page, drafts);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/station/admin");
  const admin = page.locator(".hb-admin");
  await expect(admin.getByRole("tablist", { name: "Dokumenttyp" }).getByRole("tab")).toHaveCount(4);
  for (const kind of HANDBOOK_KINDS) {
    await admin.getByRole("tab", { name: HANDBOOK_LABELS[kind] }).click();
    await admin.locator("input[type=file]").setInputFiles({ name: `${kind}.docx`, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: readFileSync(paths[kind]!) });
    await expect(admin.getByText("Word-filen är importerad lokalt. Granska och spara utkastet innan publicering.")).toBeVisible();
    await admin.getByRole("button", { name: "Spara utkast" }).click();
    await expect(admin.getByText("Utkastet är sparat. Det syns ännu inte för personalen.")).toBeVisible();
    expect(contentHasUnredactedAccessText(drafts[kind]!.content)).toBe(false);
  }
  const bakeoff = drafts.bakeoff!.content;
  expect(bakeoff.blocks.filter((block) => block.type === "heading").map((block) => block.text)).toEqual(["Huvudvagn", "Reservvagn", "Frysen"]);
  expect(bakeoff.blocks.filter((block) => block.type === "table").map((block) => block.rows.length - 1)).toEqual([5, 4, 2]);
  expect(bakeoff.blocks.some((block) => block.type === "table" && block.rows.some((row) => row[1] === "8st x2"))).toBe(true);
  expect(bakeoff.blocks.some((block) => block.type === "table" && block.rows.some((row) => row[1] === "vid behov"))).toBe(true);
  expect(Object.values(bakeoff.days).every((rows) => rows.length === 0)).toBe(true);
  const opening = drafts.opening!.content;
  expect(opening.blocks.filter((block) => block.type === "heading").map((block) => block.text)).toEqual(["05:30", "05:58", "06:00"]);
  expect(opening.blocks.filter((block) => block.type === "check").length).toBe(23);
  expect(opening.blocks.some((block) => block.type === "check" && block.text.includes(SECURITY_PLACEHOLDER))).toBe(true);
  expect(contentHasUnredactedAccessText(opening)).toBe(false);
  const closing = drafts.closing!.content;
  expect(closing.blocks.filter((block) => block.type === "heading").map((block) => block.text)).toEqual(["17:00", "18:30", "19:30", "20:30", "21:30", "22:00"]);
  expect(closing.blocks.filter((block) => block.type === "check").length).toBe(45);
  const freshfood = drafts.freshfood!.content;
  expect(freshfood.blocks.some((block) => block.type === "heading" && block.text === "Tas upp på dagen")).toBe(true);
  expect(freshfood.blocks.some((block) => block.type === "heading" && block.text === "Tas upp på kvällen")).toBe(true);
  expect(freshfood.blocks.some((block) => block.type === "paragraph" && block.text.includes("4/månad"))).toBe(true);
  expect(freshfood.blocks.some((block) => block.type === "paragraph" && block.text.includes("5/månad"))).toBe(true);
  await admin.getByRole("tab", { name: "Öppningsrutiner" }).click();
  await admin.locator("input[type=file]").setInputFiles({ name: "opening.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: readFileSync(paths.opening!) });
  await expect(admin.getByText("Granska importen")).toBeVisible();
  await expect(admin.getByText("Säkerhetsgranskning krävs")).toBeVisible();
  await expect(admin.getByRole("button", { name: "Publicera sparat utkast" })).toBeDisabled();
  if (previewDir) {
    mkdirSync(previewDir, { recursive: true });
    await page.evaluate(() => window.scrollTo(0, document.querySelector(".hb-admin")!.getBoundingClientRect().top + scrollY - 20));
    await page.screenshot({ path: join(previewDir, "06-stationsadmin-wordimport.png") });
  }
  await mockReader(page, drafts);
  await page.goto("/station?weather-demo=1");
  await page.getByRole("button", { name: "Personalpärm", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Personalpärmen" });
  await expect(dialog.locator(".hb-card")).toHaveCount(4);
  if (previewDir) await page.screenshot({ path: join(previewDir, "01-personalparmen-fyra-kort.png") });
  for (const [kind, label, file] of [
    ["bakeoff", "Bakeoff", "02-bakeoff-tre-avdelningar.png"],
    ["opening", "Öppningsrutiner", "03-oppningsrutiner-tva-kolumner.png"],
    ["closing", "Stängningsrutiner", "04-stangningsrutiner-tva-kolumner.png"],
    ["freshfood", "FreshFood", "05-freshfood-guide.png"],
  ] as const) {
    await dialog.getByRole("button", { name: new RegExp(label) }).click();
    await expect(dialog.locator(".hb-document")).toBeVisible();
    if (kind === "bakeoff") {
      await dialog.getByRole("tab", { name: "VARDAGAR" }).click();
      await expect(dialog.locator(".hb-bakeoff-group")).toHaveCount(3);
      await expect(dialog.getByRole("tablist", { name: "Veckodag" })).toHaveCount(0);
    }
    if (kind === "opening" || kind === "closing") {
      const columns = await dialog.locator(".hb-blocks").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
      expect(columns).toBe(2);
    }
    if (kind === "freshfood") await expect(dialog.locator(".hb-guide-card")).toHaveCount(2);
    if (previewDir) await page.screenshot({ path: join(previewDir, file) });
    await dialog.getByRole("button", { name: "Till Personalpärmen" }).click();
  }
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/station?weather-demo=1");
  await page.getByRole("button", { name: "Personalpärm", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".hb-card")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("dialog").getByRole("button", { name: /Öppningsrutiner/ }).click();
  expect(await page.locator(".hb-blocks").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("about:blank"); // Keep any failure snapshot free of imported document text.
});
