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
async function washImages(page: Page) {
  return page.locator(".wash-card").evaluateAll((cards) => cards.map((card) => {
    const image = card.querySelector("img") as HTMLImageElement;
    const box = card.getBoundingClientRect();
    const picture = image.getBoundingClientRect();
    return {
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      width: picture.width,
      height: picture.height,
      cardHeight: box.height,
      left: box.left,
      top: box.top,
      layoutTop: (card as HTMLElement).offsetTop,
      contained: picture.left >= box.left && picture.right <= box.right &&
        picture.top >= box.top && picture.bottom <= box.bottom,
      fit: getComputedStyle(image).objectFit,
    };
  }));
}
async function waitForWashImages(page: Page) {
  const images = page.locator(".wash-card img");
  await expect(images).toHaveCount(6);
  await expect.poll(() => images.evaluateAll((items) => items.every((item) =>
    (item as HTMLImageElement).complete && (item as HTMLImageElement).naturalWidth > 0)),
  { timeout: 10_000 }).toBe(true);
}
for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080]]) {
  test(`station, Registrera och Statistik ryms på ${width}×${height}`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-09T09:00:00Z") });
    await page.setViewportSize({ width, height });
    await syntheticData(page);
    await page.goto("/station");
    await expect(page.getByText("38 450")).toBeVisible();
    await expect(page.getByRole("button", { name: /Förra månadens siffror/i })).toBeVisible();
    expect(await dimensions(page)).toMatchObject({ viewportHeight: height, scrollHeight: height, viewportWidth: width, scrollWidth: width });
    if (width === 1366 || width === 1920) await page.screenshot({ path: `test-results/v21-station-${width}.png` });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Välj ditt namn" })).toBeVisible();
    await page.locator(".staff-card").first().click();
    await expect(page.getByRole("heading", { name: "Välj tvättprogram" })).toBeVisible();
    await waitForWashImages(page);
    const images = await washImages(page);
    expect(images).toHaveLength(6);
    expect(images.every((image) => image.contained && image.fit === "contain" &&
      Math.abs(image.naturalWidth / image.naturalHeight - 4 / 3) < 0.01)).toBe(true);
    expect(await page.locator(".wash-card").evaluateAll((cards) =>
      cards.every((card) => !card.textContent?.trim()))).toBe(true);
    expect(images.slice(0, 3).every((image) => image.layoutTop === images[0].layoutTop)).toBe(true);
    expect(images.slice(3).every((image) => image.layoutTop === images[3].layoutTop)).toBe(true);
    expect(images[3].layoutTop).toBeGreaterThan(images[0].layoutTop);
    expect(images[0].cardHeight).toBeLessThan(205);
    expect(await dimensions(page)).toMatchObject({ viewportHeight: height, scrollHeight: height, viewportWidth: width, scrollWidth: width });
    if (width === 1366) await page.screenshot({ path: "test-results/v21-washes-desktop.png" });
    if (width === 1366 || width === 1920) await page.screenshot({ path: `test-results/v21-washes-layoutfix-${width}.png` });
    if (width === 1366 || width === 1920) await page.screenshot({ path: `test-results/full-originals-${width}.png` });

    await page.getByRole("button", { name: /Statistik/ }).first().click();
    await expect(page.getByRole("heading", { name: "Statistik" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Topplista snittköp", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: /Topplista snittköp i/ })).toBeVisible();
    expect(await dimensions(page)).toMatchObject({ viewportHeight: height, scrollHeight: height, viewportWidth: width, scrollWidth: width });
    if (width === 1366) await page.screenshot({ path: "test-results/v21-stats-desktop.png" });
  });
}

test("mobilvyer har inga horisontella överflöden", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-09T09:00:00Z") });
  await page.setViewportSize({ width: 390, height: 844 });
  await syntheticData(page);
  await page.goto("/station");
  await expect(page.getByRole("heading", { name: "IDAG JOBBAR" })).toBeVisible();
  expect((await dimensions(page)).scrollWidth).toBe(390);
  await page.screenshot({ path: "test-results/v21-station-mobile.png", fullPage: true });
  await page.goto("/");
  await page.locator(".staff-card").first().click();
  await expect(page.getByRole("heading", { name: "Välj tvättprogram" })).toBeVisible();
  await waitForWashImages(page);
  const mobileImages = await washImages(page);
  expect(mobileImages).toHaveLength(6);
  expect(mobileImages.every((image) => image.contained && image.fit === "contain" &&
    Math.abs(image.naturalWidth / image.naturalHeight - 4 / 3) < 0.01)).toBe(true);
  expect((await dimensions(page)).scrollWidth).toBe(390);
  await page.screenshot({ path: "test-results/v21-washes-mobile.png", fullPage: true });
  await page.screenshot({ path: "test-results/v21-washes-layoutfix-mobile.png", fullPage: true });
  await page.screenshot({ path: "test-results/full-originals-mobile.png", fullPage: true });
  await page.getByRole("button", { name: /Statistik/ }).first().click();
  await expect(page.getByRole("heading", { name: "Statistik" })).toBeVisible();
  expect((await dimensions(page)).scrollWidth).toBe(390);
  await page.screenshot({ path: "test-results/v21-stats-mobile.png", fullPage: true });
});
