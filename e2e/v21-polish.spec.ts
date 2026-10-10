import { expect, test, type Page } from "@playwright/test";

const team = Array.from({ length: 7 }, (_, index) => ({
  id: `demo-${index}`,
  name: `Demo ${String.fromCharCode(65 + index)}`,
  color: "#226bb0",
  active: 1,
}));
const ranked = team.map((person, index) => ({
  ...person,
  count: index === 6 ? 2 : 8 - index,
  revenue: 3200 - index * 170,
  average: 390 - index * 25,
  premiumShare: 55 - index * 5,
}));
const stats = (people: typeof ranked, rangeStart: string) => ({
  count: people.reduce((sum, person) => sum + person.count, 0),
  revenue: people.reduce((sum, person) => sum + person.revenue, 0),
  average: 310,
  premiumShare: 32,
  programs: [],
  staff: people,
  leaders: { average: people, count: people, revenue: people, premiumShare: people },
  goals: { daily: 25, monthly: 500, dailyCount: 12, monthlyCount: 80 },
  range: { start: rangeStart, end: rangeStart },
});

test("periodlistan och den fasta månadslistan är oberoende; modal och månadsskifte fungerar", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-31T22:59:40Z") });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.route("**/api/staff*", (route) => route.fulfill({ json: team }));
  let month = "2026-10";
  const requested: string[] = [];
  await page.route(/\/api\/stats(?:\/staff\/[^?]+)?(?:\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    requested.push(url.pathname + url.search);
    const period = url.searchParams.get("period");
    const people = month === "2026-11" ? [ranked[0], ranked[6]].map((person) => ({ ...person, count: 2 }))
      : url.pathname.includes("/staff/") ? [ranked[0]]
      : period === "week" ? [...ranked].reverse()
      : ranked;
    return route.fulfill({ json: stats(people, period === "month" ? `${month}-01` : `${month}-31`) });
  });
  await page.goto("/?view=stats");
  const left = page.getByRole("region", { name: "Topplista snittköp", exact: true });
  const right = page.getByRole("region", { name: "Topplista snittköp i oktober", exact: true });
  await expect(left.locator(".average-league-list li")).toHaveCount(5);
  await expect(right.locator(".monthly-leader-list li")).toHaveCount(5);
  await expect(left.locator(".league-rank").first()).toHaveText("🥇");
  await expect(left.locator(".league-person strong").first()).toHaveText("Demo A");
  await expect(left.locator(".average-league-list li").nth(3).locator(".league-person span")).toHaveText("Demo D");
  await expect(right.locator(".monthly-name").first()).toHaveText("Demo A");
  await page.getByRole("button", { name: "Vecka", exact: true }).click();
  await expect(left.locator(".league-person strong").first()).toHaveText("Demo F");
  await expect(right.locator(".monthly-name").first()).toHaveText("Demo A");
  await page.getByLabel("Visa statistik för").selectOption("demo-0");
  await expect(left.locator(".average-league-list li")).toHaveCount(1);
  await expect(right.locator(".monthly-leader-list li")).toHaveCount(5);
  expect(requested.some((path) => path.includes("/api/stats/staff/demo-0"))).toBe(true);
  expect(requested.filter((path) => path === "/api/stats?period=month").length).toBeGreaterThan(0);

  await right.getByRole("button", { name: "Mer statistik" }).click();
  const modal = page.getByRole("dialog", { name: "Hela lagets statistik i oktober" });
  await expect(modal).toBeVisible();
  await expect(modal.locator(".monthly-modal-grid section")).toHaveCount(4);
  for (const section of await modal.locator(".monthly-modal-grid section").all()) {
    await expect(section.locator(".monthly-leader-list li")).toHaveCount(6);
    await expect(section.locator(".monthly-leader-list .monthly-name").first()).toHaveText("Demo A");
  }
  await expect(modal.locator(".monthly-unqualified li")).toContainText(["Demo G1 tvättar kvar"]);
  await page.screenshot({ path: "test-results/v21-monthly-modal.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(modal).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);

  month = "2026-11";
  await page.clock.fastForward(31000);
  const november = page.getByRole("region", { name: "Topplista snittköp i november", exact: true });
  await expect(november).toBeVisible();
  await expect(november.locator(".monthly-leader-list li")).toHaveCount(0);
  await expect(november).toContainText("Ingen har nått tre giltiga tvättar");
});

async function stationData(page: Page) {
  await page.route("**/api/station/dashboard", (route) => route.fulfill({ json: {
    business_date: "2026-10-08", comparison_date: "2025-10-09",
    net_sales_ore: null, comparison_sales_ore: null, difference_ore: null,
    percent: null, updated_at: null, week: [],
  } }));
  await page.route("**/api/station/v2", (route) => route.fulfill({ json: {
    today: "2026-10-09", shifts: [], tasks: [], notices: [], updated_at: null,
  } }));
}

test("stationslänkarna fungerar i båda riktningar och spärrar obekräftad registrering", async ({ page }) => {
  await stationData(page);
  await page.goto("/station");
  await expect(page.getByRole("link", { name: "Stationsadmin" })).toHaveAttribute("href", "/station/admin");
  await page.getByRole("link", { name: "Stationsadmin" }).click();
  await expect(page).toHaveURL(/\/station\/admin$/);
  await page.goto("/station");
  await page.getByRole("link", { name: /ÖPPNA TVÄTTLIGAN/ }).click();
  await expect(page).toHaveURL(/\/$/);
  for (const view of ["home", "stats", "admin"] as const) {
    await page.goto("/");
    if (view === "stats") await page.getByRole("button", { name: "Statistik", exact: true }).click();
    if (view === "admin") await page.getByRole("button", { name: "Admin", exact: true }).click();
    const link = page.getByRole("link", { name: "Till stationsdashboard" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/station$/);
  }
  await page.goto("/");
  await page.getByRole("button", { name: "Emma Välj" }).click();
  await page.route("**/api/sales", (route) => route.abort("failed"));
  await page.getByRole("button", { name: /Registrera Fin,/ }).click();
  await expect(page.getByRole("alert")).toContainText("räknas aldrig dubbelt");
  const link = page.getByRole("link", { name: "Till stationsdashboard" });
  await expect(link).toHaveAttribute("aria-disabled", "true");
  await link.click({ force: true });
  await expect(page.getByRole("heading", { name: "Välj tvättprogram" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("stationskortets pepptext, meddelande och ärliga diagramtomläge ryms på TV och mobil", async ({ page }) => {
  await page.route("**/api/station/dashboard", (route) => route.fulfill({ json: {
    business_date: "2026-10-08", comparison_date: "2025-10-09",
    net_sales_ore: null, comparison_sales_ore: null, difference_ore: null,
    percent: null, updated_at: null,
    week: [],
  } }));
  const message = "Detta är ett långt syntetiskt meddelande som kan läsas i sin helhet. ".repeat(6);
  await page.route("**/api/station/v2", (route) => route.fulfill({ json: {
    today: "2026-10-09", shifts: [], tasks: [], updated_at: null,
    notices: [{ id: "demo", title: "Viktig syntetisk information för teamet", message, updated_at: "" }],
  } }));
  for (const [width, height] of [[1920, 1080], [1366, 768], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/station");
    await expect(page.getByText("Veckodiagrammet visas när en dagsförsäljning har registrerats.")).toBeVisible();
    await expect(page.locator(".v2-bar")).toHaveCount(0);
    const bounds = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      return {
        messageBottom: rect(".v2-message").bottom,
        saleBottom: rect(".v2-sales-card").bottom,
        infoBottom: rect(".v2-info").bottom,
        buttonBottom: rect(".v2-info button").bottom,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      };
    });
    expect(bounds.messageBottom).toBeLessThan(bounds.saleBottom);
    expect(bounds.buttonBottom).toBeLessThanOrEqual(bounds.infoBottom);
    expect(bounds.scrollWidth).toBeLessThanOrEqual(width);
    if (width > 700) expect(bounds.scrollHeight).toBeLessThanOrEqual(height);
  }
  await page.getByRole("button", { name: "Läs hela meddelandet" }).click();
  await expect(page.getByRole("dialog", { name: "Viktig info" })).toContainText(message.trim());
});
