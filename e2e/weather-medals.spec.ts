import { expect, test, type Page } from "@playwright/test";

const people = ["Ada", "Bo", "Cia", "Dan"].map((name) => ({
  id: `demo-${name.toLowerCase()}`, name: `Demo ${name}`, color: "#1679c7", active: 1,
}));
const ranked = people.map((person, index) => ({
  ...person, count: index === 3 ? 2 : 3, revenue: 900 - index * 90,
  average: 300 - index * 30, premiumShare: 0,
}));
const month = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit" }).format(new Date());
const fakeStats = (rangeMonth = month) => ({
  range: { start: `${rangeMonth}-01`, end: `${rangeMonth}-31` },
  leaders: { average: ranked, count: ranked, revenue: ranked, premiumShare: ranked },
  staff: ranked, programs: [], count: 11, revenue: 3000, average: 270, premiumShare: 0,
  goals: { daily: 25, monthly: 500, dailyCount: 0, monthlyCount: 11 },
});
async function sellerData(page: Page, stats = fakeStats()) {
  await page.route("**/api/staff*", (route) => route.fulfill({ json: people }));
  await page.route("**/api/wash-programs*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/stats?period=month", (route) => route.fulfill({ json: stats }));
}

test("metallkort visar bara namn och är tillgängliga via tangentbord", async ({ page }) => {
  await sellerData(page);
  await page.goto("/");
  const cards = page.locator(".staff-card");
  await expect(cards).toHaveCount(4);
  for (const [index, rank] of [1, 2, 3].entries()) {
    const card = cards.nth(index);
    await expect(card).toHaveClass(new RegExp(`staff-card-metal-${rank}`));
    await expect(card).toHaveText(`Demo ${["Ada", "Bo", "Cia"][index]}`);
    await expect(card.locator("svg, img, .avatar, span")).toHaveCount(0);
  }
  await expect(cards.nth(3)).not.toHaveClass(/staff-card-metal/);
  await cards.first().focus();
  await expect(cards.first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Välj tvättprogram" })).toBeVisible();
});

test("månadsskifte och statistikfel ger neutrala klickbara kort", async ({ page }) => {
  await sellerData(page, fakeStats("2025-09"));
  await page.goto("/");
  await expect(page.locator(".staff-card-metal")).toHaveCount(0);
  await page.route("**/api/stats?period=month", (route) => route.fulfill({ status: 503, json: { error: "test" } }));
  await page.reload();
  await expect(page.locator(".staff-card-metal")).toHaveCount(0);
  await page.locator(".staff-card").first().click();
  await expect(page.getByRole("heading", { name: "Välj tvättprogram" })).toBeVisible();
});

test("vädret är tydligt märkt som prognos utan desktop-scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.route("**/api/station/dashboard", (route) => route.fulfill({ json: {
    business_date: "2026-10-07", comparison_date: "2025-10-08", net_sales_ore: 3845000,
    comparison_sales_ore: 3408700, difference_ore: 436300, percent: 12.8,
    updated_at: null, week: [],
  } }));
  await page.route("**/api/station/v2", (route) => route.fulfill({ json: {
    today: "2026-10-08", shifts: [], tasks: [], notices: [], updated_at: null,
  } }));
  await page.route("**/api/station/weather", (route) => route.fulfill({ json: {
    source: "SMHI SNOW1gv1", kind: "forecast",
    now: { time: "2026-10-08T10:00:00Z", temperature: 12.4, symbol: 3 },
    tomorrow: { time: "2026-10-09T10:00:00Z", temperature: 8.7, symbol: 18 },
  } }));
  await page.goto("/station");
  await expect(page.getByText("PROGNOS JUST NU")).toBeVisible();
  await expect(page.getByText("IMORGON CA 12")).toBeVisible();
  await expect(page.getByText("SMHI · prognos")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(768);
});
