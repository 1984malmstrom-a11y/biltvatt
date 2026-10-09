import { test, expect } from "@playwright/test";
import { appendFileSync, readFileSync } from "node:fs";
const localPin = () =>
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").match(
    /^ADMIN_PIN=(\d+)$/m,
  )![1];

test("säljflöde, dubbelklicksskydd, statistik, makulering och responsiv vy", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const initialResponse = await page.goto("/");
  try {
    await expect(
      page.getByRole("heading", { name: "Välj ditt namn" }),
    ).toBeVisible();
  } catch (error) {
    // Test-only status diagnostics. The journal never contains response bodies,
    // browser storage, PINs or page text.
    const journal = process.env.STATION_V2_E2E_PROGRESS_FILE;
    if (journal) {
      const status = async (path: string) => {
        try { return (await page.request.get(path, { timeout: 5000 })).status(); }
        catch { return -1; }
      };
      let staffStatus = -1;
      let staffCount = -1;
      try {
        const staffResponse = await page.request.get("/api/staff", { timeout: 5000 });
        staffStatus = staffResponse.status();
        const rows = await staffResponse.json();
        if (Array.isArray(rows)) staffCount = rows.length;
      } catch { /* Keep the original assertion as the test failure. */ }
      appendFileSync(journal, `${JSON.stringify({
        event: "bootstrap_diagnostic",
        rootStatus: initialResponse?.status() ?? -1,
        staffStatus,
        staffCount,
        moduleStatus: await status("/src/main.tsx"),
        pageErrorCount: errors.length,
        headingVisibleLater: await page.getByRole("heading", { name: "Välj ditt namn" }).isVisible(),
      })}\n`);
    }
    throw error;
  }
  for (const name of ["Peter", "Emma", "Johan", "Lisa", "Kalle"])
    await expect(
      page.getByRole("button", { name: `${name} Välj` }),
    ).toBeVisible();
  await page.screenshot({ path: "test-results/startsida.png", fullPage: true });
  const baseline = await (await request.get("/api/stats")).json();
  await page.getByRole("button", { name: "Emma Välj" }).click();
  await expect(page.getByText("Säljare: Emma")).toBeVisible();
  await page.getByRole("button", { name: /Registrera Preemium,/ }).dblclick();
  await expect(page.locator(".confirmation")).toHaveText("Registrerad");
  await expect(
    page.getByRole("button", { name: "Ångra senaste" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Välj tvättprogram" }),
  ).toBeVisible();
  const after = await (await request.get("/api/stats")).json();
  expect(after.count).toBe(baseline.count + 1);
  expect(after.revenue).toBe(baseline.revenue + 389);
  await page.screenshot({
    path: "test-results/forsaljning.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Ångra senaste" }).click();
  await expect(page.locator(".confirmation")).toHaveText("Ångrad");
  expect((await (await request.get("/api/stats")).json()).count).toBe(
    baseline.count,
  );
  await page.getByRole("button", { name: "Statistik", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Statistik", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Antal tvättar", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Valfri period" }).click();
  await expect(page.getByLabel("Från datum")).toBeVisible();
  await page.getByRole("button", { name: "Idag", exact: true }).click();
  await page.screenshot({ path: "test-results/statistik.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Registrera", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Välj tvättprogram" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobil.png", fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("ett förlorat svar kan återförsökas utan dubbel försäljning", async ({
  page,
  request,
}) => {
  const before = await (await request.get("/api/stats")).json();
  await page.goto("/");
  await page.getByRole("button", { name: "Johan Välj" }).click();
  let first = true;
  await page.route("**/api/sales", async (route) => {
    if (first) {
      first = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: /Registrera Fin,/ }).click();
  await expect(page.getByRole("alert")).toContainText("räknas aldrig dubbelt");
  await page.getByRole("button", { name: "Försök igen", exact: true }).click();
  await expect(page.locator(".confirmation")).toHaveText("Registrerad");
  expect((await (await request.get("/api/stats")).json()).count).toBe(
    before.count + 1,
  );
  await page.getByRole("button", { name: "Ångra senaste" }).click();
  await expect(page.locator(".confirmation")).toHaveText("Ångrad");
  expect((await (await request.get("/api/stats")).json()).count).toBe(
    before.count,
  );
});

test("PIN-inloggning, alla adminvyer, mål, personal och historiska prisändringar", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Välkommen tillbaka" }),
  ).toBeVisible();
  await page.getByLabel("Administratörs-PIN").fill(localPin());
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Översikt", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Personal", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "Emma" })).toBeVisible();
  await page.screenshot({ path: "test-results/admin.png", fullPage: true });
  await page
    .getByRole("row")
    .filter({ hasText: "Peter" })
    .getByRole("button", { name: "Redigera", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByLabel("Namn").fill("Peter");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Spara", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Tvättprogram", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Preemium", exact: true }),
  ).toBeVisible();
  const editor = page
    .locator(".program-editor")
    .filter({
      has: page.getByRole("heading", { name: "Preemium", exact: true }),
    });
  await editor.getByLabel("Pris (kr)").fill("399");
  await editor.getByRole("button", { name: "Spara", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Tidigare försäljningspriser bevaras",
  );
  await editor.getByLabel("Pris (kr)").fill("389");
  await editor.getByRole("button", { name: "Spara", exact: true }).click();
  await expect(editor.getByLabel("Pris (kr)")).toHaveValue("389");
  await page.getByRole("button", { name: "Mål", exact: true }).click();
  await expect(page.getByLabel("Dagligt tvättmål")).toBeVisible();
  await page.getByRole("button", { name: "Spara mål", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Lagets mål är sparade");
  await page
    .getByRole("button", { name: "Statistik", exact: true })
    .last()
    .click();
  await expect(page.getByText("Preemium-andel", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Exportera", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Hämta CSV" }).click();
  expect((await downloadEvent).suggestedFilename()).toMatch(/\.csv$/);
  await page
    .getByRole("button", { name: "Inställningar", exact: true })
    .click();
  await expect(
    page.getByText("Tvättligan 1.0.0", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Logga ut", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Välkommen tillbaka" }),
  ).toBeVisible();
});
