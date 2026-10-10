import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

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

async function stationWeatherData(page: Page) {
  await page.route("**/api/station/dashboard", (route) => route.fulfill({ json: {
    business_date: "2026-10-07", comparison_date: "2025-10-08", net_sales_ore: 3845000,
    comparison_sales_ore: 3408700, difference_ore: 436300, percent: 12.8,
    updated_at: null, week: [],
  } }));
  await page.route("**/api/station/v2", (route) => route.fulfill({ json: {
    today: "2026-10-08", shifts: [], tasks: [], notices: [], updated_at: null,
  } }));
}

test("riktig väderväg visar API-prognos i godkänd header utan desktop-scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.clock.install();
  let weatherRequests = 0;
  await stationWeatherData(page);
  await page.route("**/api/station/weather", (route) => {
    weatherRequests++;
    return route.fulfill({ json: {
      source: "SMHI SNOW1gv1", kind: "forecast",
      now: { time: "2026-10-10T12:00:00Z", temperature: 11.5, symbol: 9 },
      tomorrow: { time: "2026-10-11T10:00:00Z", temperature: 10, symbol: 4 },
    } });
  });
  await page.goto("/station");
  await expect(page.getByText("SMHI · PROGNOS")).toBeVisible();
  await expect(page.getByText("TINGSRYD · JUST NU")).toBeVisible();
  await expect(page.getByText("IMORGON CA 12")).toBeVisible();
  await expect(page.locator(".v2-weather-value")).toContainText(["12°", "10°"]);
  await expect(page.getByText("DEMO · TESTVÄRDEN")).toHaveCount(0);
  const initialRequests = weatherRequests;
  expect(initialRequests).toBeGreaterThanOrEqual(1);
  await page.clock.fastForward(31 * 60 * 1000);
  await expect.poll(() => weatherRequests).toBeGreaterThan(initialRequests);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(768);
});

test("SMHI-fel döljer prognosen utan att störa försäljningskortet", async ({ page }) => {
  await stationWeatherData(page);
  await page.route("**/api/station/weather", (route) => route.fulfill({
    status: 503, json: { error: "Väderprognosen är tillfälligt otillgänglig." },
  }));
  await page.goto("/station");
  await expect(page.locator(".v2-motto")).toContainText("Tillsammans");
  await expect(page.locator(".v2-weather")).toHaveCount(0);
  await expect(page.locator(".v2-sales-card")).toContainText("38 450");
});

test("lokal väderdemo är märkt syntetisk och passar headern utan SMHI-anrop", async ({ page }) => {
  let weatherRequests = 0;
  await page.route("**/api/station/weather", (route) => {
    weatherRequests++;
    return route.abort();
  });
  await page.route("**/api/station/dashboard", (route) => route.fulfill({ json: {
    business_date: "2026-10-07", comparison_date: "2025-10-08", net_sales_ore: 3845000,
    comparison_sales_ore: 3408700, difference_ore: 436300, percent: 12.8,
    updated_at: null, week: [
      { date: "2026-10-01", net_sales_ore: 3120000, comparison_sales_ore: 3000000, percent: 4 },
      { date: "2026-10-02", net_sales_ore: 3310000, comparison_sales_ore: 3050000, percent: 8.5 },
      { date: "2026-10-03", net_sales_ore: 2940000, comparison_sales_ore: 3010000, percent: -2.3 },
      { date: "2026-10-04", net_sales_ore: 3650000, comparison_sales_ore: 3360000, percent: 8.6 },
      { date: "2026-10-05", net_sales_ore: 3420000, comparison_sales_ore: 3090000, percent: 10.7 },
      { date: "2026-10-06", net_sales_ore: 3710000, comparison_sales_ore: 3350000, percent: 10.7 },
      { date: "2026-10-07", net_sales_ore: 3845000, comparison_sales_ore: 3408700, percent: 12.8 },
    ],
  } }));
  await page.route("**/api/station/v2", (route) => route.fulfill({ json: {
    today: "2026-10-08", updated_at: null,
    shifts: [
      { id: "demo-1", first_name: "Ada", starts_at: "05:30", ends_at: "13:30" },
      { id: "demo-2", first_name: "Bo", starts_at: "07:00", ends_at: "15:00" },
      { id: "demo-3", first_name: "Cia", starts_at: "13:30", ends_at: "20:30" },
    ],
    tasks: [
      { id: "demo-t1", text: "Fyll på kylar", done: 1, revision: 0, created_at: "" },
      { id: "demo-t2", text: "Se över kaffe", done: 0, revision: 0, created_at: "" },
      { id: "demo-t3", text: "Städa entré", done: 0, revision: 0, created_at: "" },
    ],
    notices: [{ id: "demo-note", title: "Demomeddelande", message: "Syntetisk information för layoutgranskning.", updated_at: "" }],
  } }));
  const screenshotDir = process.env.STATION_WEATHER_SCREENSHOTS_DIR;
  if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });
  for (const viewport of [
    { width: 1920, height: 1080 }, { width: 1366, height: 768 },
    { width: 1280, height: 1024 }, { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/station?weather-demo=1");
    await expect(page.getByText("DEMO · TESTVÄRDEN")).toBeVisible();
    await expect(page.getByText("TINGSRYD · JUST NU")).toBeVisible();
    await expect(page.getByText("IMORGON CA 12")).toBeVisible();
    expect(await page.evaluate(() => {
      const header = document.querySelector(".v2-header")!.getBoundingClientRect();
      const weather = document.querySelector(".v2-weather")!.getBoundingClientRect();
      return header.left <= weather.left && weather.right <= header.right &&
        header.top <= weather.top && weather.bottom <= header.bottom &&
        document.documentElement.scrollWidth <= innerWidth;
    })).toBe(true);
    if (viewport.width >= 1024) {
      const spacing = await page.evaluate(() => {
        const brand = document.querySelector(".v2-brand")!.getBoundingClientRect();
        const weather = document.querySelector(".v2-weather")!.getBoundingClientRect();
        const admin = document.querySelector(".v2-admin-link")!.getBoundingClientRect();
        const header = document.querySelector(".v2-header")!.getBoundingClientRect();
        return { brandGap: weather.left - brand.right, adminGap: admin.left - weather.right,
          adminRight: header.right - admin.right };
      });
      expect(spacing.brandGap).toBeGreaterThanOrEqual(8);
      expect(spacing.adminGap).toBeGreaterThanOrEqual(40);
      expect(spacing.adminRight).toBeGreaterThanOrEqual(0);
    } else {
      expect(await page.locator(".v2-admin-link").evaluate((element) => getComputedStyle(element).marginLeft))
        .toBe("0px");
    }
    if (screenshotDir) {
      await page.screenshot({ path: join(screenshotDir, `weather-demo-${viewport.width}x${viewport.height}.png`) });
    }
  }
  expect(weatherRequests).toBe(0);
});

test("Lovable-knappen är synlig, responsiv och öppnar rätt adress i ny flik", async ({ page, context }) => {
  await stationWeatherData(page);
  await page.route("**/api/station/weather", (route) => route.fulfill({ json: {
    source: "SMHI SNOW1gv1", kind: "forecast",
    now: { time: "2026-10-10T12:00:00Z", temperature: 12, symbol: 9 },
    tomorrow: { time: "2026-10-11T10:00:00Z", temperature: 10, symbol: 4 },
  } }));
  const screenshotDir = process.env.STATION_LOVABLE_SCREENSHOTS_DIR;
  if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });
  for (const viewport of [
    { width: 1920, height: 1080 }, { width: 1536, height: 700 },
    { width: 1366, height: 768 }, { width: 1280, height: 1024 },
    { width: 1024, height: 768 }, { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/station");
    const link = page.getByRole("link", { name: "Öppna Lovable" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "https://what-can-i-do-183.lovable.app/");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link.locator("img")).toHaveJSProperty("complete", true);
    await expect(page.locator(".v2-updated")).toHaveCount(0);
    await expect(page.getByText(/Uppdaterad|Uppdatering saknas/)).toHaveCount(0);
    expect(await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const header = box(".v2-header");
      const brand = box(".v2-brand");
      const lovable = box(".v2-lovable-link");
      const weather = box(".v2-weather");
      const admin = box(".v2-admin-link");
      const within = (r: DOMRect) => r.left >= header.left && r.right <= header.right &&
        r.top >= header.top && r.bottom <= header.bottom;
      const separated = (a: DOMRect, b: DOMRect) => a.right <= b.left || b.right <= a.left ||
        a.bottom <= b.top || b.bottom <= a.top;
      return document.documentElement.scrollWidth <= innerWidth &&
        [brand, lovable, weather, admin].every(within) &&
        [brand, weather, admin].every((item) => separated(lovable, item));
    })).toBe(true);
    if (screenshotDir && (viewport.width === 1366 || viewport.width === 390)) {
      await page.locator(".v2-header").screenshot({
        path: join(screenshotDir, `header-${viewport.width}x${viewport.height}.png`),
      });
    }
  }
  await context.route("https://what-can-i-do-183.lovable.app/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Lovable</title>" }));
  const link = page.getByRole("link", { name: "Öppna Lovable" });
  await link.focus();
  await expect(link).toBeFocused();
  const popupPromise = context.waitForEvent("page");
  await page.keyboard.press("Enter");
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(popup.url()).toBe("https://what-can-i-do-183.lovable.app/");
  await expect(page).toHaveURL(/\/station$/);
});
