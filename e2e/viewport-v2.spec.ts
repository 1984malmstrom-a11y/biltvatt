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
const stationWeek = [
  { date: "2026-10-01", net_sales_ore: 2050000, comparison_sales_ore: 1900000, percent: 7.9 },
  { date: "2026-10-02", net_sales_ore: 2540000, comparison_sales_ore: 2780000, percent: -8.6 },
  { date: "2026-10-03", net_sales_ore: 3120000, comparison_sales_ore: null, percent: null },
  { date: "2026-10-04", net_sales_ore: 1890000, comparison_sales_ore: 1810000, percent: 4.4 },
  { date: "2026-10-05", net_sales_ore: 2910000, comparison_sales_ore: 2800000, percent: 3.9 },
  { date: "2026-10-06", net_sales_ore: 3420000, comparison_sales_ore: 3100000, percent: 10.3 },
  { date: "2026-10-07", net_sales_ore: 3845000, comparison_sales_ore: 3408700, percent: 12.8 },
];
async function syntheticData(page: Page, saleOre = 3845000) {
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
    range: route.request().url().includes("period=month")
      ? { start: "2026-10-01", end: "2026-10-31" }
      : { start: "2026-10-08", end: "2026-10-08" },
  } }));
  await page.route("**/api/station/dashboard", (route) => route.fulfill({ json: {
    business_date: "2026-10-07", comparison_date: "2025-10-08",
    net_sales_ore: saleOre, comparison_sales_ore: 3408700,
    difference_ore: saleOre - 3408700, percent: 12.8, updated_at: null,
    week: stationWeek.map((day, index) => index === 6 ? { ...day, net_sales_ore: saleOre } : day),
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
async function dashboardSurfaces(page: Page) {
  return page.evaluate(() => Object.fromEntries([
    ["sales", ".v2-sales-card"], ["shifts", ".v2-shifts"],
    ["tasks", ".v2-tasks"], ["info", ".v2-info"],
  ].map(([name, selector]) => [name, getComputedStyle(document.querySelector(selector)!).backgroundColor])));
}
async function ferrariArtwork(page: Page) {
  const art = page.locator(".v2-ferrari-art");
  await expect.poll(() => art.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  return page.evaluate(() => {
    const image = document.querySelector(".v2-ferrari-art") as HTMLImageElement;
    const button = document.querySelector(".v2-monthly-cta")!;
    const comparison = document.querySelector(".v2-comparison")!;
    const salesCopy = document.querySelector(".v2-sales-copy")!;
    const promo = document.querySelector(".v2-station-image")!;
    const buttonBox = button.getBoundingClientRect();
    const comparisonBox = comparison.getBoundingClientRect();
    const salesBox = salesCopy.getBoundingClientRect();
    return {
      source: new URL(image.currentSrc).pathname,
      naturalSize: [image.naturalWidth, image.naturalHeight],
      fit: getComputedStyle(image).objectFit,
      buttonBelowComparison: buttonBox.top >= comparisonBox.bottom,
      buttonInSalesCard: buttonBox.left >= salesBox.left && buttonBox.right <= salesBox.right,
      promoHasButton: !!promo.querySelector("button"),
    };
  });
}
const cashierParts = [
  ".v2-header", ".v2-sales-card", ".v2-sales-copy", ".v2-sales-visual",
  ".v2-chart-detail", ".v2-chart", ".v2-shifts", ".v2-tasks",
  ".v2-station-image", ".v2-monthly-cta", ".v2-info",
  ".v2-info h3", ".v2-info button", ".v2-wash", ".v2-admin-link",
  ".v2-change", ".v2-comparison", ".v2-task-manage", ".v2-message",
];
async function cashierLayout(page: Page) {
  return page.evaluate((selectors) => {
    const boxes = Object.fromEntries(selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) return [selector, null];
      const rect = element.getBoundingClientRect();
      return [selector, { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }];
    })) as Record<string, { left: number; top: number; right: number; bottom: number } | null>;
    return { boxes, width: innerWidth, height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight };
  }, cashierParts);
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
      cardWidth: box.width,
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
    await page.clock.install({ time: new Date("2026-10-08T09:00:00Z") });
    await page.setViewportSize({ width, height });
    await syntheticData(page);
    await page.goto("/station");
    await expect(page.locator(".v2-amount")).toContainText("38 450");
    await expect(page.locator(".v2-chart-detail.is-hint")).toContainText("Välj en stapel");
    await expect(page.locator(".v2-result-ring")).toHaveCount(0);
    expect(await dashboardSurfaces(page)).toEqual({
      sales: "rgb(255, 255, 255)", shifts: "rgb(255, 255, 255)",
      tasks: "rgb(251, 244, 233)", info: "rgb(255, 255, 255)",
    });
    await expect(page.getByRole("button", { name: /Förra månadens siffror/i })).toBeVisible();
    expect(await ferrariArtwork(page)).toEqual({
      source: "/ferrari-campaign-original.png", naturalSize: [2172, 724],
      fit: "contain", buttonBelowComparison: true, buttonInSalesCard: true, promoHasButton: false,
    });
    if (width >= 1300) {
      const promoArt = await page.locator(".v2-ferrari-art").boundingBox();
      const promoCard = await page.locator(".v2-station-image").boundingBox();
      expect(promoArt).not.toBeNull();
      expect(promoCard).not.toBeNull();
      expect(promoArt!.height).toBeGreaterThanOrEqual(promoCard!.height * .95);
    }
    const salesLayout = await cashierLayout(page);
    expect(salesLayout.boxes[".v2-message"]!.bottom).toBeLessThanOrEqual(salesLayout.boxes[".v2-sales-card"]!.bottom);
    expect(salesLayout.boxes[".v2-monthly-cta"]!.bottom).toBeLessThanOrEqual(salesLayout.boxes[".v2-sales-card"]!.bottom);
    expect(await dimensions(page)).toMatchObject({ viewportHeight: height, scrollHeight: height, viewportWidth: width, scrollWidth: width });
    await page.waitForTimeout(300);
    if (width === 1366 || width === 1920) await page.screenshot({ path: `test-results/v21-station-${width}.png` });
    if (width === 1366 || width === 1920) await page.screenshot({ path: `test-results/v22-station-${width}.png` });
    if (width === 1366 || width === 1920) {
      await page.screenshot({ path: `test-results/v23-dashboard-${width}x${height}.png` });
      await page.screenshot({ path: `test-results/v23-month-link-${width}x${height}.png` });
      if (width === 1920) {
        await page.locator(".v2-result-ribbon").screenshot({ path: "test-results/v23-result-closeup.png" });
        await page.locator(".v2-station-image").screenshot({ path: "test-results/v23-promo-closeup.png" });
      }
    }

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Välj ditt namn" })).toBeVisible();
    await expect(page.locator(".staff-card-metal")).toHaveCount(3);
    if (width === 1366) await page.screenshot({ path: "test-results/v23-seller.png" });
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
    expect(images.every((image) => Math.abs(image.cardWidth - image.width) <= 2.1 &&
      Math.abs(image.cardHeight - image.height) <= 2.1 &&
      Math.abs(image.width / image.height - 4 / 3) < 0.01)).toBe(true);
    expect(await dimensions(page)).toMatchObject({ viewportHeight: height, scrollHeight: height, viewportWidth: width, scrollWidth: width });
    if (width === 1366) await page.screenshot({ path: "test-results/v21-washes-desktop.png" });
    if (width === 1366) await page.screenshot({ path: "test-results/v23-register.png" });
    if (width === 1366 || width === 1920) await page.screenshot({ path: `test-results/v21-washes-layoutfix-${width}.png` });
    if (width === 1366 || width === 1920) await page.screenshot({ path: `test-results/full-originals-${width}.png` });

    await page.getByRole("button", { name: /Statistik/ }).first().click();
    await expect(page.getByRole("heading", { name: "Statistik" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Topplista snittköp", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: /Topplista snittköp i/ })).toBeVisible();
    expect(await dimensions(page)).toMatchObject({ viewportHeight: height, scrollHeight: height, viewportWidth: width, scrollWidth: width });
    if (width === 1366) await page.screenshot({ path: "test-results/v21-stats-desktop.png" });
    if (width === 1366) {
      await page.mouse.move(0, 0);
      await page.waitForTimeout(200);
      await page.screenshot({ path: "test-results/v23-statistics.png" });
    }
  });
}

for (const [width, height] of [[1024, 768], [1280, 1024], [1024, 650], [1280, 850]]) {
  test(`kassavy ${width}×${height} visar alla huvudfunktioner utan scroll eller överlapp`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-08T09:00:00Z") });
    await page.setViewportSize({ width, height });
    await syntheticData(page);
    await page.goto("/station");
    await expect(page.locator(".v2-amount")).toContainText("38 450");
    await expect(page.locator(".v2-info button")).toBeVisible();
    expect(await ferrariArtwork(page)).toEqual({
      source: "/ferrari-campaign-original.png", naturalSize: [2172, 724],
      fit: "contain", buttonBelowComparison: true, buttonInSalesCard: true, promoHasButton: false,
    });
    expect(await dashboardSurfaces(page)).toEqual({
      sales: "rgb(255, 255, 255)", shifts: "rgb(255, 255, 255)",
      tasks: "rgb(251, 244, 233)", info: "rgb(255, 255, 255)",
    });
    const layout = await cashierLayout(page);
    expect(layout.scrollWidth, JSON.stringify(layout)).toBe(width);
    expect(layout.scrollHeight, JSON.stringify(layout)).toBe(height);
    for (const [selector, box] of Object.entries(layout.boxes)) {
      expect(box, `${selector} saknas`).not.toBeNull();
      expect(box!.left, `${selector} utanför vänsterkanten`).toBeGreaterThanOrEqual(0);
      expect(box!.top, `${selector} ovanför viewporten`).toBeGreaterThanOrEqual(0);
      expect(box!.right, `${selector} utanför högerkanten`).toBeLessThanOrEqual(width);
      expect(box!.bottom, `${selector} under viewporten`).toBeLessThanOrEqual(height);
    }
    const regions = [".v2-sales-card", ".v2-shifts", ".v2-tasks", ".v2-station-image", ".v2-info", ".v2-wash"];
    for (const [index, first] of regions.entries()) for (const second of regions.slice(index + 1)) {
      const a = layout.boxes[first]!;
      const b = layout.boxes[second]!;
      const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      expect(overlap, `${first} överlappar ${second}`).toBe(false);
    }
    for (const [inner, outer] of [[".v2-task-manage", ".v2-tasks"],
      [".v2-info button", ".v2-info"], [".v2-monthly-cta", ".v2-sales-copy"],
      [".v2-chart", ".v2-sales-visual"], [".v2-comparison", ".v2-sales-copy"],
      [".v2-message", ".v2-sales-card"]]) {
      const item = layout.boxes[inner]!;
      const card = layout.boxes[outer]!;
      expect(item.left >= card.left && item.right <= card.right &&
        item.top >= card.top && item.bottom <= card.bottom,
      `${inner} klipps av i ${outer}: ${JSON.stringify({ item, card })}`).toBe(true);
    }
    await page.locator(".v2-bar-column").nth(1).click();
    await expect(page.locator(".v2-chart-detail")).toContainText("25 400");
    await expect(page.locator(".v2-bar-column").nth(1)).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(300); // Capture the detail after its approved reveal animation.
    await page.screenshot({ path: `test-results/v22-cashier-${width}x${height}.png` });
    await page.screenshot({ path: `test-results/v23-dashboard-${width}x${height}.png` });
    await page.screenshot({ path: `test-results/v23-month-link-${width}x${height}.png` });
  });
}

for (const [saleOre, label] of [[945000, "9 450 kr"], [3190700, "31 907 kr"], [10568000, "105 680 kr"]] as const) {
  test(`orange resultat visar hela dynamiska beloppet ${label}`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 650 });
    await syntheticData(page, saleOre);
    await page.goto("/station");
    const ribbon = page.locator(".v2-result-ribbon");
    const amount = ribbon.locator(".v2-amount");
    await expect(amount).toHaveText(label);
    const box = await ribbon.evaluate((element) => {
      const outer = element.getBoundingClientRect();
      const inner = element.querySelector(".v2-amount")!.getBoundingClientRect();
      return { fits: inner.left >= outer.left && inner.right <= outer.right,
        withinScreen: outer.left >= 0 && outer.right <= innerWidth,
        textIsLive: element.querySelector(".v2-amount")?.tagName === "SPAN" };
    });
    expect(box).toEqual({ fits: true, withinScreen: true, textIsLive: true });
  });
}

test("mobilvyer har inga horisontella överflöden", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-08T09:00:00Z") });
  await page.setViewportSize({ width: 390, height: 844 });
  await syntheticData(page);
  await page.goto("/station");
  await expect(page.getByRole("heading", { name: "IDAG JOBBAR" })).toBeVisible();
  expect(await ferrariArtwork(page)).toEqual({
    source: "/ferrari-campaign-original.png", naturalSize: [2172, 724],
    fit: "contain", buttonBelowComparison: true, buttonInSalesCard: true, promoHasButton: false,
  });
  expect((await dimensions(page)).scrollWidth).toBe(390);
  await page.screenshot({ path: "test-results/v21-station-mobile.png", fullPage: true });
  await page.screenshot({ path: "test-results/v22-station-mobile.png", fullPage: true });
  await page.screenshot({ path: "test-results/v23-dashboard-mobile.png", fullPage: true });
  await page.screenshot({ path: "test-results/v23-month-link-mobile.png", fullPage: true });
  await page.locator(".v2-bar-column").nth(1).click();
  await expect(page.locator(".v2-chart-detail .negative")).toContainText("8,6 %");
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

test("V2.3 adminförhandsvisningar använder enbart syntetiska uppgifter", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-08T09:00:00Z") });
  await page.setViewportSize({ width: 1366, height: 900 });
  await syntheticData(page);
  await page.route("**/api/admin/settings", (route) => route.fulfill({ json: {
    daily_goal: 25, monthly_goal: 500,
  } }));
  await page.route("**/api/admin/station/store-sales", (route) => route.fulfill({ json: {
    yesterday: "2026-10-07",
    rows: [{ business_date: "2026-10-07", net_sales_ore: 3845000,
      source: "demo", revision: 1, updated_at: "2026-10-08T07:00:00Z", actor: "Demo" }],
  } }));
  await page.route("**/api/admin/station/view-sessions", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/station/v2/schedule", (route) => route.fulfill({ json: {
    periods: [{ id: "demo", label: "Demomånad", starts_on: "2026-10-01", ends_on: "2026-10-31", updated_at: "" }],
    shifts: [{ id: "demo-shift", period_id: "demo", work_date: "2026-10-08",
      first_name: "Demo A", starts_at: "06:00", ends_at: "14:00",
      status: "active", revision: 0, updated_at: "" }],
  } }));
  await page.route("**/api/admin/station/v2/notices", (route) => route.fulfill({ json: [
    { id: "demo", title: "Demomeddelande", message: "Syntetiskt innehåll.", published: 1,
      expires_on: null, expires_time: null, revision: 0, updated_at: "" },
  ] }));
  await page.route("**/api/admin/station/v2/monthly", (route) => route.fulfill({ json: [] }));

  await page.goto("/");
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Översikt", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/v23-league-admin.png", fullPage: true });

  await page.goto("/station/admin");
  await expect(page.getByRole("heading", { name: "Arbetsschema" })).toBeVisible();
  await page.screenshot({ path: "test-results/v23-station-admin.png", fullPage: true });
});

test("veckostaplarna byter dagsvärde med klick, tangentbord och saknad jämförelse", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await syntheticData(page);
  await page.goto("/station");
  const bars = page.locator(".v2-bar-column");
  const detail = page.locator(".v2-chart-detail");
  await expect(bars).toHaveCount(7);
  await expect(bars.nth(6)).toHaveAttribute("aria-pressed", "true");
  await expect(detail).toContainText("Välj en stapel");
  await expect(detail).not.toContainText("38 450");
  await bars.nth(1).click();
  await expect(bars.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(bars.nth(6)).toHaveAttribute("aria-pressed", "false");
  await expect(detail).toContainText("25 400");
  await expect(detail.locator(".negative")).toContainText("8,6 %");
  await bars.nth(2).focus();
  await page.keyboard.press("Enter");
  await expect(bars.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(detail).toContainText("Ingen jämförelse tillgänglig");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(detail.locator(".v2-chart-detail-body")).toHaveCSS("animation-name", "none");
});
