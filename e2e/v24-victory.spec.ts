import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { sek } from "../src/api";

const programs = [
  { id: "preemium", name: "Preemium", price_sek: 389 },
  { id: "finast-plus", name: "Finast Plus", price_sek: 329 },
  { id: "hosttvatt", name: "Hösttvätt", price_sek: 259 },
  { id: "finast", name: "Finast", price_sek: 219 },
  { id: "fin", name: "Fin", price_sek: 179 },
  { id: "borstlos", name: "Borstlös", price_sek: 219 },
].map((program, sort_order) => ({ ...program, sort_order, active: 1 }));

async function catalog(page: Page) {
  await page.route("**/api/staff*", (route) => route.fulfill({ json: [
    { id: "demo-maja", name: "Maja", color: "#00573f", active: 1 },
  ] }));
  await page.route("**/api/wash-programs*", (route) => route.fulfill({ json: programs }));
  await page.route("**/api/stats?period=month", (route) => route.fulfill({ status: 503, json: { error: "Demo" } }));
  await page.goto("/");
  await page.locator(".staff-card").filter({ hasText: "Maja" }).click();
  await expect(page.locator(".wash-card")).toHaveCount(6);
}

async function screenshot(page: Page, name: string) {
  const dir = process.env.STATION_V24_SCREENSHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
}

async function assertFullImageButtons(page: Page, mobile: boolean) {
  const cards = page.locator(".wash-card");
  const boxes = await cards.evaluateAll((elements) => elements.map((card) => {
    const image = card.querySelector("img")!;
    const button = card.getBoundingClientRect();
    const imageBox = image.getBoundingClientRect();
    return {
      x: button.x, y: button.y, width: button.width, height: button.height,
      imageWidth: imageBox.width, imageHeight: imageBox.height,
      naturalRatio: image.naturalWidth / image.naturalHeight,
      loaded: image.complete && image.naturalWidth > 0,
      fit: getComputedStyle(image).objectFit,
      borderWidth: getComputedStyle(card).borderWidth,
      cardBackground: getComputedStyle(card).backgroundColor,
      imageBackground: getComputedStyle(card.querySelector(".wash-image")!).backgroundColor,
    };
  }));
  expect(boxes).toHaveLength(6);
  for (const box of boxes) {
    expect(box.loaded).toBe(true);
    expect(box.fit).toBe("contain");
    expect(box.borderWidth).toBe("0px");
    expect(box.cardBackground).toBe("rgba(0, 0, 0, 0)");
    expect(box.imageBackground).toBe("rgba(0, 0, 0, 0)");
    expect(Math.abs(box.width / box.height - box.naturalRatio)).toBeLessThan(.02);
    expect(Math.abs(box.width - box.imageWidth)).toBeLessThan(3);
    expect(Math.abs(box.height - box.imageHeight)).toBeLessThan(3);
  }
  const columns = mobile ? 2 : 3;
  for (let i = 0; i < columns; i++) {
    expect(boxes[i + columns].x).toBeCloseTo(boxes[i].x, 0);
    expect(boxes[i + columns].y).toBeGreaterThan(boxes[i].y);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("sex hela bildknappar i 3 × 2 på desktop och två kolumner på mobil", async ({ page }) => {
  for (let index = 1; index <= 5; index++) {
    const response = await page.request.get(`/celebrations/victory-${index}.webp`);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/webp");
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await catalog(page);
  await assertFullImageButtons(page, false);
  for (const [index, program] of programs.entries()) {
    await expect(page.locator(".wash-card").nth(index)).toHaveAttribute(
      "aria-label", `Registrera ${program.name}, ${sek(program.price_sek)}`,
    );
    const source = await page.locator(".wash-card img").nth(index).getAttribute("src");
    expect(source).toBe(`/wash-programs/${program.id}-600.webp`);
  }
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await screenshot(page, "wash-cards-desktop-1366x768");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await assertFullImageButtons(page, false);
  await screenshot(page, "wash-cards-desktop-1920x1080");
  await page.setViewportSize({ width: 390, height: 844 });
  await assertFullImageButtons(page, true);
  await screenshot(page, "wash-cards-mobile-390x844");
});

test("varje bildknapp registrerar rätt tvättprogram", async ({ page }) => {
  const registered: string[] = [];
  await page.route("**/api/sales", async (route) => {
    const payload = route.request().postDataJSON();
    registered.push(payload.wash_program_id);
    const program = programs.find((item) => item.id === payload.wash_program_id)!;
    await route.fulfill({ status: 201, json: {
      id: `demo-${registered.length}`, staff_id: payload.staff_id, wash_program_id: payload.wash_program_id,
      request_id: payload.request_id, price_sek: program.price_sek,
      sold_at: "2026-10-10T10:00:00Z", voided_at: null,
    } });
  });
  await catalog(page);
  for (const [index, program] of programs.entries()) {
    await page.locator(".wash-card").nth(index).click();
    await expect(page.locator(".victory-popup")).toContainText(program.name);
    await expect(page.locator(".wash-card").nth(index)).toBeEnabled();
  }
  expect(registered).toEqual(programs.map((program) => program.id));
});

test("popup visar bekräftat kvitto en gång och hindrar inte Ångra", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  let requests = 0;
  await page.route("**/api/sales", async (route) => {
    requests++;
    const payload = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: {
      id: `demo-sale-${requests}`, staff_id: payload.staff_id, wash_program_id: payload.wash_program_id,
      request_id: payload.request_id, price_sek: payload.wash_program_id === "finast-plus" ? 329 : 389,
      sold_at: "2026-10-10T10:00:00Z", voided_at: null,
    } });
  });
  await page.route("**/api/sales/demo-sale-1/void", (route) => route.fulfill({ json: {} }));
  await catalog(page);
  await page.evaluate(() => { Math.random = () => 0; });
  await page.getByRole("button", { name: /Registrera Preemium,/ }).dblclick();
  const popup = page.locator(".victory-popup");
  await expect(popup).toContainText(/Maja\s*·\s*Preemium\s*·\s*389\s*kr/);
  await expect(popup.locator("img")).toHaveAttribute("src", "/celebrations/victory-1.webp");
  await expect.poll(() => popup.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1448);
  expect(requests).toBe(1);
  expect(await page.locator(".victory-overlay").evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("none");
  expect(await popup.evaluate((element) => getComputedStyle(element).animationName)).toContain("victory-enter");
  await expect(page.locator(".victory-confetti i")).toHaveCount(120);
  const confettiCoverage = await page.locator(".victory-confetti i").evaluateAll((pieces) => ({
    min: Math.min(...pieces.map((piece) => parseFloat((piece as HTMLElement).style.left))),
    max: Math.max(...pieces.map((piece) => parseFloat((piece as HTMLElement).style.left))),
    durations: new Set(pieces.map((piece) => (piece as HTMLElement).style.animationDuration)).size,
  }));
  expect(confettiCoverage.min).toBeLessThan(5);
  expect(confettiCoverage.max).toBeGreaterThan(94);
  expect(confettiCoverage.durations).toBeGreaterThan(4);
  expect(await page.locator(".victory-confetti i").first().evaluate((element) => getComputedStyle(element).animationName)).toBe("victory-rain");
  await expect.poll(() => popup.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return Math.abs(box.left + box.width / 2 - innerWidth / 2) < 2 &&
      Math.abs(box.top + box.height / 2 - innerHeight / 2) < 2;
  })).toBe(true);
  await expect(page.getByRole("button", { name: "Ångra senaste" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await screenshot(page, "victory-popup-desktop-1366x768");
  await page.getByRole("button", { name: "Ångra senaste" }).click();
  await expect(page.locator(".confirmation")).toHaveText("Ångrad");
  await expect(popup).toHaveCount(0);
  await page.evaluate(() => { Math.random = () => .99; });
  await page.getByRole("button", { name: /Registrera Finast Plus,/ }).click();
  await expect(popup).toContainText(/Maja\s*·\s*Finast Plus\s*·\s*329\s*kr/);
  await expect(popup.locator("img")).toHaveAttribute("src", "/celebrations/victory-5.webp");
  await expect(page.locator(".victory-overlay")).toHaveCount(1);
  expect(requests).toBe(2);
  const animationDir = process.env.STATION_V24_ANIMATION_DIR;
  if (animationDir) {
    mkdirSync(animationDir, { recursive: true });
    for (let frame = 0; frame < 7; frame++) {
      await page.screenshot({ path: join(animationDir, `frame-${String(frame).padStart(2, "0")}.png`) });
      if (frame < 6) await page.waitForTimeout(230);
    }
  }
});

test("konfettiregnet anpassas till kassaskärm och mobil", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.route("**/api/sales", async (route) => {
    const payload = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: {
      id: "demo-responsive", staff_id: payload.staff_id, wash_program_id: payload.wash_program_id,
      request_id: payload.request_id, price_sek: 389, sold_at: "2026-10-10T10:00:00Z", voided_at: null,
    } });
  });
  await catalog(page);
  await page.getByRole("button", { name: /Registrera Preemium,/ }).click();
  const pieces = page.locator(".victory-confetti i");
  await expect(pieces).toHaveCount(120);
  expect(await pieces.evaluateAll((items) => items.filter((item) => getComputedStyle(item).display !== "none").length)).toBe(100);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await pieces.evaluateAll((items) => items.filter((item) => getComputedStyle(item).display !== "none").length)).toBe(60);
  expect(await page.locator(".victory-overlay").evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("none");
  await expect(page.getByRole("button", { name: "Ångra senaste" })).toBeEnabled();
});

test("snabba lyckade registreringar ersätter firandet och startar om sluttiden", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-10T10:00:00Z") });
  let count = 0;
  await page.route("**/api/sales", async (route) => {
    const payload = route.request().postDataJSON();
    count++;
    const program = programs.find((item) => item.id === payload.wash_program_id)!;
    await route.fulfill({ status: 201, json: {
      id: `demo-fast-${count}`, staff_id: payload.staff_id, wash_program_id: payload.wash_program_id,
      request_id: payload.request_id, price_sek: program.price_sek,
      sold_at: "2026-10-10T10:00:00Z", voided_at: null,
    } });
  });
  await catalog(page);
  await page.getByRole("button", { name: /Registrera Preemium,/ }).click();
  await expect(page.locator(".victory-popup")).toContainText("Preemium");
  await page.clock.fastForward(1000);
  await page.getByRole("button", { name: /Registrera Fin,/ }).click();
  await expect(page.locator(".victory-popup")).toContainText(/Maja\s*·\s*Fin\s*·\s*179\s*kr/);
  await expect(page.locator(".victory-overlay")).toHaveCount(1);
  await page.clock.fastForward(1300);
  await expect(page.locator(".victory-popup")).toContainText("Fin");
  await page.clock.fastForward(900);
  await expect(page.locator(".victory-overlay")).toHaveCount(0);
  expect(count).toBe(2);
});

test("fel och osäkert svar firas inte; samma kvitto återförsöks en gång", async ({ page }) => {
  let attempts = 0;
  const requestIds: string[] = [];
  await page.route("**/api/sales", async (route) => {
    attempts++;
    const payload = route.request().postDataJSON();
    requestIds.push(payload.request_id);
    if (attempts === 1) return route.fulfill({ status: 400, json: { error: "Ogiltigt tvättprogram." } });
    if (attempts === 2) return route.fulfill({ status: 503, json: { error: "Tillfälligt fel." } });
    return route.fulfill({ status: 200, json: {
      id: "demo-sale-retry", staff_id: payload.staff_id, wash_program_id: payload.wash_program_id,
      request_id: payload.request_id, price_sek: 179, sold_at: "2026-10-10T10:00:00Z", voided_at: null,
    } });
  });
  await catalog(page);
  const fin = page.getByRole("button", { name: /Registrera Fin,/ });
  await fin.click();
  await expect.poll(() => attempts).toBe(1);
  await expect(page.getByRole("alert")).toContainText("Ogiltigt tvättprogram");
  await expect(page.locator(".victory-popup")).toHaveCount(0);
  await expect(fin).toBeEnabled();
  await fin.click();
  await expect(page.getByRole("alert")).toContainText("räknas aldrig dubbelt");
  await expect(page.locator(".victory-popup")).toHaveCount(0);
  await page.getByRole("button", { name: "Försök igen", exact: true }).click();
  await expect(page.locator(".victory-popup")).toContainText(/Maja\s*·\s*Fin\s*·\s*179\s*kr/);
  expect(attempts).toBe(3);
  expect(requestIds[2]).toBe(requestIds[1]);
  expect(requestIds[1]).not.toBe(requestIds[0]);
  await expect(page.locator(".victory-popup")).toHaveCount(0, { timeout: 4000 });
});

test("mobilpopup är läsbar och rörelsereducering stänger av animationen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/sales", async (route) => {
    const payload = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: {
      id: "demo-sale-mobile", staff_id: payload.staff_id, wash_program_id: payload.wash_program_id,
      request_id: payload.request_id, price_sek: 329, sold_at: "2026-10-10T10:00:00Z", voided_at: null,
    } });
  });
  await catalog(page);
  await page.getByRole("button", { name: /Registrera Finast Plus,/ }).click();
  const popup = page.locator(".victory-popup");
  await expect(popup).toContainText(/Maja\s*·\s*Finast Plus\s*·\s*329\s*kr/);
  await expect.poll(() => popup.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1448);
  expect(await popup.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  expect(await page.locator(".victory-confetti").evaluate((element) => getComputedStyle(element).display)).toBe("none");
  expect(await popup.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth;
  })).toBe(true);
  await expect(page.getByRole("button", { name: "Ångra senaste" })).toBeEnabled();
  await screenshot(page, "victory-popup-mobile-390x844");
});
