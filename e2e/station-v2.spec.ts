import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

const previewDir = process.env.V25_PREVIEW_DIR;
if (previewDir) mkdirSync(previewDir, { recursive: true });

test("dashboardens uppgifter, schema och viktig info fungerar med tangentbord och detaljpaneler", async ({
  page,
}) => {
  let economicResult = 10000;
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
  await page.route("**/api/station/v2/monthly", (r) =>
    r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({month:"2026-09",metrics:{kind:"fixed-v25",customers_per_day:{current:420,previous:398,percent:5.5},average_purchase:{current:85.4,previous:81.2,percent:5.2},fuel_per_day:{current:12500,previous:13100,percent:-4.6},car_wash_average:{current:275,previous:250,percent:10},sales:{percent:7.8},economic_result:{value:economicResult}},legacy:false,updated_at:null})}),
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
  const monthlyButton=page.getByRole("button",{name:/Förra månadens siffror/i});
  await monthlyButton.click();
  const monthlyDialog=page.getByRole("dialog",{name:"Förra månadens siffror"});
  await expect(monthlyDialog.getByRole("heading",{name:"Månadens nyckeltal"})).toBeVisible();
  await expect(monthlyDialog.getByLabel("Ekonomiskt resultat")).toContainText(/\+10\s000 kr/);
  await expect(monthlyDialog.locator(".v25-metric-card")).toHaveCount(5);
  await expect(monthlyDialog.locator(".v25-result strong")).toHaveClass(/positive/);
  if (previewDir) {
    await page.setViewportSize({ width: 1280, height: 1100 });
    await monthlyDialog.evaluate((el) => { el.style.maxHeight = "none"; el.style.overflow = "visible"; });
    await monthlyDialog.screenshot({ path: `${previewDir}/modal-positive.png` });
  }
  await page.keyboard.press("Escape");
  economicResult = -8000;
  await monthlyButton.click();
  await expect(monthlyDialog.getByLabel("Ekonomiskt resultat")).toContainText(/−8\s000 kr/);
  await expect(monthlyDialog.locator(".v25-result strong")).toHaveClass(/negative/);
  if (previewDir) {
    await monthlyDialog.evaluate((el) => { el.style.maxHeight = "none"; el.style.overflow = "visible"; });
    await monthlyDialog.screenshot({ path: `${previewDir}/modal-negative.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(monthlyDialog.locator(".v25-metric-card")).toHaveCount(5);
  expect(await monthlyDialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  if (previewDir) {
    await page.setViewportSize({ width: 390, height: 2000 });
    await monthlyDialog.evaluate((el) => { el.style.maxHeight = "none"; el.style.overflow = "visible"; });
    await monthlyDialog.screenshot({ path: `${previewDir}/modal-mobile.png` });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.keyboard.press("Escape");
  await expect(monthlyButton).toBeFocused();
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

test("Idag jobbar laddas om vid lokal midnatt i Stockholm", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-08T21:59:58Z") });
  let nextDay = false;
  await page.route("**/api/station/dashboard", (route) => route.fulfill({ json: {
    business_date: "2026-10-07", comparison_date: "2025-10-08",
    net_sales_ore: 100000, comparison_sales_ore: 90000,
    difference_ore: 10000, percent: 11.1, updated_at: null, week: [],
  } }));
  await page.route("**/api/station/v2", (route) => route.fulfill({ json: {
    today: nextDay ? "2026-10-09" : "2026-10-08", updated_at: null,
    shifts: [{ id: "demo", first_name: nextDay ? "Demo Ny" : "Demo Före",
      starts_at: "08:00", ends_at: "16:00" }],
    tasks: [], notices: [],
  } }));
  await page.goto("/station");
  await expect(page.getByText("Demo Före")).toBeVisible();
  nextDay = true;
  await page.clock.fastForward(3000);
  await expect(page.getByText("Demo Ny")).toBeVisible();
});

test("admin kan förhandsgranska CSV innan schemat sparas och skapa viktigt meddelande", async ({
  page,
}) => {
  let imports = 0,
    messages = 0,
    months = 0;
  let storedMonth: {month:string;metrics:unknown;legacy:boolean;revision:number;updated_at:string} | null = null;
  await page.route("**/api/admin/station/v2/monthly",(r)=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(storedMonth?[storedMonth]:[])}));
  await page.route("**/api/admin/station/v2/monthly/*",(r)=>{
    const selected=r.request().url().split("/").at(-1)!;
    if (r.request().method() === "PUT") {
      const data=r.request().postDataJSON() as {metrics:unknown;expected_revision:number|null};
      expect(data.expected_revision).toBe(storedMonth?.revision??null);
      months++;
      storedMonth={month:selected,metrics:data.metrics,legacy:false,revision:months-1,updated_at:"2026-10-10T00:00:00Z"};
      return r.fulfill({status:months===1?201:200,contentType:"application/json",body:JSON.stringify({revision:months-1})});
    }
    return r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(storedMonth?.month===selected?storedMonth:{month:selected,metrics:null,legacy:false,revision:null,updated_at:null})});
  });
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
      name: "syntetisk-krock.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "datum,förnamn,start,slut,status\n2026-10-08,Demo A,22:00,06:00,active\n2026-10-09,Demo A,05:30,12:00,active",
      ),
    });
  await expect(page.getByRole("alert").filter({ hasText: "överlappande aktivt pass" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Importera 2 pass" })).toBeDisabled();
  expect(imports).toBe(0);
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
  const monthSection=page.locator("#station-monthly");
  await expect(monthSection.locator("fieldset")).toHaveCount(6);
  await monthSection.getByRole("textbox",{name:"Kunder/dag – Aktuellt värde"}).fill("420");
  await monthSection.getByRole("textbox",{name:"Försäljning – Förändring"}).fill("7,8");
  await expect(monthSection.locator("fieldset").filter({has:page.getByText("Försäljning",{exact:true})}).locator("output")).toHaveText("+7,8 %");
  await monthSection.getByRole("textbox",{name:"Ekonomiskt resultat – Ekonomiskt resultat"}).fill("+10000");
  await expect(monthSection.getByText("%",{exact:true})).toHaveCount(5);
  if (previewDir) {
    await monthSection.getByRole("textbox",{name:"Ekonomiskt resultat – Ekonomiskt resultat"}).evaluate((el: HTMLElement) => el.blur());
    await monthSection.screenshot({ path: `${previewDir}/admin-form.png` });
  }
  await monthSection.getByRole("button",{name:"Spara månad"}).click();
  await expect(page.getByText("Månadens siffror sparades.")).toBeVisible();
  expect(months).toBe(1);
  const monthInput=monthSection.locator('input[type="month"]');
  const savedMonth=await monthInput.inputValue();
  await monthInput.fill("2025-01");
  await monthInput.fill(savedMonth);
  await expect(monthSection.getByRole("textbox",{name:"Kunder/dag – Aktuellt värde"})).toHaveValue("420");
  await monthSection.getByRole("textbox",{name:"Kunder/dag – Aktuellt värde"}).fill("421");
  await monthSection.getByRole("button",{name:"Spara månad"}).click();
  expect(months).toBe(2);
});
