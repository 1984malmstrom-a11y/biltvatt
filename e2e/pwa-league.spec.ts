import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

async function login(page: Page) {
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
}
test("PWA: manifest, riktiga ikoner, SW-kontroll, diskret installation och ingen automatisk behörighet", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { permissionRequests: number }).permissionRequests =
      0;
    Notification.requestPermission = async () => {
      (window as unknown as { permissionRequests: number })
        .permissionRequests++;
      return "denied";
    };
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Välj ditt namn" }),
  ).toBeVisible();
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({
    display: "standalone",
    name: "Tvättligan",
    start_url: "/",
  });
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          !!(await navigator.serviceWorker.getRegistration("/"))?.active,
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL),
  ).toContain("/sw.js");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { permissionRequests: number })
          .permissionRequests,
    ),
  ).toBe(0);
  await page.getByText("App och notiser", { exact: true }).click();
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt");
    Object.assign(event, {
      prompt: async () => {
        (
          window as unknown as { installationRequested: boolean }
        ).installationRequested = true;
      },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });
  await expect(
    page.getByRole("button", { name: "Installera Tvättligan" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { installationRequested: boolean })
          .installationRequested,
    ),
  ).toBeUndefined();
  await page.getByRole("button", { name: "Installera Tvättligan" }).click();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { installationRequested: boolean })
          .installationRequested,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { permissionRequests: number })
          .permissionRequests,
    ),
  ).toBe(0);
});
test("Push: unsupported och nekad behörighet får svensk hjälp utan automatiska anrop", async ({
  page,
}) => {
  await page.addInitScript(() => {
    delete (window as unknown as { PushManager?: unknown }).PushManager;
  });
  await page.goto("/");
  await page.getByText("App och notiser", { exact: true }).click();
  await expect(
    page.getByText(/stöder inte Web Push i nuvarande läge/),
  ).toBeVisible();
  await expect(page.getByText(/På iPhone\/iPad/)).toBeVisible();
  const denied = await page.context().newPage();
  await denied.addInitScript(() => {
    (window as unknown as { PushManager: unknown }).PushManager =
      function () {};
    Object.defineProperty(Notification, "permission", {
      get: () => "denied",
      configurable: true,
    });
    Notification.requestPermission = async () => {
      throw new Error("Must not ask for permission on load");
    };
  });
  await denied.goto("/");
  await denied.getByText("App och notiser", { exact: true }).click();
  await expect(
    denied.getByText(
      "Notiser är blockerade. Tillåt dem i webbläsarens webbplatsinställningar.",
    ),
  ).toBeVisible();
  await expect(
    denied.getByRole("button", { name: "Slå på pushnotiser" }),
  ).toBeDisabled();
});
test("Push UI: explicit behörighet, gemensam enhet, separat säljarbyte, ägarkontroller och avregistrering", async ({
  page,
}) => {
  let device: {
    id: string;
    staff_id: string | null;
    device_label: string | null;
    active: boolean;
  } = {
    id: crypto.randomUUID(),
    staff_id: null,
    device_label: null,
    active: true,
  };
  const token = "A".repeat(43),
    publicKey = Buffer.from([4, ...new Uint8Array(64)]).toString("base64url");
  const received: {
    path: string;
    method: string;
    data: Record<string, unknown>;
  }[] = [];
  await page.addInitScript(() => {
    let permission: NotificationPermission = "default",
      sub: unknown = null;
    (window as unknown as { permissionRequests: number }).permissionRequests =
      0;
    Object.defineProperty(Notification, "permission", {
      get: () => permission,
      configurable: true,
    });
    Notification.requestPermission = async () => {
      (window as unknown as { permissionRequests: number })
        .permissionRequests++;
      permission = "granted";
      return permission;
    };
    const fake = {
      options: { applicationServerKey: null },
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/only-ui-mock",
        keys: { p256dh: "browser-key", auth: "browser-auth" },
      }),
      unsubscribe: async () => {
        sub = null;
        return true;
      },
    };
    Object.defineProperty(ServiceWorkerRegistration.prototype, "pushManager", {
      configurable: true,
      get: () => ({
        getSubscription: async () => sub,
        subscribe: async () => {
          sub = fake;
          return fake;
        },
      }),
    });
  });
  await page.route("**/api/push/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname,
      method = request.method();
    let response: unknown = {};
    if (path.endsWith("/public-key"))
      response = { configured: true, enabled: true, publicKey };
    else if (path.endsWith("/subscribe")) {
      const data = request.postDataJSON();
      received.push({ path, method, data });
      device = { ...device, staff_id: data.staff_id, active: true };
      response = { ...device, token };
    } else if (path.endsWith("/subscription")) {
      expect(request.headers()["x-push-token"]).toBe(token);
      if (method === "PATCH") {
        const data = request.postDataJSON();
        received.push({ path, method, data });
        device = { ...device, ...data };
      }
      response = device;
    } else if (path.endsWith("/test")) {
      expect(request.headers()["x-push-id"]).toBe(device.id);
      response = { state: "complete", total: 1, sent: 1, failed: 0 };
    } else if (path.endsWith("/unsubscribe")) {
      expect(request.headers()["x-push-token"]).toBe(token);
      device.active = false;
      response = { ok: true };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  await page.goto("/");
  await page.getByText("App och notiser", { exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Enhetskoppling", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { permissionRequests: number })
          .permissionRequests,
    ),
  ).toBe(0);
  await page
    .getByRole("combobox", { name: "Enhetskoppling", exact: true })
    .selectOption("shared");
  await page.getByRole("button", { name: "Slå på pushnotiser" }).click();
  await expect(
    page.getByText("Aktiv prenumeration på den här enheten."),
  ).toBeVisible();
  expect(received[0].data.staff_id).toBeNull();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { permissionRequests: number })
          .permissionRequests,
    ),
  ).toBe(1);
  const pushStatus = page.locator(".device-push-panel").getByRole("status");
  await page
    .getByRole("combobox", { name: "Enhetskoppling", exact: true })
    .selectOption("peter");
  await page.getByRole("button", { name: "Spara enhetskoppling" }).click();
  await expect(pushStatus).toContainText("Enhetskopplingen är sparad");
  await page.getByRole("button", { name: "Emma Välj" }).click();
  await expect(page.getByText("Säljare: Emma")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Enhetskoppling", exact: true }),
  ).toHaveValue("peter");
  expect(received.filter((r) => r.method === "PATCH")).toHaveLength(1);
  await page
    .getByRole("button", { name: "Skicka testnotis till den här enheten" })
    .click();
  await expect(pushStatus).toContainText("Skickat till 1 av 1 enheter");
  await page.getByRole("button", { name: "Stäng av pushnotiser" }).click();
  await expect(pushStatus).toContainText("Pushnotiser är avstängda");
  expect(device.active).toBe(false);
  expect(
    await page.evaluate(() => localStorage.getItem("tvattligan-push-owner")),
  ).toBeNull();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { permissionRequests: number })
          .permissionRequests,
    ),
  ).toBe(1);
  // An unreachable server must not prevent native revocation; retain the capability for retry.
  await page.getByRole("button", { name: "Slå på pushnotiser" }).click();
  await expect(
    page.getByText("Aktiv prenumeration på den här enheten."),
  ).toBeVisible();
  await page.route("**/api/push/unsubscribe", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Stäng av pushnotiser" }).click();
  await expect(pushStatus).toContainText("Push är avstängt i webbläsaren");
  expect(
    await page.evaluate(async () =>
      (
        await navigator.serviceWorker.getRegistration("/")
      )?.pushManager.getSubscription(),
    ),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("tvattligan-push-owner")),
  ).not.toBeNull();
  await page.unroute("**/api/push/unsubscribe");
  await page.getByRole("button", { name: "Stäng av pushnotiser" }).click();
  await expect(pushStatus).toContainText("Pushnotiser är avstängda");
});
test("Notisklick avbryter aldrig en obekräftad registrering eller tappar kvittot", async ({
  page,
}) => {
  let first = true,
    saved: { id: string; request_id: string } | null = null;
  await page.goto("/");
  await page.getByRole("button", { name: "Johan Välj" }).click();
  await page.route("**/api/sales", async (route) => {
    if (!first) return route.continue();
    first = false;
    saved = await (await route.fetch()).json();
    await route.abort("failed");
  });
  const clickMessage = () =>
    page.evaluate(() =>
      navigator.serviceWorker.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "TVATTLIGAN_OPEN", view: "stats" },
        }),
      ),
    );
  try {
    await page.getByRole("button", { name: /Registrera Fin,/ }).click();
    await expect(page.getByRole("alert")).toContainText(
      "räknas aldrig dubbelt",
    );
    await clickMessage();
    await expect(
      page.getByRole("heading", { name: "Välj tvättprogram" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Slutför den aktuella registreringen innan du öppnar notisens sida.",
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Försök igen", exact: true })
      .click();
    await expect(page.locator(".confirmation")).toHaveText("Registrerad");
    await page.getByRole("button", { name: "Ångra senaste" }).click();
    await expect(page.locator(".confirmation")).toHaveText("Ångrad");
    await clickMessage();
    await expect(
      page.getByRole("heading", { name: "Statistik", exact: true }),
    ).toBeVisible();
  } finally {
    if (saved)
      await page.request.post(`/api/sales/${saved.id}/void`, {
        data: { request_id: saved.request_id },
      });
  }
});
test("Admin/Notiser: säker status, inställningar, serverdata och mobil layout utan riktiga pushanrop", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Notiser", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Notiser", exact: true }),
  ).toBeVisible();
  const baseline = await (
    await page.request.get("/api/admin/notifications")
  ).json();
  try {
    await expect(page.getByText("VAPID saknas", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Skicka notis", exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel("Pushnotiser globalt")).toBeDisabled();
    await page.getByLabel("Tvättar kvar till målet").fill("4");
    await page.getByRole("button", { name: "Spara notisinställningar" }).click();
    await expect(page.locator(".notifications-admin").getByRole("status")).toContainText(
      "Notisinställningarna är sparade",
    );
    expect(
      (await (await page.request.get("/api/admin/notifications")).json()).settings
        .push_goal_close_threshold,
    ).toBe(4);
    await page.request.put("/api/admin/notifications/settings", {
      data: baseline.settings,
    });
    await page.getByRole("button", { name: "Uppdatera pushstatus" }).click();
    await expect(page.getByLabel("Tvättar kvar till målet")).toHaveValue(
      String(baseline.settings.push_goal_close_threshold),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: "test-results/notiser-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/notiser-mobile.png",
      fullPage: true,
    });
  } finally {
    // A failed assertion must not leave local notification settings changed
    // for a later developer test run.
    await page.request.put("/api/admin/notifications/settings", {
      data: baseline.settings,
    });
  }
});
test("Snittköpsligan: verkliga registreringar, 3-tvättarsgräns, benchmark och automatisk 30s-uppdatering", async ({
  page,
}) => {
  test.setTimeout(60000);
  await login(page);
  const suffix = String(Date.now()),
    created: { id: string; name: string }[] = [];
  try {
    for (const name of ["Linnea", "Oskar", "Sara"]) {
      const response = await page.request.post("/api/admin/staff", {
        data: { name: `QA liga ${suffix} ${name}`, color: "#2366aa" },
      });
      expect(response.status()).toBe(201);
      created.push({
        id: (await response.json()).id,
        name: `QA liga ${suffix} ${name}`,
      });
    }
    for (let i = 0; i < 3; i++)
      for (const person of created.slice(0, 2))
        expect(
          (
            await page.request.post("/api/sales", {
              data: {
                staff_id: person.id,
                wash_program_id: "finast-plus",
                request_id: crypto.randomUUID(),
              },
            })
          ).status(),
        ).toBe(201);
    for (let i = 0; i < 2; i++)
      await page.request.post("/api/sales", {
        data: {
          staff_id: created[2].id,
          wash_program_id: "fin",
          request_id: crypto.randomUUID(),
        },
      });
    await page.clock.install();
    await page.goto("/?view=stats");
    const league = page.getByRole("region", {
      name: "Snittköpsligan",
      exact: true,
    });
    await expect(league).toBeVisible();
    await expect(league).toContainText("Snittköpsligan · Idag");
    await expect(league).toContainText("+79 kr · +31,6 %");
    await expect(league).toContainText("2/3 tvättar");
    const ownOrder = () =>
      page
        .locator(".average-league-list .league-person strong")
        .allTextContents()
        .then((names) => names.filter((name) => name.includes(suffix)));
    expect(await ownOrder()).toEqual([created[0].name, created[1].name]);
    expect(
      await page
        .getByRole("heading", { name: "Sålda tvättprogram", exact: true })
        .count(),
    ).toBe(0);
    expect(
      await page
        .getByRole("heading", { name: "Högst snittköp", exact: true })
        .count(),
    ).toBe(0);
    await expect(
      page.getByText("mot jan–sep 2026 (250 kr)", { exact: true }),
    ).toBeVisible();
    await page.request.post("/api/sales", {
      data: {
        staff_id: created[1].id,
        wash_program_id: "preemium",
        request_id: crypto.randomUUID(),
      },
    });
    await page.clock.fastForward(31000);
    await expect.poll(ownOrder).toEqual([created[1].name, created[0].name]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: "test-results/snittligan-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(league).toBeVisible();
    await page.screenshot({
      path: "test-results/snittligan-mobile.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Vecka", exact: true }).click();
    await expect(league).toContainText("Snittköpsligan · Vecka");
    await page.getByRole("button", { name: "Månad", exact: true }).click();
    await expect(league).toContainText("Snittköpsligan · Månad");
    await page
      .getByRole("button", { name: "Valfri period", exact: true })
      .click();
    await expect(league).toContainText("Snittköpsligan");
    await expect(
      page.getByText("mot jan–sep 2026 (250 kr)", { exact: true }),
    ).toBeVisible();
  } finally {
    for (const person of created) {
      const response = await page.request.get(
        `/api/admin/staff/${person.id}/deletion-preview`,
      );
      if (response.ok()) {
        const preview = await response.json();
        await page.request.delete(`/api/admin/staff/${person.id}`, {
          data: { preview_id: preview.id, confirmation: "RADERA" },
        });
      }
    }
  }
});
