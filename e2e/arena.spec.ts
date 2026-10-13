import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { ArenaActivity, ArenaBootstrap, ArenaStats } from "../shared/arena";

const activities: ArenaActivity[] = Array.from({ length: 15 }, (_, i) => ({ id: `activity-${i}`, name: ["Biltvätt", "Korv", "Två för 25", "Kaffe + bulle", "Spolarvätska", "Räksallad", "Två för 30"][i % 7] + (i > 6 ? ` ${i}` : ""), offer_text: i === 0 ? "Finast Plus" : i === 2 ? "TVÅ FÖR" : "", price_text: i === 2 ? "25:–" : "", points: i === 0 ? 2 : 1, image_key: i === 0 ? "demo-image" : null, category: i % 2 ? "Mat" : "Bilvård", sort_order: i, active: 1 }));
const sellers = ["Peter", "Alva", "Sofia", "Erik", "Linnea", "Anton", "Julia", "Oskar", "Maja", "Felix"].map((name, i) => ({ id: `s-${i}`, external_staff_id: String(i), name, color: "#4bd5ff", active: 1 }));
const boot: ArenaBootstrap = { station: { id: "mastertest", name: "STATIONEN" }, sellers, activities, campaign: { id: "campaign", name: "MÅNADENS FOKUS", activity_id: "activity-0", start_at: "2026-09-30T22:00:00Z", end_at: "2026-10-31T23:00:00Z", target_count: 100, target_points: 200, active: 1 } };
const stats: ArenaStats = { range: { start: "2026-10-13", end: "2026-10-13", from: "", to: "" }, points: 42, count: 18, today: { points: 42, count: 18, sellers: 3 }, campaign: { ...boot.campaign!, points: 148, count: 70 }, station_goals: [{ id: "g", period_type: "month", start_date: "2026-10-01", end_date: "2026-10-31", target_points: 1000, points: 742 }], personal_goals: [], leaderboard: sellers.map((s, i) => ({ ...s, rank: i + 1, points: 126 - i * 12, count: 12 - i, activities: [] })) };

async function visualData(page: Page, current: () => ArenaStats) {
  await page.route("**/api/arena/bootstrap", route => route.fulfill({ json: boot }));
  await page.route("**/api/arena/activity-images/demo-image", route => route.fulfill({ path: "public/wash-programs/finast-600.webp", contentType: "image/webp" }));
  await page.route("**/api/arena/stats*", route => route.fulfill({ json: current() }));
}
async function stateScreenshot(page: Page, name: string) {
  if (process.env.ARENA_SCREENSHOT_DIR) {
    await page.locator(".arena-stage img").evaluateAll(images => Promise.all(images.map(el => (el as HTMLImageElement).decode().catch(() => undefined))));
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({ path: `${process.env.ARENA_SCREENSHOT_DIR}/${name}.png` });
  }
}

const productAssets = [
  ["Biltvätt", "01_arena-biltvatt.webp"],
  ["Korv med mos", "02_arena-korv-med-mos.webp"],
  ["Två för 25", "03_arena-tva-for-25.webp"],
  ["Kaffe + bulle", "04_arena-kaffe-bulle.webp"],
  ["Spolarvätska", "05_arena-spolarvatska.webp"],
  ["Räksallad", "06_arena-raksallad.webp"],
  ["Två för 30", "07_arena-tva-for-30.webp"],
];
const cleanProducts = productAssets.map(([name], i) => ({ ...activities[i], name, image_key:"demo-image", offer_text:i === 0 ? "Finast Plus" : "", price_text:i === 2 ? "25:–" : i === 6 ? "30:–" : "" }));
for (const [width,height] of [[1920,1080],[1024,768],[390,844],[844,390]]) {
  test(`Arena: sju rena produktmotiv med contain och fri text ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width,height }); await visualData(page, () => stats);
    await page.route("**/api/arena/bootstrap", route => route.fulfill({ json:{ ...boot, activities:cleanProducts } }));
    const demos: string[] = [];
    await page.route("**/api/arena/activity-images/demo-image", route => { demos.push(route.request().url()); return route.abort(); });
    await page.goto("/arena");
    await expect(page.locator(".arena-stage .arena-orb")).toHaveCount(7);
    for (let i=0; i<productAssets.length; i++) {
      const [name,file] = productAssets[i], activity = cleanProducts[i];
      const button = page.getByRole("button", { name:`${name}${i === 2 || i === 6 ? ":-" : ""}, +${activity.points} poäng`, exact:true });
      const img = button.locator(".arena-product img");
      await expect(img).toHaveAttribute("src", `/arena-products/${file}`);
      await expect.poll(() => img.evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
      const geometry = await button.evaluate(el => {
        const orb = el.getBoundingClientRect();
        const image = el.querySelector("img")!, box = image.getBoundingClientRect(), style = getComputedStyle(image);
        const canvas=document.createElement("canvas"); canvas.width=image.naturalWidth; canvas.height=image.naturalHeight;
        const context=canvas.getContext("2d")!; context.drawImage(image,0,0);
        const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
        const alpha=[canvas.width,canvas.height,0,0];
        // Ignore almost invisible edge antialiasing; measure the actual rendered motif.
        for (let y=0;y<canvas.height;y++) for (let x=0;x<canvas.width;x++) if (pixels[(y*canvas.width+x)*4+3]>=16) {
          alpha[0]=Math.min(alpha[0],x); alpha[1]=Math.min(alpha[1],y); alpha[2]=Math.max(alpha[2],x+1); alpha[3]=Math.max(alpha[3],y+1);
        }
        const copy = el.querySelector(".arena-product-copy")!.getBoundingClientRect();
        const badge = el.querySelector(".arena-points")!.getBoundingClientRect();
        const scale = style.transform === "none" ? 1 : new DOMMatrixReadOnly(style.transform).a;
        const px = (side: string) => parseFloat(style.getPropertyValue(`padding-${side}`)) * scale;
        const width = box.width-px("left")-px("right"), height = box.height-px("top")-px("bottom"), size = Math.min(width,height);
        const left = box.left+px("left")+(width-size)/2, top = box.top+px("top")+(height-size)/2;
        const motif = { left:left+alpha[0]*size/canvas.width, top:top+alpha[1]*size/canvas.height, right:left+alpha[2]*size/canvas.width, bottom:top+alpha[3]*size/canvas.height };
        return { fit:style.objectFit, position:style.objectPosition, inside:motif.left>=orb.left+1 && motif.right<=orb.right-1 && motif.top>=orb.top+1 && motif.bottom<=orb.bottom-1, clear:motif.bottom<=copy.top+1 && copy.bottom<=badge.top+1, motifHeight:motif.bottom-motif.top, orbHeight:orb.height, motifWidth:motif.right-motif.left, orbWidth:orb.width };
      });
      expect(geometry).toMatchObject({ fit:"contain", position:"50% 50%", inside:true, clear:true });
      expect(geometry.motifHeight/geometry.orbHeight).toBeGreaterThan(i === 0 ? .45 : .32);
      expect(geometry.motifWidth/geometry.orbWidth).toBeGreaterThan(i === 0 ? .6 : .25);
      await expect(button.locator(".arena-product-copy")).toContainText(name);
      await expect(button.locator(".arena-points")).toContainText(`+${activity.points} POÄNG`);
      expect(await button.locator("img").count()).toBe(1);
    }
    expect(demos).toEqual([]);
    const positions = await page.locator(".arena-stage .arena-orb").evaluateAll(orbs => orbs.map(orb => {
      const r = orb.getBoundingClientRect(); return { x:r.x+r.width/2, y:r.y+r.height/2 };
    }));
    for (const i of [1,3,5]) expect(positions[i].x).toBeLessThan(positions[0].x);
    for (const i of [2,4,6]) expect(positions[i].x).toBeGreaterThan(positions[0].x);
    expect(positions[1].y).toBeLessThan(positions[3].y); expect(positions[3].y).toBeLessThan(positions[5].y);
    expect(positions[2].y).toBeLessThan(positions[4].y); expect(positions[4].y).toBeLessThan(positions[6].y);
    const crown = (await page.locator(".arena-focus-slot .arena-crown").boundingBox())!;
    const focus = (await page.locator(".arena-focus-slot .arena-orb").boundingBox())!;
    expect(crown.y).toBeGreaterThan(focus.y); expect(crown.y+crown.height).toBeLessThan(focus.y+focus.height);
    expect(await page.evaluate(() => ({ width:document.documentElement.scrollWidth, height:document.documentElement.scrollHeight }))).toEqual({ width,height });
    await stateScreenshot(page, `products-${width}x${height}`);
    await page.getByRole("button", { name:"Biltvätt, +2 poäng", exact:true }).click();
    await expect(page.getByRole("dialog").locator(".arena-selected-product img")).toHaveAttribute("src", "/arena-products/01_arena-biltvatt.webp");
    await page.getByRole("button", { name:"Stäng", exact:true }).click();
    await page.route("**/api/arena/bootstrap", route => route.fulfill({ json:{ ...boot, activities:cleanProducts.map(a => a.id === "activity-0" || a.id === "activity-2" ? { ...a, active:0 } : a) } }));
    await page.reload();
    await expect(page.locator(".arena-stage .arena-orb")).toHaveCount(7);
    for (const name of ["Biltvätt","Två för 25:-"]) {
      const missing=page.getByRole("button", { name:`${name}, ej upplagd`, exact:true });
      await expect(missing).toBeDisabled();
      await expect(missing.locator(".arena-points")).toHaveText("EJ UPPLAGD");
      await expect.poll(() => missing.locator("img").evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth>0)).toBe(true);
      const usable=await missing.evaluate(el => {
        const image=el.querySelector("img")!.getBoundingClientRect(),copy=el.querySelector(".arena-product-copy")!.getBoundingClientRect(),badge=el.querySelector(".arena-points")!.getBoundingClientRect();
        return { fit:getComputedStyle(el.querySelector("img")!).objectFit, readable:copy.bottom<=badge.top+1, art:image.width>0 };
      });
      expect(usable).toEqual({ fit:"contain", readable:true, art:true });
    }
    expect(await page.evaluate(() => ({ width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight }))).toEqual({ width,height });
    await stateScreenshot(page, `unavailable-${width}x${height}`);
  });
}

for (const [width,height] of [[1920,1080],[1024,768],[390,844],[844,390]]) {
  test(`Arena: premium-topplista behåller perioder, poäng och Min Arena ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width,height }); await visualData(page, () => stats);
    const queries: URLSearchParams[] = [];
    await page.route("**/api/arena/stats*", route => {
      queries.push(new URL(route.request().url()).searchParams);
      return route.fulfill({ json:stats });
    });
    await page.goto("/arena");
    const desktop = width >= 1024;
    if (!desktop) await page.getByRole("button", { name:"TOPPLISTOR", exact:true }).click();
    const panel = desktop ? page.locator(".arena-leaderboard") : page.getByRole("dialog", { name:"Topplistor & statistik" });
    await expect(panel.locator(".arena-leader-list button")).toHaveCount(10);
    await expect(panel.locator(".arena-rank")).toHaveText(stats.leaderboard.map(p => String(p.rank)));
    await expect(panel.locator(".arena-rank svg")).toHaveCount(0);
    for (const person of stats.leaderboard) {
      await expect(panel.getByRole("button", { name:`${person.name} ${person.points} p`, exact:true })).toBeAttached();
    }
    const geometry = await panel.locator(".arena-leader-list button").evaluateAll(rows => rows.map(row => {
      const box=row.getBoundingClientRect(), name=row.children[2].getBoundingClientRect(), points=row.children[3].getBoundingClientRect();
      return { touch:box.height>=44, distinct:name.right<=points.left, inside:points.right<=box.right && name.left>=box.left };
    }));
    expect(geometry.every(row => row.touch && row.distinct && row.inside)).toBe(true);
    if (width === 1920) {
      const last = (await panel.locator(".arena-leader-list button").last().boundingBox())!;
      const list = (await panel.locator(".arena-leader-list").boundingBox())!;
      expect(last.y+last.height).toBeLessThanOrEqual(list.y+list.height);
    }
    const period = panel.getByRole("button", { name:"VECKA", exact:true });
    await period.click(); await expect(period).toHaveAttribute("aria-pressed","true");
    await expect.poll(() => queries.at(-1)?.get("period")).toBe("week");
    await panel.getByRole("button", { name:"MÅNAD", exact:true }).click();
    await expect.poll(() => queries.at(-1)?.get("period")).toBe("month");
    await panel.getByRole("button", { name:"PERIOD", exact:true }).click();
    await panel.getByLabel("Från", { exact:true }).fill("2026-10-01");
    await panel.getByLabel("Till", { exact:true }).fill("2026-10-13");
    await expect.poll(() => queries.at(-1)?.get("start")).toBe("2026-10-01");
    expect(queries.at(-1)?.get("end")).toBe("2026-10-13");
    expect(queries.at(-1)?.get("period")).toBe("custom");
    await panel.getByRole("button", { name:"IDAG", exact:true }).click();
    await expect.poll(() => queries.at(-1)?.get("period")).toBe("today");
    expect(await page.evaluate(() => ({ width:document.documentElement.scrollWidth, height:document.documentElement.scrollHeight }))).toEqual({ width,height });
    await stateScreenshot(page, `leaderboard-${width}x${height}`);
    if (desktop) {
      await panel.getByRole("button", { name:"SE FLER TOPPLISTOR", exact:true }).click();
      await expect(page.getByRole("dialog", { name:"Topplistor & statistik" })).toBeVisible();
      await page.getByRole("button", { name:"Stäng", exact:true }).click();
    }
    await panel.getByRole("button", { name:"Peter 126 p", exact:true }).click();
    await expect(page.getByRole("dialog", { name:"Peter · Min Arena" })).toBeVisible();
  });
}

test("Arena-admin: samma sju produktbilder i preview och ny uppladdning prioriteras", async ({ page }) => {
  await visualData(page, () => stats);
  await page.route("**/api/admin/arena/config", route => route.fulfill({ json:{ activities:cleanProducts, campaigns:[], station_goals:[], personal_goals:[] } }));
  await page.goto("/arena/admin");
  for (const [name,file] of productAssets) {
    await page.getByRole("button", { name:`Redigera aktivitet: ${name}`, exact:true }).click();
    const preview = page.locator(".arena-preview img");
    await expect(preview).toHaveAttribute("src", `/arena-products/${file}`);
    await expect.poll(() => preview.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await preview.evaluate(el => getComputedStyle(el).objectFit)).toBe("contain");
  }
  await page.getByLabel("Produktbild", { exact:true }).setInputFiles("public/arena-products/01_arena-biltvatt.webp");
  await expect(page.locator(".arena-preview img")).toHaveAttribute("src", /^blob:/);
  expect(await page.locator(".arena-preview img").evaluate(el => getComputedStyle(el).objectFit)).toBe("contain");
  await stateScreenshot(page,"product-upload-preview");
});

test("Arena: startsidan väljer rätt sju trots fel kampanj, fler aktiviteter och annan listordning", async ({ page }) => {
  await visualData(page, () => stats);
  const entries = [...cleanProducts].reverse();
  entries[4] = { ...entries[4], name:"Två för", price_text:"25:-" };
  await page.route("**/api/arena/bootstrap", route => route.fulfill({ json:{ ...boot, campaign:{ ...boot.campaign, activity_id:"scraper" }, activities:[{ ...activities[2], id:"extra", name:"Extra dryck" }, { ...activities[6], id:"scraper", name:"Isskrapa" }, ...entries] } }));
  await page.goto("/arena");
  await expect(page.locator(".arena-focus-slot .arena-product-copy strong")).toHaveText("Biltvätt");
  await expect(page.locator(".arena-satellite .arena-product-copy strong")).toHaveText(["Korv med mos","Två för 25:-","Kaffe + bulle","Spolarvätska","Räksallad","Två för 30:-"]);
  await expect(page.locator(".arena-stage .arena-orb")).toHaveCount(7);
  await expect(page.locator(".arena-stage")).not.toContainText("Extra dryck");
  await expect(page.locator(".arena-stage")).not.toContainText("Isskrapa");
  let registered: { activity_id: string } | undefined;
  await page.route("**/api/arena/registrations", route => {
    registered = route.request().postDataJSON();
    return route.fulfill({ json:{ registration:{ id:crypto.randomUUID(), points_awarded:1, voided_at:null } } });
  });
  await page.getByRole("button", { name:"Två för 25:-, +1 poäng", exact:true }).click();
  await expect(page.getByRole("dialog").locator(".arena-selected-product img")).toHaveAttribute("src", "/arena-products/03_arena-tva-for-25.webp");
  await page.getByRole("dialog").getByRole("button", { name:"Peter", exact:true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(registered?.activity_id).toBe(entries[4].id);
});

for (const [width, height] of [[1920,1080],[1024,768],[390,844],[844,390]]) {
  test(`Arena: hero burst är läsbar, kort och klickar igenom ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width,height }); await visualData(page, () => stats);
    await page.route("**/api/arena/registrations", route => {
      const payload = route.request().postDataJSON();
      return route.fulfill({ json:{ registration:{ id:payload.request_id, points_awarded:2, voided_at:null } } });
    });
    await page.goto("/arena"); await page.getByRole("button", { name:"Biltvätt, +2 poäng", exact:true }).click();
    await page.getByRole("dialog").getByRole("button", { name:"Peter", exact:true }).click();
    const reward = page.locator(".celebration-points");
    await expect(reward).toContainText("SÄLJNINGEN REGISTRERAD");
    await expect(reward).toContainText("BRA JOBBAT!"); await expect(reward.locator(".arena-reward-seller")).toHaveText("Peter");
    await expect.poll(() => reward.evaluate(el => getComputedStyle(el).opacity)).toBe("1");
    await expect.poll(() => reward.locator(".arena-reward-ring").evaluate(el => getComputedStyle(el).opacity)).toBe("1");
    const ring = (await reward.locator(".arena-reward-ring").boundingBox())!;
    for (const selector of [".arena-reward-activity", ".arena-reward-points", ".arena-reward-seller", ".arena-reward-check", ".arena-reward-encouragement"]) {
      const box = (await reward.locator(selector).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(ring.x); expect(box.x+box.width).toBeLessThanOrEqual(ring.x+ring.width);
      expect(box.y).toBeGreaterThanOrEqual(ring.y); expect(box.y+box.height).toBeLessThanOrEqual(ring.y+ring.height);
    }
    await stateScreenshot(page, `hero-burst-${width}x${height}`);
    await page.getByRole("button", { name:"Korv med mos, +1 poäng", exact:true }).click();
    await expect(page.getByRole("dialog", { name:"Vem gjorde försäljningen?" })).toBeVisible();
    await expect(reward).toHaveCount(0, { timeout:1600 });
  });
}

test("Arena: Min Arena på vanlig desktop har ett hjälpsamt tomt mål", async ({ page }) => {
  await page.setViewportSize({ width:1366,height:768 }); await visualData(page, () => stats);
  await page.goto("/arena"); await page.getByRole("button", { name:/Peter 126 p/ }).click();
  const person = page.getByRole("dialog", { name:"Peter · Min Arena" });
  await expect(person).toContainText("Inget personligt mål satt ännu");
  await expect(person).toContainText("Stationsadmin kan sätta ett mål för dig");
  await expect(person.locator(".arena-person-goal")).toContainText("Inte satt ännu");
  expect(await person.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
  expect(await person.evaluate(el => getComputedStyle(el).colorScheme)).toBe("dark");
  await stateScreenshot(page, "person-empty-desktop");
});

test("Arena-admin: mänskliga listor, vald post, ordning och periodförval", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-13T12:00:00Z"));
  const config = { activities, campaigns:[boot.campaign], station_goals:stats.station_goals, personal_goals:[{ id:"personal", seller_id:"s-0", period_type:"week", start_date:"2026-10-12", end_date:"2026-10-18", target_points:100 }] };
  await visualData(page, () => stats);
  const saves: Record<string, unknown>[] = [];
  await page.route("**/api/admin/arena/config", route => route.fulfill({ json:config }));
  await page.route("**/api/admin/arena/activities/*", route => { saves.push(route.request().postDataJSON()); return route.fulfill({ json:{ id:"activity-0" } }); });
  await page.route("**/api/admin/arena/campaigns/*", route => { saves.push(route.request().postDataJSON()); return route.fulfill({ json:{ id:"campaign" } }); });
  await page.goto("/arena/admin");
  const activity = page.getByRole("button", { name:"Redigera aktivitet: Biltvätt", exact:true });
  await expect(activity).toContainText("Ordning 1"); await activity.click(); await expect(activity).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Ordning", { exact:true })).toHaveValue("1");
  await page.getByLabel("Ordning", { exact:true }).fill("2"); await page.getByRole("button", { name:"Spara", exact:true }).click();
  await expect(page.getByRole("status")).toContainText("Sparat"); expect(saves[0].sort_order).toBe(1);
  await page.getByRole("button", { name:"Kampanj / fokus", exact:true }).click();
  const campaign = page.getByRole("button", { name:"Redigera kampanj: MÅNADENS FOKUS", exact:true });
  await expect(campaign).toContainText("Biltvätt"); await expect(campaign).toContainText("200 p · 100 st");
  await expect(campaign).toContainText("1–31 okt"); await campaign.click(); await expect(campaign).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("combobox", { name:"Period", exact:true }).selectOption("week");
  await expect(page.getByLabel("Startdatum", { exact:true })).toHaveValue("2026-10-12");
  await expect(page.getByLabel("Slutdatum (inklusive)")).toHaveValue("2026-10-18");
  await page.getByRole("combobox", { name:"Period", exact:true }).selectOption("month");
  await expect(page.getByLabel("Startdatum", { exact:true })).toHaveValue("2026-10-01");
  await expect(page.getByLabel("Slutdatum (inklusive)")).toHaveValue("2026-10-31");
  await page.getByRole("combobox", { name:"Period", exact:true }).selectOption("custom");
  await page.getByLabel("Startdatum", { exact:true }).fill("2026-10-14");
  await page.getByRole("button", { name:"Spara", exact:true }).click(); await expect(page.getByRole("status")).toContainText("Sparat");
  expect(saves[1].start_date).toBe("2026-10-14"); expect(saves[1]).not.toHaveProperty("period_type");
  await page.getByRole("button", { name:"Stationsmål & personliga mål", exact:true }).click();
  const goal = page.getByRole("button", { name:"Redigera mål: Peter", exact:true });
  await expect(goal).toContainText("Den här veckan"); await expect(goal).toContainText("100 p"); await expect(goal).toContainText("Aktivt");
  await goal.click(); await expect(goal).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("combobox", { name:"Period", exact:true }).selectOption("month");
  await expect(page.getByLabel("Startdatum", { exact:true })).toHaveValue("2026-10-01");
  await expect(page.getByLabel("Slutdatum", { exact:true })).toHaveValue("2026-10-31");
  await page.getByRole("combobox", { name:"Period", exact:true }).selectOption("custom");
  await page.getByLabel("Startdatum", { exact:true }).fill("2026-10-16");
  await expect(page.getByLabel("Slutdatum", { exact:true })).toHaveValue("2026-10-31");
  await stateScreenshot(page,"admin-goals");
});

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
  await page.getByRole("button", { name: "Korv med mos, +1 poäng", exact: true }).click();
  await expect(dialog).toBeVisible(); await expect(dialog.getByRole("button", { name: "Peter", exact: true })).toBeEnabled();
  loseResponse = true; await dialog.getByRole("button", { name: "Peter", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Svaret kunde inte bekräftas");
  await expect(dialog.getByRole("button", { name: "Alva", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Försök igen", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(requests).toHaveLength(3); expect(requests[1].request_id).toBe(requests[2].request_id); expect(requests[0].request_id).not.toBe(requests[1].request_id);
});

for (const nextSelection of [false,true]) {
  test(`Arena: långsamt milestone-svar ${nextSelection ? "stör inte nästa säljarval" : "missas inte efter en kort burst"}`, async ({ page }) => {
    const before = structuredClone(stats), after = structuredClone(stats);
    before.leaderboard = [{ ...stats.leaderboard[1], rank:1, points:127 }, { ...stats.leaderboard[0], rank:2 }, ...stats.leaderboard.slice(2)];
    after.leaderboard = [{ ...stats.leaderboard[0], rank:1, points:128 }, { ...stats.leaderboard[1], rank:2, points:127 }, ...stats.leaderboard.slice(2)];
    await visualData(page, () => before);
    let recorded = false, release!: () => void, requested!: () => void;
    const pending = new Promise<void>(resolve => { requested = resolve; });
    const blocked = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/arena/stats*", async route => {
      if (recorded) { requested(); await blocked; }
      await route.fulfill({ json:recorded ? after : before });
    });
    await page.route("**/api/arena/registrations", route => {
      recorded = true; const payload = route.request().postDataJSON();
      return route.fulfill({ json:{ registration:{ id:payload.request_id, points_awarded:2, voided_at:null } } });
    });
    await page.goto("/arena"); await expect(page.getByRole("button", { name:"Peter 126 p", exact:true })).toBeVisible();
    await page.getByRole("button", { name:"Biltvätt, +2 poäng", exact:true }).click();
    await page.getByRole("dialog").getByRole("button", { name:"Peter", exact:true }).click();
    await expect(page.locator(".celebration-points")).toBeVisible(); await pending;
    if (nextSelection) await page.getByRole("button", { name:"Korv med mos, +1 poäng", exact:true }).click();
    else await expect(page.locator(".celebration-points")).toHaveCount(0, { timeout:1600 });
    release(); await expect(page.getByRole("button", { name:"Peter 128 p", exact:true })).toHaveCount(1);
    if (nextSelection) {
      await expect(page.locator(".celebration-leader")).toHaveCount(0);
      await expect(page.getByRole("dialog", { name:"Vem gjorde försäljningen?" })).toBeVisible();
    } else {
      await expect(page.locator(".celebration-leader")).toContainText("Peter går om Alva");
      await expect(page.locator(".celebration-leader")).toBeVisible();
    }
  });
}

for (const [width,height] of [[1920,1080],[1366,768],[1024,768],[390,844],[844,390]]) {
  test(`Arena: säljarpopup och Min Arena med mål ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width,height });
    await page.clock.setFixedTime(new Date("2026-10-13T12:00:00Z"));
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
    await expect(person).toContainText("Den här veckan · 12–18 okt");
    await expect(person.locator(".arena-breakdown-heading")).toContainText("Idag");
    if (width >= 1024) expect(await person.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
    await stateScreenshot(page, `person-${width}x${height}`);
    await person.getByRole("button", { name:"Fortsätt sälja", exact:true }).click();
    await expect(person).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);
  });
}

for (const kind of ["leader","personal-goal","station-goal"] as const) {
  for (const [width,height] of [[1920,1080],[1024,768],[390,844],[844,390]]) {
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
    await expect.poll(() => reward.locator(".arena-reward-ring").evaluate(el => getComputedStyle(el).opacity)).toBe("1");
      expect(await reward.evaluate(el => getComputedStyle(el).pointerEvents)).toBe("none");
      if (kind === "leader") {
        await expect(reward).toContainText("Peter går om Alva");
        if (width >= 1024) await expect(page.locator(".arena-leaderboard .is-new-leader")).toContainText("Ny etta!");
      }
      const ring = (await reward.locator(".arena-reward-ring").boundingBox())!;
      expect(ring.y).toBeGreaterThanOrEqual(0); expect(ring.y + ring.height).toBeLessThanOrEqual(height);
      for (const selector of ["h2", ".arena-reward-points", ".arena-reward-seller", ".arena-reward-goal"]) {
        const item = reward.locator(selector); if (!await item.count()) continue;
        const box = (await item.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(ring.y); expect(box.y + box.height).toBeLessThanOrEqual(ring.y + ring.height);
      }
      expect(await reward.locator(".arena-confetti").count()).toBeLessThanOrEqual(12);
      expect(await page.locator("canvas").count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);
      await stateScreenshot(page, `${kind}-${width}x${height}`);
      await page.emulateMedia({ reducedMotion:"reduce" });
      expect(await reward.locator(".arena-confetti").first().evaluate(el => getComputedStyle(el).display)).toBe("none");
      await page.getByRole("button", { name:"Korv med mos, +1 poäng", exact:true }).click();
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
      const nav = (await page.locator(".arena-nav").boundingBox())!;
      expect(bounds.y + bounds.height + 12).toBeLessThanOrEqual(nav.y);
      await buttons.nth(i).click(); await expect(page.getByRole("dialog")).toBeVisible(); await page.getByRole("button", { name: "Stäng", exact: true }).click();
    }
    if (process.env.ARENA_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.ARENA_SCREENSHOT_DIR}/arena-${width}x${height}.png` });
    await expect(page.getByRole("button", { name:"Nästa aktiviteter", exact:true })).toHaveCount(0);
    await expect(page.locator(".arena-stage .arena-orb")).toHaveCount(7);
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
  const activityName = "Korv med mos";
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
  const created = page.waitForResponse(response => response.url().endsWith("/api/admin/arena/activities") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Spara", exact: true }).click(); await expect(page.getByRole("status")).toContainText("Sparat");
  const createdId = (await (await created).json()).id;
  const config = await (await page.request.get("/api/admin/arena/config")).json() as { activities: typeof activities };
  const activity = config.activities.find(a => a.id === createdId)!; expect(activity.image_key).toBeTruthy();
  const image = await page.request.get(`/api/arena/activity-images/${activity.image_key}`); expect(image.status()).toBe(200); expect((await image.body()).length).toBeLessThan(250000);
  const baseline = await (await page.request.get("/api/arena/stats")).json() as ArenaStats;
  await page.goto("/arena"); await expect(page.locator(".arena-orb").first()).toBeVisible();
  const ownActivity = page.getByRole("button", { name: `${activityName}, +0,5 poäng`, exact: true });
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
