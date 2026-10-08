import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("dashboardens uppgifter, schema och viktig info fungerar med tangentbord och detaljpaneler", async ({
  page,
}) => {
  let tasks = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      text: "Fylla på kylar",
      done: 0,
      revision: 0,
      created_at: "2026-10-08T07:00:00Z",
    },
  ];
  await page.route("**/api/station/dashboard", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        business_date: "2026-10-07",
        comparison_date: "2025-10-08",
        net_sales_ore: 3845000,
        comparison_sales_ore: 3408700,
        difference_ore: 436300,
        percent: 12.8,
        updated_at: null,
        week: [],
      }),
    }),
  );
  await page.route("**/api/station/v2", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        today: "2026-10-08",
        updated_at: null,
        tasks,
        shifts: [
          { id: "1", first_name: "Alva", starts_at: "05:30", ends_at: "14:15" },
          {
            id: "2",
            first_name: "Peter",
            starts_at: "08:30",
            ends_at: "16:30",
          },
          { id: "3", first_name: "Thim", starts_at: "14:15", ends_at: "22:15" },
          { id: "4", first_name: "Sara", starts_at: "16:00", ends_at: "22:00" },
        ],
        notices: [
          {
            id: "1",
            title: "Kampanjbyte",
            message: "Byt skyltar",
            updated_at: "2026-10-08T07:00:00Z",
          },
          {
            id: "2",
            title: "Leverans",
            message: "Kontrollera lagret",
            updated_at: "2026-10-07T07:00:00Z",
          },
        ],
      }),
    }),
  );
  await page.route("**/api/station/v2/tasks/**", async (r) => {
    const body = r.request().postDataJSON();
    if (r.request().method() === "PUT") {
      tasks = tasks.map((t) =>
        t.id === r.request().url().split("/").at(-1)
          ? {
              ...t,
              text: body.text,
              done: body.done ? 1 : 0,
              revision: t.revision + 1,
            }
          : t,
      );
    }
    await r.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"ok":true}',
    });
  });
  await page.route("**/api/station/v2/tasks", async (r) => {
    const body = r.request().postDataJSON();
    tasks = [
      ...tasks,
      {
        id: "00000000-0000-4000-8000-000000000002",
        text: body.text,
        done: 0,
        revision: 0,
        created_at: "2026-10-08T08:00:00Z",
      },
    ];
    await r.fulfill({
      status: 201,
      contentType: "application/json",
      body: '{"id":"00000000-0000-4000-8000-000000000002"}',
    });
  });
  await page.goto("/station");
  await expect(
    page.getByRole("heading", { name: "IDAG JOBBAR" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Visa alla 4 pass" }).click();
  await expect(
    page.getByRole("dialog", { name: "Dagens arbetspass" }).getByText("Sara"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Visa alla meddelanden" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Viktig info" })
      .getByText("Kontrollera lagret"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fylla på kylar" }).click();
  await expect(
    page.getByRole("progressbar", { name: "Färdiga uppgifter" }),
  ).toHaveAttribute("aria-valuenow", "1");
  await page.getByRole("button", { name: /Lägg till eller hantera/ }).click();
  await page.getByRole("textbox", { name: "Ny uppgift" }).fill("Se över kaffe");
  await page.getByRole("button", { name: "Lägg till", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Dagens to-do" })
      .getByText("Se över kaffe"),
  ).toBeVisible();
});

test("admin kan förhandsgranska CSV innan schemat sparas och skapa viktigt meddelande", async ({
  page,
}) => {
  let imports = 0,
    messages = 0;
  await page.route("**/api/admin/station/v2/schedule/import", async (r) => {
    imports++;
    await r.fulfill({
      status: 201,
      contentType: "application/json",
      body: '{"period_id":"test","imported":2}',
    });
  });
  await page.route("**/api/admin/station/v2/notices", async (r) => {
    if (r.request().method() === "POST") {
      messages++;
      await r.fulfill({
        status: 201,
        contentType: "application/json",
        body: '{"id":"test"}',
      });
    } else await r.continue();
  });
  await page.goto("/station/admin");
  await page
    .getByLabel("Administratörs-PIN")
    .fill(
      readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").match(
        /^ADMIN_PIN=(\d+)$/m,
      )![1],
    );
  await page.getByRole("button", { name: /Logga in/ }).click();
  await expect(
    page.getByRole("heading", { name: "Arbetsschema" }),
  ).toBeVisible();
  await page.getByLabel("Periodens namn").fill("Vecka 41–44");
  await page
    .getByLabel("CSV-fil")
    .setInputFiles({
      name: "schema.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "datum,förnamn,start,slut,status\n2026-10-08,Alva,05:30,14:15,active\n2026-10-09,Thim,22:00,06:00,active",
      ),
    });
  await expect(page.getByText(/Förhandsgranskning: 2 pass/)).toBeVisible();
  expect(imports).toBe(0);
  await page.getByRole("button", { name: "Importera 2 pass" }).click();
  await expect(page.getByText("Schemat importerades.")).toBeVisible();
  expect(imports).toBe(1);
  await page.getByLabel("Rubrik").fill("Kampanjbyte");
  await page.getByLabel("Meddelande").fill("Byt skyltar innan öppning.");
  await page.getByLabel("Publicerat").check();
  await page.getByRole("button", { name: "Skapa meddelande" }).click();
  await expect(page.getByText("Meddelandet sparades.")).toBeVisible();
  expect(messages).toBe(1);
});
