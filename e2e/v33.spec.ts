import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Issue, IssueEvent } from "../shared/issues";

const previewDir = process.env.V33_PREVIEW_DIR;
if (previewDir) mkdirSync(previewDir, { recursive: true });
const pulsePreviewDir = process.env.ISSUES_PULSE_PREVIEW_DIR;
if (pulsePreviewDir) mkdirSync(pulsePreviewDir, { recursive: true });
const createdAt = ["2026-10-11T07:05:00Z", "2026-10-11T08:25:00Z", "2026-10-11T09:15:00Z"];

async function mock(page: Page) {
  const issues: Issue[] = ["Kyldiskens dörr sluter inte tätt", "Kaffemaskin 2 läcker vatten", "Kortterminalen tappar anslutningen"].map((title, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    title, description: index === 1 ? "Det droppar vid utloppet efter bryggning." : "", location: ["Butik", "Kassa", "Kassa"][index],
    completed: 0, revision: 1, created_at: createdAt[index], updated_at: createdAt[index], completed_at: null,
  }));
  const events = new Map<string, IssueEvent[]>();
  issues.forEach((issue, index) => events.set(issue.id, index === 1 ? [
    { id: 3, action: "note", note_text: "Tekniker bokad till måndag.", occurred_at: "2026-10-11T12:45:00Z" },
    { id: 2, action: "note", note_text: "Fel anmält till service.", occurred_at: "2026-10-11T08:30:00Z" },
    { id: 1, action: "created", note_text: null, occurred_at: issue.created_at },
  ] : [{ id: 1, action: "created", note_text: null, occurred_at: issue.created_at }]));
  await page.route("**/api/station/dashboard", (route) => route.fulfill({ json: {
    business_date: "2026-10-10", comparison_date: "2025-10-11", net_sales_ore: 2539300,
    comparison_sales_ore: 2483600, difference_ore: 55700, percent: 2.2, updated_at: null, week: [],
  } }));
  await page.route("**/api/station/v2", (route) => route.fulfill({ json: { today: "2026-10-11", shifts: [], tasks: [], notices: [], updated_at: null } }));
  await page.route("**/api/station/waste**", (route) => route.fulfill({ json: { items: [] } }));
  await page.route("**/api/station/issues**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    if (path.endsWith("/summary")) return route.fulfill({ json: { unresolved: issues.filter((row) => !row.completed).length } });
    if (path === "/api/station/issues" && method === "GET") {
      const completed = url.searchParams.get("status") === "completed";
      const items = issues.filter((row) => Boolean(row.completed) === completed).sort((a, b) =>
        completed ? `${b.completed_at}|${b.id}`.localeCompare(`${a.completed_at}|${a.id}`) : `${b.created_at}|${b.id}`.localeCompare(`${a.created_at}|${a.id}`));
      return route.fulfill({ json: { items, next_cursor: null } });
    }
    if (path === "/api/station/issues" && method === "POST") {
      const input = route.request().postDataJSON() as { title: string; description: string; location: string };
      const id = `00000000-0000-4000-8000-${String(issues.length + 1).padStart(12, "0")}`;
      const now = "2026-10-11T12:00:00Z";
      issues.push({ id, ...input, completed: 0, revision: 1, created_at: now, updated_at: now, completed_at: null });
      events.set(id, [{ id: 1, action: "created", note_text: null, occurred_at: now }]);
      return route.fulfill({ status: 201, json: { id, revision: 1 } });
    }
    const id = path.split("/")[4];
    const issue = issues.find((row) => row.id === id);
    if (!issue) return route.fulfill({ status: 404, json: { error: "Ärendet finns inte." } });
    if (path.endsWith("/events")) return route.fulfill({ json: { events: events.get(id), next_cursor: null } });
    if (path.endsWith("/notes") && method === "POST") {
      const note = (route.request().postDataJSON() as { text: string }).text;
      events.get(id)!.unshift({ id: events.get(id)!.length + 1, action: "note", note_text: note, occurred_at: "2026-10-11T13:05:00Z" });
      return route.fulfill({ status: 201, json: { ok: true } });
    }
    if (path.endsWith("/status") && method === "PUT") {
      const data = route.request().postDataJSON() as { completed: boolean; expected_revision: number };
      if (issue.revision !== data.expected_revision) return route.fulfill({ status: 409, json: { error: "Ärendet har ändrats." } });
      issue.completed = data.completed ? 1 : 0; issue.completed_at = data.completed ? "2026-10-11T13:20:00Z" : null; issue.revision++;
      events.get(id)!.unshift({ id: events.get(id)!.length + 1, action: data.completed ? "completed" : "reopened", note_text: null, occurred_at: "2026-10-11T13:20:00Z" });
      return route.fulfill({ json: { ok: true, revision: issue.revision } });
    }
    if (method === "PUT") {
      const data = route.request().postDataJSON() as { title: string; description: string; location: string; expected_revision: number };
      if (issue.revision !== data.expected_revision) return route.fulfill({ status: 409, json: { error: "Ärendet har ändrats." } });
      Object.assign(issue, { title: data.title, description: data.description, location: data.location, revision: issue.revision + 1 });
      events.get(id)!.unshift({ id: events.get(id)!.length + 1, action: "edited", note_text: null, occurred_at: "2026-10-11T13:10:00Z" });
      return route.fulfill({ json: { ok: true, revision: issue.revision } });
    }
    return route.fulfill({ json: { issue } });
  });
  return issues;
}

test("header, ärendelista, åtgärder, slutförande och undo", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-11T12:00:00Z") });
  await page.setViewportSize({ width: 1366, height: 768 });
  await mock(page);
  await page.goto("/station?weather-demo=1");
  const trigger = page.locator(".issues-trigger");
  await expect(trigger).toHaveAccessibleName("Fel & åtgärder, 3 ej slutförda");
  await expect(trigger.locator(".issues-count")).toHaveText("3");
  await expect(trigger.locator(".issues-count")).toHaveCSS("animation-name", "issues-count-pulse");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1366);
  if (previewDir) await page.locator(".v2-header").screenshot({ path: join(previewDir, "01-header-1366.png") });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Fel & åtgärder" });
  await expect(dialog.locator(".issues-list-item")).toHaveCount(3);
  await expect(dialog.locator(".issues-list-item").first()).toContainText("Kortterminalen");
  if (previewDir) await dialog.screenshot({ path: join(previewDir, "02-olosta-listan.png") });
  await dialog.getByRole("button", { name: /Kaffemaskin 2 läcker vatten/ }).click();
  await expect(dialog.locator(".issues-events li")).toHaveCount(3);
  await expect(dialog.getByText("Fel anmält till service.")).toBeVisible();
  if (previewDir) await dialog.screenshot({ path: join(previewDir, "03-arende-atgarder.png") });
  await dialog.getByRole("textbox", { name: "Ny åtgärdsanteckning" }).fill("Reservdel beställd.");
  await dialog.getByRole("button", { name: "Spara åtgärd" }).click();
  await expect(dialog.getByText("Åtgärd: Reservdel beställd.")).toBeVisible();
  await expect(trigger.locator(".issues-count")).toHaveText("3");
  await dialog.getByRole("button", { name: "Slutfört" }).click();
  await expect(dialog.locator(".issues-status.completed")).toBeVisible();
  await expect(trigger.locator(".issues-count")).toHaveText("2");
  if (previewDir) await dialog.screenshot({ path: join(previewDir, "04-slutfort-arende.png") });
  await dialog.getByRole("button", { name: "Ångra slutförande" }).click();
  await expect(dialog.getByText("Slutförande ångrades")).toBeVisible();
  await expect(trigger.locator(".issues-count")).toHaveText("3");
  await dialog.getByRole("button", { name: "Till ärendelistan" }).click();
  await dialog.getByRole("tab", { name: "Slutförda / Historik" }).click();
  await expect(dialog.getByText("Inga slutförda ärenden ännu.")).toBeVisible();
  await dialog.getByRole("button", { name: "Stäng Fel & åtgärder" }).click();
});

test("kassaskärmar, mobil, reducerad rörelse och noll olösta", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-11T12:00:00Z") });
  const issues = await mock(page);
  for (const [width, height, filename] of [[1024,768,"05-kassa-1024x768.png"],[1024,650,"06-kassa-1024x650.png"],[390,844,"07-mobil-390.png"]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/station?weather-demo=1");
    const button = page.getByRole("button", { name: /Fel & åtgärder, 3 ej slutförda/ });
    await expect(button).toBeVisible();
    if (previewDir && width === 390) await page.locator(".v2-header").screenshot({ path: join(previewDir, "08-header-mobil.png") });
    if (previewDir && width === 1024 && height === 768) await page.locator(".v2-header").screenshot({ path: join(previewDir, "09-header-kassa.png") });
    await button.click();
    const dialog = page.getByRole("dialog", { name: "Fel & åtgärder" });
    await expect(dialog.getByRole("button", { name: "Registrera fel" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (previewDir) await page.screenshot({ path: join(previewDir, filename) });
    await dialog.getByRole("button", { name: "Stäng Fel & åtgärder" }).click();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator(".issues-count")).toHaveCSS("animation-name", "none");
  issues.forEach((issue) => { issue.completed = 1; issue.completed_at = "2026-10-11T13:20:00Z"; });
  await page.reload();
  await expect(page.getByRole("button", { name: /Fel & åtgärder, 0 ej slutförda/ }).locator(".issues-count")).toHaveCSS("animation-name", "none");
});

test("orange badge glöder ensam var 4,8 sekund och stannar vid noll", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-11T12:00:00Z") });
  const issues = await mock(page);
  issues.slice(0, 2).forEach((issue) => { issue.completed = 1; issue.completed_at = "2026-10-11T11:00:00Z"; });
  for (const [width, height] of [[1920, 1080], [1366, 768], [1024, 768], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/station?weather-demo=1");
    const trigger = page.locator(".issues-trigger");
    const badge = trigger.locator(".issues-count");
    await expect(badge).toHaveText("1");
    await expect(badge).toHaveCSS("background-color", "rgb(255, 196, 119)");
    await expect(badge).toHaveCSS("animation-name", "issues-count-pulse");
    await expect(badge).toHaveCSS("animation-duration", "4.8s");
    await expect(trigger).toHaveCSS("animation-name", "none");
    await expect(trigger.locator("svg")).toHaveCSS("animation-name", "none");
    await expect(trigger.locator(".issues-trigger-label")).toHaveCSS("animation-name", "none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const bounds = await trigger.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    if (pulsePreviewDir && (width === 1366 || width === 390)) {
      await badge.evaluate((element) => {
        const pulse = element.getAnimations().find((animation) => animation.effect instanceof KeyframeEffect);
        if (!pulse) throw new Error("Sifferrutans CSS-animation saknas.");
        pulse.pause();
        pulse.currentTime = 336;
      });
      await page.locator(".v2-header").screenshot({
        path: join(pulsePreviewDir, width === 1366 ? "badge-glow-desktop.png" : "badge-glow-mobile.png"),
        animations: "allow",
      });
    }
  }
  const trigger = page.locator(".issues-trigger");
  const badge = trigger.locator(".issues-count");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Fel & åtgärder" });
  await dialog.getByRole("button", { name: /Kortterminalen tappar anslutningen/ }).click();
  await dialog.getByRole("button", { name: "Slutfört" }).click();
  await expect(badge).toHaveText("0");
  await expect(badge).toHaveCSS("animation-name", "none");
  await expect(badge).toHaveCSS("background-color", "rgb(229, 238, 227)");
  await dialog.getByRole("button", { name: "Ångra slutförande" }).click();
  await expect(badge).toHaveText("1");
  await expect(badge).toHaveCSS("animation-name", "issues-count-pulse");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(badge).toHaveCSS("animation-name", "none");
  await expect(badge).toHaveCSS("background-color", "rgb(255, 196, 119)");
});

test("nyregistrering, korrigering, revisionskonflikt och synk från annan enhet", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-11T12:00:00Z") });
  const issues = await mock(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/station?weather-demo=1");
  const trigger = page.locator(".issues-trigger");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Fel & åtgärder" });
  await dialog.getByRole("button", { name: "Registrera fel" }).click();
  await dialog.getByRole("textbox", { name: "Rubrik eller kort beskrivning *" }).fill("Kyl 3 visar fel temperatur");
  await dialog.getByRole("textbox", { name: "Plats eller utrustning" }).fill("Kyldisk");
  await dialog.getByRole("button", { name: "Spara ärende" }).click();
  await expect(dialog.getByRole("heading", { name: "Kyl 3 visar fel temperatur" })).toBeVisible();
  await expect(trigger.locator(".issues-count")).toHaveText("4");
  await dialog.getByRole("button", { name: "Korrigera uppgifter" }).click();
  await dialog.getByRole("textbox", { name: "Rubrik eller kort beskrivning *" }).fill("Kyl 3 visar 11 grader");
  await dialog.getByRole("button", { name: "Spara ändringar" }).click();
  await expect(dialog.getByRole("heading", { name: "Kyl 3 visar 11 grader" })).toBeVisible();
  const current = issues.at(-1)!;
  current.revision++; // Simulate a second station device winning the next update.
  await dialog.getByRole("button", { name: "Slutfört" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Ärendet har ändrats");
  await expect(trigger.locator(".issues-count")).toHaveText("4");
  await dialog.getByRole("button", { name: "Slutfört" }).click();
  await expect(dialog.locator(".issues-status.completed")).toBeVisible();
  await expect(trigger.locator(".issues-count")).toHaveText("3");
  await dialog.getByRole("button", { name: "Stäng Fel & åtgärder" }).click();
  issues.push({ ...current, id: "00000000-0000-4000-8000-000000000099", title: "Ny anmälan från annan enhet", completed: 0, completed_at: null });
  await page.clock.runFor(30000);
  await expect(trigger.locator(".issues-count")).toHaveText("4");
});
