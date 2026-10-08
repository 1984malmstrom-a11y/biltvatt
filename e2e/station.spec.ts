import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const localPin = () =>
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").match(
    /^ADMIN_PIN=(\d+)$/m,
  )![1];

test("stationsvisning kräver aktivering; admin kan skapa kod och återkalla enheten", async ({
  page,
  browser,
}) => {
  const deviceLabel = `Stationstest-TV-${Date.now()}`;
  await page.goto("/station");
  await expect(page).toHaveURL(/\/station\/login$/);
  await page.goto("/station/admin");
  await expect(
    page.getByRole("heading", { name: "Logga in som administratör" }),
  ).toBeVisible();
  await page.getByLabel("Administratörs-PIN").fill(localPin());
  await page.getByRole("button", { name: /Logga in/ }).click();
  await expect(
    page.getByRole("heading", { name: "Butikens dagsresultat" }),
  ).toBeVisible();
  await page.getByLabel("Enhetens namn").fill(deviceLabel);
  await page.getByRole("button", { name: "Skapa kod" }).click();
  const codeText = await page.locator(".station-code strong").textContent();
  expect(codeText).toMatch(/^[a-f0-9]{16}$/);

  const viewer = await browser.newContext();
  const viewerPage = await viewer.newPage();
  await viewerPage.goto("/station/login");
  await viewerPage.getByLabel("Aktiveringskod").fill(codeText!);
  await viewerPage.getByRole("button", { name: /Aktivera visning/ }).click();
  await expect(viewerPage).toHaveURL(/\/station$/);
  await expect(
    viewerPage.getByText(
      "Gårdagens försäljning är ännu inte registrerad.",
    ),
  ).toBeVisible();
  await expect(
    viewerPage.getByRole("link", { name: /ÖPPNA TVÄTTLIGAN/ }),
  ).toHaveAttribute("href", "/");
  await page.getByRole("button", { name: "Uppdatera enheter" }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  const deviceRow = page
    .locator(".station-device-list li")
    .filter({ hasText: deviceLabel });
  await deviceRow.getByRole("button", { name: "Återkalla" }).click();
  await expect(deviceRow.getByText("Återkallad")).toBeVisible();
  await viewerPage.reload();
  await expect(viewerPage).toHaveURL(/\/station\/login$/);
  await viewer.close();
});

test("stationsdashboard har tydlig hierarki utan scroll på TV och fungerar på mobil", async ({
  page,
}) => {
  await page.route("**/api/station/v2", (route) => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({today:"2026-10-08",shifts:[],tasks:[],notices:[],updated_at:null})}));
  await page.route("**/api/station/dashboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        business_date: "2026-10-07",
        comparison_date: "2025-10-08",
        net_sales_ore: 1234567,
        comparison_sales_ore: 1086543,
        difference_ore: 148024,
        percent: 13.623391242,
      }),
    }),
  );
  for (const [width, height] of [
    [1920, 1080],
    [1600, 900],
    [1366, 768],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/station");
    await expect(page.locator(".v2-amount")).toContainText("12 345,67");
    await expect(page.getByText("onsdag 8 oktober 2025")).toBeVisible();
    const size = await page.evaluate(() => ({
      scroll: document.documentElement.scrollHeight,
      viewport: innerHeight,
      horizontal: document.documentElement.scrollWidth > innerWidth,
    }));
    expect(size.horizontal).toBe(false);
    if (width >= 1366) expect(size.scroll).toBeLessThanOrEqual(size.viewport);
  }
});

test("dashboarden visar saknat jämförelsevärde och nollbas utan procent", async ({
  page,
}) => {
  await page.route("**/api/station/v2", (route) => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({today:"2026-10-08",shifts:[],tasks:[],notices:[],updated_at:null})}));
  let previous: number | null = null;
  await page.route("**/api/station/dashboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        business_date: "2026-10-07",
        comparison_date: "2025-10-08",
        net_sales_ore: 10000,
        comparison_sales_ore: previous,
        difference_ore: previous === null ? null : 10000,
        percent: null,
      }),
    }),
  );
  await page.goto("/station");
  await expect(page.getByText("Saknas", { exact: true })).toBeVisible();
  previous = 0;
  await page.reload();
  await expect(page.locator(".v2-change strong")).toContainText("—");
  await expect(page.locator(".v2-comparison")).toContainText(
    "100",
  );
});
