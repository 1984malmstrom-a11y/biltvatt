import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { sek } from "../src/api";

async function checkTouchTargets(page: import("@playwright/test").Page) {
  const tooSmall = await page
    .locator("button, select, input")
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return (
            box.width > 0 &&
            box.height > 0 &&
            (box.width < 44 || box.height < 44)
          );
        })
        .map((element) => element.textContent?.trim()),
    );
  expect(tooSmall).toEqual([]);
}

test("Admin-underhåll: korrigering, makulering, återställning, nollställning och arkivering", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  const pin = readFileSync(
    new URL("../.dev.vars", import.meta.url),
    "utf8",
  ).match(/^ADMIN_PIN=(\d+)$/m)![1];
  await page.getByLabel("Administratörs-PIN").fill(pin);
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Översikt", exact: true }),
  ).toBeVisible();
  const name = `QA ${Date.now()}`;
  await page.getByRole("button", { name: "Personal", exact: true }).click();
  await page
    .getByRole("button", { name: "Lägg till personal", exact: true })
    .click();
  await page.getByRole("dialog").getByLabel("Namn").fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Spara", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const staff = await (await page.request.get("/api/staff?all=1")).json();
  const staffId = staff.find((p: { name: string }) => p.name === name).id;
  const saleResponse = await page.request.post("/api/sales", {
    data: {
      staff_id: staffId,
      wash_program_id: "preemium",
      request_id: crypto.randomUUID(),
    },
  });
  expect(saleResponse.status()).toBe(201);
  const sale = await saleResponse.json();
  await page
    .getByRole("button", { name: "Försäljningar", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Säljare", exact: true })
    .selectOption(staffId);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("Preemium");
  await checkTouchTargets(page);
  await row.getByRole("button", { name: "Redigera", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nytt tvättprogram").selectOption("fin");
  await expect(dialog).toContainText("Pris efter korrigering: " + sek(179));
  await page.screenshot({
    path: "test-results/admin-correction-desktop.png",
    fullPage: false,
  });
  await dialog.getByRole("button", { name: "Spara korrigering" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(row).toContainText(sek(179));
  await row.getByRole("button", { name: "Radera registrering" }).click();
  await expect(dialog).toContainText(
    "Vill du verkligen radera denna registrering?",
  );
  await dialog.getByRole("button", { name: "Avbryt" }).click();
  await expect(row).toContainText("Registrerad");
  await row.getByRole("button", { name: "Radera registrering" }).click();
  await dialog.getByRole("button", { name: "Radera registrering" }).click();
  await expect(row).toContainText("Makulerad");
  await row.getByRole("button", { name: "Återställ", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Återställ registrering", exact: true })
    .click();
  await expect(row).toContainText("Registrerad");
  await row.getByRole("button", { name: "Historik", exact: true }).click();
  await expect(dialog).toContainText("Korrigerad");
  await expect(dialog).toContainText("Makulerad av Admin");
  await expect(dialog).toContainText("Återställd");
  await dialog.getByRole("button", { name: "Stäng historik" }).click();
  await page.screenshot({
    path: "test-results/admin-sales-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkTouchTargets(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/admin-sales-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole("button", { name: "Statistik", exact: true })
    .last()
    .click();
  await page.getByLabel("Nollställningsperiod").selectOption("all");
  await page
    .getByRole("button", { name: "Förhandsgranska nollställning" })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Nollställ granskad statistik" }),
  ).toBeDisabled();
  await dialog.getByLabel(/Skriv NOLLSTÄLL/).fill("NOLLSTÄLL");
  await expect(
    dialog.getByRole("button", { name: "Nollställ granskad statistik" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/admin-reset-confirmation.png",
    fullPage: false,
  });
  await dialog.getByRole("button", { name: "Avbryt" }).click(); // never reset the rest of local data
  await page
    .getByRole("combobox", { name: "Omfattning", exact: true })
    .selectOption("staff");
  await page.getByLabel("Säljare att nollställa").selectOption(staffId);
  await page
    .getByRole("button", { name: "Förhandsgranska nollställning" })
    .click();
  await expect(dialog).toContainText("1 registreringar");
  await expect(dialog).toContainText(sek(179));
  await dialog
    .getByRole("button", { name: "Nollställ granskad statistik" })
    .click();
  await expect(dialog).not.toBeVisible();
  const batch = page.locator(".maintenance-batch").filter({ hasText: name });
  await expect(batch).toContainText("1 registreringar kan återställas");
  await batch.getByRole("button", { name: "Granska återställning" }).click();
  await expect(dialog).toContainText(sek(179));
  await dialog
    .getByRole("button", { name: "Återställ granskade registreringar" })
    .click();
  await expect(batch).toContainText("0 registreringar kan återställas");
  await page.getByRole("button", { name: "Personal", exact: true }).click();
  const person = page.getByRole("row").filter({ hasText: name });
  await person.getByRole("button", { name: "Radera", exact: true }).click();
  await expect(dialog).toContainText("har 1 registrerade försäljningar");
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/admin-archive-confirmation.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/admin-archive-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await dialog
    .getByRole("button", { name: "Radera säljare och nollställ statistik" })
    .click();
  await expect(person).toContainText("Arkiverad");
  expect(
    (await (await page.request.get("/api/staff")).json()).some(
      (p: { id: string }) => p.id === staffId,
    ),
  ).toBe(false);
  const history = await (
    await page.request.get(`/api/admin/sales?period=all&staff_id=${staffId}`)
  ).json();
  expect(history.rows[0]).toMatchObject({
    id: sale.id,
    void_reason: "STAFF_DELETED",
    price_sek: 179,
  });
  expect(errors).toEqual([]);
});

test("Personal: namn/färg, avbruten radering, fokusfälla och permanent radering utan historik", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  const pin = readFileSync(
    new URL("../.dev.vars", import.meta.url),
    "utf8",
  ).match(/^ADMIN_PIN=(\d+)$/m)![1];
  await page.getByLabel("Administratörs-PIN").fill(pin);
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Översikt", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Personal", exact: true }).click();
  await page
    .getByRole("button", { name: "Lägg till personal", exact: true })
    .click();
  const name = `QA tom ${Date.now()}`,
    edited = name + " ny";
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Namn").fill(name);
  await dialog.getByRole("button", { name: "Spara", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  let person = page.getByRole("row").filter({ hasText: name });
  await person.getByRole("button", { name: "Redigera", exact: true }).click();
  await dialog.getByLabel("Namn").fill(edited);
  await dialog.getByLabel("Avatarfärg").fill("#224466");
  await dialog.getByRole("button", { name: "Spara", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  person = page.getByRole("row").filter({ hasText: edited });
  await person.getByRole("button", { name: "Radera", exact: true }).click();
  await expect(dialog).toContainText("har 0 registrerade försäljningar");
  await expect(dialog).toContainText("kan inte återställas");
  await dialog
    .getByRole("button", { name: "Radera säljare permanent" })
    .focus();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Stäng", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    person.getByRole("button", { name: "Radera", exact: true }),
  ).toBeFocused();
  await person.getByRole("button", { name: "Radera", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Radera säljare permanent" })
    .click();
  await expect(person).toHaveCount(0);
});
