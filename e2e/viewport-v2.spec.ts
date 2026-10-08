import { expect, test, type Page } from "@playwright/test";

const people = Array.from({ length: 5 }, (_, i) => ({
  id: `demo-${i}`, name: `Demo ${String.fromCharCode(65 + i)}`,
  color: "#1379d6", active: 1,
}));
const programs = [
  ["preemium", "Preemium", 389], ["finast-plus", "Finast Plus", 329],
  ["hosttvatt", "Hösttvätt", 259], ["finast", "Finast", 219],
  ["fin", "Fin", 179], ["borstlos", "Borstlös", 199],
].map(([id, name, price_sek], sort_order) => ({ id, name, price_sek, sort_order, active: 1 }));
const rankings = people.map((person, index) => ({
  ...person, count: 8 - index, revenue: 2900 - index * 150,
  average: 330 - index * 15, premiumShare: 35 - index * 3,
}));
async function syntheticData(page: Page) {
  await page.route("**/api/station/weather", (route) => route.fulfill({ json: {
    source: "SMHI SNOW1gv1", kind: "forecast",
    now: { time: "2026-10-08T10:00:00Z", temperature: 12, symbol: 3 },
    tomorrow: { time: "2026-10-09T10:00:00Z", temperature: 11, symbol: 6 },
  } }));
  await page.route("**/api/staff*", (route) => route.fulfill({ json: people }));
  await page.route("**/api/wash-programs*", (route) => route.fulfill({ json: programs }));
  await page.route("**/api/stats*", (route) => route.fulfill({ json: {
    count: 38, revenue: 12000, average: 316, premiumShare: 32,
    programs: programs.map((program) => ({ ...program, count: 6, revenue: 1500 })),
    staff: rankings,
    leaders: { count: rankings, revenue: rankings, average: rankings, premiumShare: rankings },
    goals: { daily: 25, monthly: 500, dailyCount: 15, monthlyCount: 120 },
    range: { start: "2026-10-08", end: "2026-10-08" },
  } }));
  await page.route("**/api/station/dashboard", (route) => route.fulfill({ json: {
    business_date: "2026-10-07", comparison_date: "2025-10-08",
    net_sales_ore: 3845000, comparison_sales_ore: 3408700,
    difference_ore: 436300, percent: 12.8, updated_at: null, week: [],
  } }));
  await page.route("**/api/station/v2", (route) => route.fulfill({ json: {
    today: "2026-10-08", updated_at: null,
    shifts: people.slice(0, 3).map((person, index) => ({ id: person.id, first_name: person.name, starts_at: `0${6 + index}:00`, ends_at: `${14 + index}:00` })),
    tasks: [0, 1, 2, 3].map((index) => ({ id: String(index), text: `Demouppgift ${index + 1}`, done: index % 2, revision: 0, created_at: "" })),
    notices: [{ id: "demo", title: "Demomeddelande", message: "Syntetiskt innehåll.", updated_at: "" }],
  } }));
}
async function dimensions(page: Page) {
  return page.evaluate(() => ({
    viewportHeight: innerHeight, viewportWidth: innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
  }));
}
for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080]]) {
  test(`station, Registrera och Statistik ryms på ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await syntheticData(page);
    await page.goto("/station");
    await expect(page.getByText("38 450")).toBeVisible();
    await expect(page.getByRole("button", { name: /Förra månadens siffror/i })).toBeVisible();
    expect(await dimensions(page)).toMatchObject({ viewportHeight: height, scrollHeight: height, viewportWidth: width, scrollWidth: width });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Välj ditt namn" })).toBeVisible();
    await page.locator(".staff-card").first().click();
    await expect(page.getByRole("heading", { name: "Välj tvättprogram" })).toBeVisible();
    expect(await page.locator(".wash-card img").count()).toBe(6);
    expect(await page.locator(".wash-card img").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    expect(await dimensions(page)).toMatchObject({ viewportHeight: height, scrollHeight: height, viewportWidth: width, scrollWidth: width });

    await page.getByRole("button", { name: /Statistik/ }).first().click();
    await expect(page.getByRole("heading", { name: "Statistik" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Snittköpsligan" })).toBeVisible();
    await expect(page.locator(".leader-list li")).toHaveCount(15);
    expect(await dimensions(page)).toMatchObject({ viewportHeight: height, scrollHeight: height, viewportWidth: width, scrollWidth: width });
  });
}

test("mobilvyer har inga horisontella överflöden", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await syntheticData(page);
  await page.goto("/station");
  await expect(page.getByRole("heading", { name: "IDAG JOBBAR" })).toBeVisible();
  expect((await dimensions(page)).scrollWidth).toBe(390);
  await page.goto("/");
  await page.locator(".staff-card").first().click();
  await expect(page.getByRole("heading", { name: "Välj tvättprogram" })).toBeVisible();
  expect((await dimensions(page)).scrollWidth).toBe(390);
  await page.getByRole("button", { name: /Statistik/ }).first().click();
  await expect(page.getByRole("heading", { name: "Statistik" })).toBeVisible();
  expect((await dimensions(page)).scrollWidth).toBe(390);
});
