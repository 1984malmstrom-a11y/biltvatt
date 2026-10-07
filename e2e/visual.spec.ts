import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { sek, percent } from "../src/api";

async function checkLayout(page: Page, screenshot: string) {
  await page.mouse.move(0, 0);
  const audit = await page.evaluate(() => {
    const small = [
      ...document.querySelectorAll<HTMLElement>(
        "button, select, input:not([type=checkbox])",
      ),
    ]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.width > 0 &&
          box.height > 0 &&
          getComputedStyle(element).visibility !== "hidden" &&
          (box.width < 44 || box.height < 44)
        );
      })
      .map(
        (element) =>
          element.getAttribute("aria-label") || element.textContent?.trim(),
      );
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      small,
    };
  });
  expect(audit.overflow).toBe(false);
  expect(audit.small).toEqual([]);
  await page.screenshot({
    path: `test-results/visual-${screenshot}.png`,
    fullPage: true,
  });
}

test("visuell layout: sex vyer, verklig statistik, 3×2-program och 44-pixels tryckytor", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Emma Välj" })).toBeVisible();
  await checkLayout(page, "seller-desktop");
  await page.getByRole("button", { name: "Emma Välj" }).click();
  const cards = page.locator(".wash-card");
  await expect(cards).toHaveCount(6);
  await expect(page.locator(".wash-copy strong")).toHaveText([
    "Preemium",
    "Finast Plus",
    "Hösttvätt",
    "Finast",
    "Fin",
    "Borstlös",
  ]);
  await expect(page.locator(".wash-copy b")).toHaveText(
    [389, 329, 259, 219, 179, 199].map(sek),
  );
  await page.mouse.move(0, 0);
  // Wait for the existing hover transition to settle before measuring row alignment.
  await expect
    .poll(async () => {
      const boxes = await cards.evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return { x: box.x, y: box.y };
        }),
      );
      return (
        Math.max(...boxes.slice(0, 3).map((box) => box.y)) -
        Math.min(...boxes.slice(0, 3).map((box) => box.y))
      );
    })
    .toBeLessThan(1);
  const boxes = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y };
    }),
  );
  for (let i = 0; i < 3; i++) {
    expect(boxes[i + 3].x).toBe(boxes[i].x);
    expect(boxes[i + 3].y).toBeGreaterThan(boxes[i].y);
  }
  expect(
    await page
      .locator(".sale-footer")
      .evaluate((element) => element.getBoundingClientRect().bottom),
  ).toBeLessThan(900);
  await checkLayout(page, "sales-desktop");

  const actual = await (await request.get("/api/stats")).json();
  await page.getByRole("button", { name: "Statistik", exact: true }).click();
  await expect(page.locator(".kpi strong")).toHaveText([
    String(actual.count),
    sek(actual.revenue),
    sek(actual.average),
    percent(actual.premiumShare),
  ]);
  await checkLayout(page, "statistics-desktop");

  await page.getByRole("button", { name: "Admin", exact: true }).click();
  const pin = readFileSync(
    new URL("../.dev.vars", import.meta.url),
    "utf8",
  ).match(/^ADMIN_PIN=(\d+)$/m)![1];
  await page.getByLabel("Administratörs-PIN").fill(pin);
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
  await page.getByRole("button", { name: "Personal", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "Emma" })).toBeVisible();
  await checkLayout(page, "admin-personal-desktop");
  await page.getByRole("button", { name: "Logga ut", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Välkommen tillbaka" }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Registrera", exact: true }).click();
  await checkLayout(page, "sales-mobile");
  expect(
    await page
      .locator(".wash-grid")
      .evaluate(
        (element) =>
          getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
  ).toBe(2);
  await page.getByRole("button", { name: "Statistik", exact: true }).click();
  await expect(page.locator(".kpi-grid")).toBeVisible();
  await checkLayout(page, "statistics-mobile");
  expect(
    await page
      .locator(".leader-grid")
      .evaluate(
        (element) =>
          getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
  ).toBe(1);
  await page
    .getByRole("button", { name: "Valfri period", exact: true })
    .click();
  await expect(page.getByLabel("Från datum")).toBeVisible();
  await checkLayout(page, "statistics-mobile-custom");
});
