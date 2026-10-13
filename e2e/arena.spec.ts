import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { ArenaActivity, ArenaBootstrap, ArenaStats } from "../shared/arena";

const activities: ArenaActivity[] = Array.from({ length: 15 }, (_, i) => ({ id: `activity-${i}`, name: ["Biltvätt", "Korv", "Extra dryck", "Kaffe + bulle", "Spolarvätska", "Räksallad", "Två för"][i % 7] + (i > 6 ? ` ${i}` : ""), offer_text: "", price_text: "", points: i === 0 ? 2 : 1, image_key: i === 0 ? "demo-image" : null, category: i % 2 ? "Mat" : "Bilvård", sort_order: i, active: 1 }));
const sellers = ["Peter", "Alva", "Sofia", "Erik", "Linnea", "Anton", "Julia", "Oskar", "Maja", "Felix"].map((name, i) => ({ id: `s-${i}`, external_staff_id: String(i), name, color: "#4bd5ff", active: 1 }));
const boot: ArenaBootstrap = { station: { id: "mastertest", name: "STATIONEN" }, sellers, activities, campaign: { id: "campaign", name: "MÅNADENS FOKUS", activity_id: "activity-0", start_at: "2026-10-01T00:00:00Z", end_at: "2026-11-01T00:00:00Z", target_count: 100, target_points: 200, active: 1 } };
const stats: ArenaStats = { range: { start: "2026-10-13", end: "2026-10-13", from: "", to: "" }, points: 42, count: 18, today: { points: 42, count: 18, sellers: 3 }, campaign: { ...boot.campaign!, points: 148, count: 70 }, station_goals: [{ id: "g", period_type: "month", start_date: "2026-10-01", end_date: "2026-10-31", target_points: 1000, points: 742 }], personal_goals: [], leaderboard: sellers.map((s, i) => ({ ...s, rank: i + 1, points: 126 - i * 12, count: 12 - i, activities: [] })) };

async function visualData(page: Page, current: () => ArenaStats) {
  await page.route("**/api/arena/bootstrap", route => route.fulfill({ json: boot }));
  await page.route("**/api/arena/activity-images/demo-image", route => route.fulfill({ path: "public/wash-programs/finast-600.webp", contentType: "image/webp" }));
  await page.route("**/api/arena/stats*", route => route.fulfill({ json: current() }));
}
async function stateScreenshot(page: Page, name: string) {
  if (process.env.ARENA_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.ARENA_SCREENSHOT_DIR}/${name}.png` });
}

test("Arena: tvåtrycksflöde, dubbelt tryck, nytt namnval och säkert nätverksretry", async ({ page }) => {
  await page.route("**/api/arena/bootstrap", route => route.fulfill({ json: boot }));
  await page.route("**/api/arena/activity-images/demo-image", route => route.fulfill({ path: "public/wash-programs/finast-600.webp", contentType: "image/webp" }));
  await page.route("**/api/arena/stats*", route => route.fulfill({ json: stats }));
  const requests: { request_id: string; seller_id: string; activity_id: string }[] = [];
  let loseResponse = false;
  await page.route("**/api/arena/registrations", async route => {
    requests.push(route.request().postDataJSON());
    if (loseResponse) { loseResponse = false; await route.abort(); return; }
    await new Promise(resolve => setTimeout(resolve, 150));
    await route.fulfill({ json: { registration: { id: requests.at(-1)!.request_id, points_awarded: 2, seller_id: "s-0", activity_id: "activity-0", registered_at: new Date().toISOString(), voided_at: null } } });
  });
  await page.goto("/arena");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Biltvätt, +2 poäng", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Vem gjorde försäljningen?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Peter", exact: true }).dblclick();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("status")).toContainText("+2 POÄNG!"); expect(requests).toHaveLength(1);
  await expect.poll(() => page.locator(".arena-celebration").evaluate(el => getComputedStyle(el).opacity)).toBe("1");
  await stateScreenshot(page,"registration-reward");
  // The next activity immediately works while celebration is still playing.
  await page.getByRole("button", { name: "Korv, +1 poäng", exact: true }).click();
  await expect(dialog).toBeVisible(); await expect(dialog.getByRole("button", { name: "Peter", exact: true })).toBeEnabled();
  loseResponse = true; await dialog.getByRole("button", { name: "Peter", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Svaret kunde inte bekräftas");
  await expect(dialog.getByRole("button", { name: "Alva", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Försök igen", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(requests).toHaveLength(3); expect(requests[1].request_id).toBe(requests[2].request_id); expect(requests[0].request_id).not.toBe(requests[1].request_id);
});

for (const [width,height] of [[1920,1080],[1024,768],[390,844],[844,390]]) {
  test(`Arena: säljarpopup och Min Arena med mål ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width,height });
    const personal = structuredClone(stats);
    personal.personal_goals = [{ id: "personal", seller_id: "s-0", period_type: "week", start_date: "2026-10-12", end_date: "2026-10-18", target_points: 170, points: 142 }];
    personal.leaderboard[0] = { ...personal.leaderboard[0], points: 142, count: 48, activities: [
      { id: "a", name: "Biltvätt", category: "Bilvård", count: 24, points: 96 },
      { id: "b", name: "Extra dryck", category: "Dryck", count: 11, points: 22 },
      { id: "c", name: "Korv", category: "Mat", count: 8, points: 16 },
      { id: "d", name: "Spolarvätska", category: "Bilvård", count: 5, points: 8 },
    ] };
    personal.leaderboard = [{ ...personal.leaderboard[1], points:178, rank:1 }, { ...personal.leaderboard[2], points:148, rank:2 }, { ...personal.leaderboard[0], rank:3 }, ...personal.leaderboard.slice(3)];
    await visualData(page, () => personal); await page.goto("/arena");
    await page.getByRole("button", { name:"Biltvätt, +2 poäng", exact:true }).click();
    const popup = page.getByRole("dialog", { name:"Vem gjorde försäljningen?" });
    await expect(popup.getByRole("button", { name:"Peter", exact:true })).toBeVisible();
    expect(await popup.locator(".arena-sellers button").count()).toBe(10);
    await expect(popup.locator(".arena-modal-summary")).toContainText("+2");
    const circle = (await popup.locator(".arena-sellers button").first().boundingBox())!;
    expect(Math.abs(circle.width-circle.height)).toBeLessThanOrEqual(1);
    expect(circle.width).toBeGreaterThanOrEqual(44);
    await stateScreenshot(page, `sellers-${width}x${height}`);
    await page.keyboard.press("Escape"); await expect(popup).not.toBeVisible();
    await page.getByRole("button", { name:"TOPPLISTOR", exact:true }).click();
    await page.getByRole("dialog").getByRole("button", { name:/Peter/ }).click();
    const person = page.getByRole("dialog", { name:"Peter · Min Arena" });
    await expect(person.getByRole("progressbar", { name:"Personligt mål" })).toHaveAttribute("aria-valuenow","142");
    await expect(person).toContainText("28 poäng kvar"); await expect(person).toContainText("48");
    await expect(person).toContainText("6 poäng till nästa placering");
    await expect(person.locator(".arena-breakdown li")).toHaveCount(4);
    expect(await person.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await stateScreenshot(page, `person-${width}x${height}`);
    await person.getByRole("button", { name:"Fortsätt sälja", exact:true }).click();
    await expect(person).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);
  });
}

for (const kind of ["leader","personal-goal","station-goal"] as const) {
  for (const [width,height] of [[1920,1080],[390,844]]) {
    test(`Arena: ${kind} firar utan att blockera nästa registrering ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width,height });
      const before = structuredClone(stats), after = structuredClone(stats);
      before.leaderboard = [{ ...stats.leaderboard[1], rank:1, points:127 }, { ...stats.leaderboard[0], rank:2 }, ...stats.leaderboard.slice(2)];
      after.leaderboard = [{ ...stats.leaderboard[0], rank:1, points:128 }, { ...stats.leaderboard[1], rank:2, points:127 }, ...stats.leaderboard.slice(2)];
      if (kind !== "leader") {
        const goal = { id:"achievement", ...(kind === "personal-goal" ? { seller_id:"s-0" } : {}), period_type:"week" as const, start_date:"2026-10-12", end_date:"2026-10-18", target_points:150, points:148 };
        const key = kind === "personal-goal" ? "personal_goals" : "station_goals";
        before[key]=[goal]; after[key]=[{ ...goal, points:150 }];
      }
      let recorded=false;
      await visualData(page, () => recorded ? after : before);
      await page.route("**/api/arena/registrations", route => {
        recorded=true; const payload=route.request().postDataJSON();
        return route.fulfill({json:{registration:{id:payload.request_id, seller_id:payload.seller_id, activity_id:payload.activity_id, points_awarded:2, registered_at:new Date().toISOString(), voided_at:null}}});
      });
      await page.goto("/arena"); await expect(page.locator(".arena-progress-track strong").first()).toBeVisible();
      await page.getByRole("button", { name:"Biltvätt, +2 poäng", exact:true }).click();
      await page.getByRole("dialog").getByRole("button", { name:"Peter", exact:true }).click();
      const reward=page.locator(`.celebration-${kind}`);
      await expect(reward).toBeVisible(); await expect(reward).toContainText("+2 POÄNG!");
      await expect(reward.getByRole("heading")).toHaveText(kind === "leader" ? "NY ETTA!" : "VECKOMÅL UPPNÅTT!");
      await expect.poll(() => reward.evaluate(el => getComputedStyle(el).opacity)).toBe("1");
      expect(await reward.evaluate(el => getComputedStyle(el).pointerEvents)).toBe("none");
      expect(await reward.locator(".arena-confetti").count()).toBeLessThanOrEqual(12);
      expect(await page.locator("canvas").count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);
      await stateScreenshot(page, `${kind}-${width}x${height}`);
      await page.emulateMedia({ reducedMotion:"reduce" });
      expect(await reward.locator(".arena-confetti").first().evaluate(el => getComputedStyle(el).display)).toBe("none");
      await page.getByRole("button", { name:"Korv, +1 poäng", exact:true }).click();
      await expect(page.getByRole("dialog", { name:"Vem gjorde försäljningen?" })).toBeVisible();
      await expect(page.getByRole("dialog").getByRole("button", { name:"Peter", exact:true })).toBeEnabled();
    });
  }
}

for (const [width, height] of [[1920,1080],[1024,768],[390,844],[844,390]]) {
  test(`Arena: touch och ingen vertikal overflow ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.route("**/api/arena/bootstrap", route => route.fulfill({ json: boot }));
    await page.route("**/api/arena/activity-images/demo-image", route => route.fulfill({ path: "public/wash-programs/finast-600.webp", contentType: "image/webp" }));
    await page.route("**/api/arena/stats*", route => route.fulfill({ json: stats }));
    await page.goto("/arena"); await expect(page.locator(".arena-stage")).toBeVisible();
    const buttons = page.locator(".arena-stage .arena-orb"); await expect(buttons).toHaveCount(7);
    expect(await page.evaluate(() => ({ document: document.documentElement.scrollHeight, body: document.body.scrollHeight, height: innerHeight }))).toEqual({ document: height, body: height, height });
    for (let i = 0; i < await buttons.count(); i++) {
      const bounds = (await buttons.nth(i).boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width); expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
      await buttons.nth(i).click(); await expect(page.getByRole("dialog")).toBeVisible(); await page.getByRole("button", { name: "Stäng", exact: true }).click();
    }
    if (process.env.ARENA_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.ARENA_SCREENSHOT_DIR}/arena-${width}x${height}.png` });
    await page.getByRole("button", { name: "Nästa aktiviteter", exact: true }).click();
    await expect(page.getByRole("button", { name: "Biltvätt 7, +1 poäng", exact: true })).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" }); expect(await page.locator(".arena-crown").evaluate(el => getComputedStyle(el).animationName)).toBe("none");
    await page.getByRole("button", { name: "TOPPLISTOR", exact: true }).click(); await expect(page.getByRole("dialog", { name: "Topplistor & statistik" })).toBeVisible();
    await page.getByRole("dialog", { name: "Topplistor & statistik" }).getByRole("button", { name: /Peter/ }).click(); await expect(page.getByRole("dialog", { name: "Peter · Min Arena" })).toBeVisible();
  });
}

test("Arena: riktig lokal Worker sparar snapshot, undo och adminbild genom UI", async ({ page }) => {
  const pin = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").match(/^ADMIN_PIN=(\d+)$/m)![1];
  expect((await page.request.post("/api/admin/login", { data: { pin } })).status()).toBe(200);
  const staffName = `Arena E2E ${Date.now()}`;
  const staffCreated = await page.request.post("/api/admin/staff", { data: { name: staffName, color: "#48d4ff" } });
  expect(staffCreated.status()).toBe(201);
  expect((await page.request.get("/api/arena/bootstrap")).status()).toBe(200);
  const staff = await (await page.request.get("/api/staff")).json() as { id: string; name: string }[];
  expect(staff.length).toBeGreaterThan(0);
  const activityName = `E2E-${Date.now()}`;
  await page.goto("/arena/admin"); await expect(page.getByRole("heading", { name: "Skapa aktivitet" })).toBeVisible();
  await page.getByLabel("Namn", { exact: true }).fill(activityName);
  await page.getByLabel("Poäng", { exact: true }).fill("0.5");
  // A wide product proves contain scaling and the separate binary endpoint work in a real browser.
  const png = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 1000; canvas.height = 200;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "red"; ctx.fillRect(0, 0, 1000, 200);
    const blob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), "image/png")); return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await page.getByLabel("Produktbild", { exact: true }).setInputFiles({ name: "product.png", mimeType: "image/png", buffer: Buffer.from(png) });
  await expect(page.locator(".arena-preview img")).toBeVisible();
  await page.getByRole("button", { name: "Spara", exact: true }).click(); await expect(page.getByRole("status")).toContainText("Sparat");
  const config = await (await page.request.get("/api/admin/arena/config")).json() as { activities: typeof activities };
  const activity = config.activities.find(a => a.name === activityName)!; expect(activity.image_key).toBeTruthy();
  const image = await page.request.get(`/api/arena/activity-images/${activity.image_key}`); expect(image.status()).toBe(200); expect((await image.body()).length).toBeLessThan(250000);
  const baseline = await (await page.request.get("/api/arena/stats")).json() as ArenaStats;
  await page.goto("/arena"); await expect(page.locator(".arena-orb").first()).toBeVisible();
  const ownActivity = page.getByRole("button", { name: `${activityName}, +0,5 poäng`, exact: true });
  for (let i = 0; !await ownActivity.isVisible() && i < Math.ceil(config.activities.length / 6); i++) await page.getByRole("button", { name: "Nästa aktiviteter", exact: true }).click();
  await ownActivity.click();
  await page.getByRole("dialog").getByRole("button", { name: staffName, exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByRole("status")).toContainText("+0,5 POÄNG!");
  let current = await (await page.request.get("/api/arena/stats")).json() as ArenaStats; expect(current).toMatchObject({ count: baseline.count + 1, points: baseline.points + 0.5 });
  await page.getByRole("button", { name: /Ångra senaste/ }).click();
  await expect(page.getByRole("button", { name: /Ångra senaste/ })).toHaveCount(0);
  current = await (await page.request.get("/api/arena/stats")).json() as ArenaStats; expect(current).toMatchObject({ count: baseline.count, points: baseline.points });
  const { id, ...draft } = activity;
  expect((await page.request.patch(`/api/admin/arena/activities/${id}`, { data: { ...draft, active: 0 } })).status()).toBe(200);
});
