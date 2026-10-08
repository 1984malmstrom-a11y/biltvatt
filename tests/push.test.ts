import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { fixture } from "./fixture";
import { createServer } from "node:http";
import {
  base64url,
  bytes,
  concat,
  decode64,
  encryptPayload,
  vapidAuthorization,
} from "../worker/webpush";
import { goalEventStatement } from "../worker/notifications";
import { stockholmDay } from "../worker/stats";
let f: ReturnType<typeof fixture>, cookie: string;
let browserKeys: { publicKey: string; auth: string; privateKey: CryptoKey };
const transport = vi.fn<typeof fetch>();
const nativeFetch = globalThis.fetch;
async function keys() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return {
    publicKey: base64url(
      new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)),
    ),
    privateKey: jwk.d!,
    subject: "https://tvattligan.test",
    verifyKey: pair.publicKey,
  };
}
beforeEach(async () => {
  f = fixture();
  cookie = await f.login();
  const vapid = await keys();
  f.env.VAPID_PUBLIC_KEY = vapid.publicKey;
  f.env.VAPID_PRIVATE_KEY = vapid.privateKey;
  f.env.VAPID_SUBJECT = vapid.subject;
  const receiver = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  browserKeys = {
    publicKey: base64url(
      new Uint8Array(await crypto.subtle.exportKey("raw", receiver.publicKey)),
    ),
    auth: base64url(crypto.getRandomValues(new Uint8Array(16))),
    privateKey: receiver.privateKey,
  };
  transport.mockReset();
  transport.mockResolvedValue(new Response(null, { status: 201 }));
  vi.stubGlobal("fetch", transport);
});
afterEach(async () => {
  await f.finish();
  f.db.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const subscription = (suffix = "one") => ({
  endpoint: "https://fcm.googleapis.com/fcm/send/" + suffix,
  keys: { p256dh: browserKeys.publicKey, auth: browserKeys.auth },
});
async function subscribe(staff_id: string | null = null, suffix = "one") {
  const response = await f.call("/push/subscribe", "POST", {
    subscription: subscription(suffix),
    staff_id,
  });
  expect(response.status).toBe(201);
  return (await response.json()) as {
    id: string;
    token: string;
    staff_id: string | null;
    active: boolean;
  };
}
const ownerHeaders = (owner: { id: string; token: string }) => ({
  "X-Push-Id": owner.id,
  "X-Push-Token": owner.token,
});
async function enable() {
  expect(
    (
      await f.call(
        "/admin/notifications/settings",
        "PUT",
        { push_enabled: 1 },
        cookie,
      )
    ).status,
  ).toBe(200);
}
const manual = (
  audience = "all",
  staff_id?: string,
  request_id = crypto.randomUUID(),
) =>
  f.call(
    "/admin/notifications/send",
    "POST",
    {
      title: "Dagens fokus",
      body: "Nu kör vi!",
      audience,
      destination: "stats",
      request_id,
      ...(staff_id ? { staff_id } : {}),
    },
    cookie,
  );
describe("Web Push API och enhetsägande", () => {
  it("visar enbart publik VAPID-nyckel och säker saknad-konfiguration", async () => {
    const response = await (await f.call("/push/public-key")).json();
    expect(response).toMatchObject({
      publicKey: f.env.VAPID_PUBLIC_KEY,
      configured: true,
      enabled: false,
    });
    expect(JSON.stringify(response)).not.toContain(f.env.VAPID_PRIVATE_KEY);
    delete f.env.VAPID_PRIVATE_KEY;
    expect(await (await f.call("/push/public-key")).json()).toMatchObject({
      publicKey: null,
      configured: false,
    });
    expect(
      (
        await f.call(
          "/admin/notifications/settings",
          "PUT",
          { push_enabled: 1 },
          cookie,
        )
      ).status,
    ).toBe(503);
  });
  it("skapar gemensam/säljarassocierad prenumeration och uppdaterar dubblett", async () => {
    const a = await subscribe();
    expect(a.staff_id).toBeNull();
    const b = await subscribe("emma");
    expect(b.id).toBe(a.id);
    expect(b.token).not.toBe(a.token);
    expect(
      f.db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get()?.n,
    ).toBe(1);
    expect(
      f.db
        .prepare(
          "SELECT staff_id,management_token_hash FROM push_subscriptions",
        )
        .get()?.staff_id,
    ).toBe("emma");
    expect(
      f.db.prepare("SELECT management_token_hash FROM push_subscriptions").get()
        ?.management_token_hash,
    ).not.toBe(b.token);
    expect(
      (
        await f.call(
          "/push/subscription",
          "GET",
          undefined,
          undefined,
          ownerHeaders(a),
        )
      ).status,
    ).toBe(401);
  });
  it("endpoint ensam ger inte rätt att ta över en enhet", async () => {
    await subscribe();
    const raw = subscription();
    raw.keys.auth = base64url(crypto.getRandomValues(new Uint8Array(16)));
    expect(
      (
        await f.call("/push/subscribe", "POST", {
          subscription: raw,
          staff_id: "peter",
        })
      ).status,
    ).toBe(409);
    expect(
      f.db.prepare("SELECT staff_id FROM push_subscriptions").get()?.staff_id,
    ).toBeNull();
  });
  it("byter association separat och spärrar ändringar utan rätt ägartoken", async () => {
    const owner = await subscribe("emma");
    expect(
      (
        await f.call(
          "/push/subscription",
          "PATCH",
          { staff_id: "peter", device_label: "Kassan" },
          undefined,
          ownerHeaders(owner),
        )
      ).status,
    ).toBe(200);
    expect(
      await (
        await f.call(
          "/push/subscription",
          "GET",
          undefined,
          undefined,
          ownerHeaders(owner),
        )
      ).json(),
    ).toMatchObject({ staff_id: "peter", device_label: "Kassan" });
    expect(
      (await f.call("/push/subscription", "PATCH", { staff_id: null })).status,
    ).toBe(401);
    expect(
      (
        await f.call("/push/unsubscribe", "DELETE", undefined, undefined, {
          ...ownerHeaders(owner),
          "X-Push-Token": base64url(new Uint8Array(32)),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await f.call(
          "/push/subscription",
          "PATCH",
          { staff_id: null },
          undefined,
          ownerHeaders(owner),
        )
      ).status,
    ).toBe(200);
  });
  it("avvisar okänd/inaktiv/arkiverad säljare och stänger av gamla kopplingar säkert", async () => {
    const owner = await subscribe("emma");
    f.db.prepare("UPDATE staff SET active=0 WHERE id='emma'").run();
    expect(
      f.db.prepare("SELECT active,staff_id FROM push_subscriptions").get(),
    ).toMatchObject({ active: 0, staff_id: "emma" });
    for (const staff_id of ["emma", "unknown"])
      expect(
        (
          await f.call("/push/subscribe", "POST", {
            subscription: subscription("new-" + staff_id),
            staff_id,
          })
        ).status,
      ).toBe(400);
    f.db
      .prepare(
        "UPDATE staff SET deleted_at='2026-10-07',active=0 WHERE id='peter'",
      )
      .run();
    expect(
      (
        await f.call(
          "/push/subscription",
          "PATCH",
          { staff_id: "peter" },
          undefined,
          ownerHeaders(owner),
        )
      ).status,
    ).toBe(400);
  });
  it("fysisk personalradering lämnar inte aktiv oavsiktlig gemensam enhet", async () => {
    await subscribe("kalle");
    f.db.prepare("DELETE FROM staff WHERE id='kalle'").run();
    expect(
      f.db.prepare("SELECT active,staff_id FROM push_subscriptions").get(),
    ).toMatchObject({ active: 0, staff_id: null });
  });
  it("avregistrerar utan att exponera enhetens krypteringsnycklar", async () => {
    const owner = await subscribe();
    const response = await f.call(
      "/push/subscription",
      "GET",
      undefined,
      undefined,
      ownerHeaders(owner),
    );
    const text = await response.text();
    expect(text).not.toContain("fcm.googleapis.com");
    expect(text).not.toContain(browserKeys.auth);
    expect(text).not.toContain(browserKeys.publicKey);
    expect(
      (
        await f.call(
          "/push/unsubscribe",
          "DELETE",
          undefined,
          undefined,
          ownerHeaders(owner),
        )
      ).status,
    ).toBe(200);
    expect(
      f.db.prepare("SELECT active FROM push_subscriptions").get()?.active,
    ).toBe(0);
  });
  it.each([
    "http://fcm.googleapis.com/fcm/send/x",
    "https://localhost/push",
    "https://127.0.0.1/push",
    "https://example.com/push",
    "https://fcm.googleapis.com.evil.test/push",
    "https://fcm.googleapis.com:1234/push",
    "https://user:pass@fcm.googleapis.com/push",
  ])("avvisar SSRF/ogiltig adress %s", async (endpoint) => {
    expect(
      (
        await f.call("/push/subscribe", "POST", {
          subscription: { ...subscription(), endpoint },
          staff_id: null,
        })
      ).status,
    ).toBe(400);
    expect(transport).not.toHaveBeenCalled();
  });
  it("validerar nycklar, storlek och CSRF", async () => {
    for (const raw of [
      { ...subscription(), keys: { p256dh: "x", auth: "bad" } },
      {
        ...subscription(),
        keys: { p256dh: base64url(new Uint8Array(65)), auth: browserKeys.auth },
      },
    ])
      expect(
        (
          await f.call("/push/subscribe", "POST", {
            subscription: raw,
            staff_id: null,
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await f.call("/push/subscribe", "POST", {
          subscription: subscription(),
          staff_id: null,
          device_label: "x".repeat(9000),
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await f.call(
          "/push/subscribe",
          "POST",
          { subscription: subscription(), staff_id: null },
          undefined,
          { Origin: "https://evil.test" },
        )
      ).status,
    ).toBe(403);
  });
});
describe("Leverans, mottagare och spam-skydd", () => {
  it("begränsar manuella/testutskick gemensamt, men en idempotent retry skickar aldrig igen", async () => {
    const owner = await subscribe();
    await enable();
    const first = crypto.randomUUID();
    expect((await manual("all", undefined, first)).status).toBe(200);
    expect(
      (
        await f.call(
          "/push/test",
          "POST",
          { request_id: crypto.randomUUID() },
          undefined,
          ownerHeaders(owner),
        )
      ).status,
    ).toBe(200);
    expect((await manual()).status).toBe(200);
    expect((await manual()).status).toBe(429);
    expect((await manual("all", undefined, first)).status).toBe(200);
    expect(transport).toHaveBeenCalledTimes(3);
    f.db
      .prepare(
        "UPDATE notification_events SET created_at='2020-01-01T00:00:00.000Z'",
      )
      .run();
    expect((await manual()).status).toBe(200);
    expect(transport).toHaveBeenCalledTimes(4);
  });
  it("kräver Admin för manuella notiser och inställningar; global AV spärrar all leverans", async () => {
    await subscribe();
    for (const [path, method] of [
      ["/admin/notifications", "GET"],
      ["/admin/notifications/send", "POST"],
      ["/admin/notifications/settings", "PUT"],
    ])
      expect(
        (await f.call(path, method, method === "GET" ? undefined : {})).status,
      ).toBe(401);
    expect((await manual()).status).toBe(409);
    expect(transport).not.toHaveBeenCalled();
  });
  it.each(["all", "shared", "staff"])(
    "rätt mottagare: %s",
    async (audience) => {
      await subscribe(null, "shared");
      await subscribe("emma", "emma");
      await subscribe("peter", "peter");
      await enable();
      const response = await manual(
        audience,
        audience === "staff" ? "emma" : undefined,
      );
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result).toMatchObject({
        sent: audience === "all" ? 3 : 1,
        failed: 0,
      });
      const endpoints = transport.mock.calls.map(([url]) => String(url));
      expect(endpoints).toEqual(
        audience === "all"
          ? expect.arrayContaining([
              "https://fcm.googleapis.com/fcm/send/shared",
              "https://fcm.googleapis.com/fcm/send/emma",
              "https://fcm.googleapis.com/fcm/send/peter",
            ])
          : [
              audience === "staff"
                ? "https://fcm.googleapis.com/fcm/send/emma"
                : "https://fcm.googleapis.com/fcm/send/shared",
            ],
      );
    },
  );
  it("testnotis når bara den autentiserade enheten och kan inte byta mottagare", async () => {
    const a = await subscribe(null, "first");
    await subscribe("emma", "second");
    await enable();
    expect(
      (await f.call("/push/test", "POST", { request_id: crypto.randomUUID() }))
        .status,
    ).toBe(401);
    const response = await f.call(
      "/push/test",
      "POST",
      { request_id: crypto.randomUUID() },
      undefined,
      ownerHeaders(a),
    );
    expect(await response.json()).toMatchObject({ sent: 1, total: 1 });
    expect(transport.mock.calls[0][0]).toBe(
      "https://fcm.googleapis.com/fcm/send/first",
    );
  });
  it("deduplicerar manuella återförsök och avvisar ändrat innehåll med samma ID", async () => {
    await subscribe();
    await enable();
    const id = crypto.randomUUID();
    await manual("all", undefined, id);
    await manual("all", undefined, id);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(
      (
        await f.call(
          "/admin/notifications/send",
          "POST",
          {
            title: "Annat",
            body: "Ny",
            audience: "all",
            destination: "start",
            request_id: id,
          },
          cookie,
        )
      ).status,
    ).toBe(409);
  });
  it.each([404, 410])(
    "HTTP %s inaktiverar föråldrad prenumeration",
    async (code) => {
      await subscribe();
      await enable();
      transport.mockResolvedValueOnce(new Response(null, { status: code }));
      const response = await manual();
      expect(await response.json()).toMatchObject({
        sent: 0,
        failed: 1,
        total: 1,
      });
      expect(
        f.db
          .prepare(
            "SELECT active,failure_count,disabled_at FROM push_subscriptions",
          )
          .get(),
      ).toMatchObject({
        active: 0,
        failure_count: 1,
        disabled_at: expect.any(String),
      });
    },
  );
  it("tillfälligt fel/network failure stoppar inte andra enheter", async () => {
    await subscribe(null, "bad");
    await subscribe(null, "good");
    await enable();
    transport.mockRejectedValueOnce(new Error("Transport unavailable"));
    expect(await (await manual()).json()).toMatchObject({
      sent: 1,
      failed: 1,
      total: 2,
    });
    expect(
      f.db
        .prepare(
          "SELECT active,failure_count FROM push_subscriptions WHERE endpoint LIKE '%/bad'",
        )
        .get(),
    ).toMatchObject({ active: 1, failure_count: 1 });
    expect(
      f.db
        .prepare(
          "SELECT active,failure_count,last_success_at FROM push_subscriptions WHERE endpoint LIKE '%/good'",
        )
        .get(),
    ).toMatchObject({
      active: 1,
      failure_count: 0,
      last_success_at: expect.any(String),
    });
    transport.mockResolvedValue(new Response(null, { status: 503 }));
    await manual();
    expect(
      f.db
        .prepare(
          "SELECT active FROM push_subscriptions WHERE endpoint LIKE '%/bad'",
        )
        .get()?.active,
    ).toBe(1);
  });
  it("framgång återställer felräknare och Admin-status innehåller inga privata enhetsvärden", async () => {
    await subscribe("emma");
    await enable();
    f.db.prepare("UPDATE push_subscriptions SET failure_count=4").run();
    await manual();
    expect(
      f.db
        .prepare("SELECT failure_count,last_success_at FROM push_subscriptions")
        .get(),
    ).toMatchObject({ failure_count: 0, last_success_at: expect.any(String) });
    const result = await (
      await f.call("/admin/notifications", "GET", undefined, cookie)
    ).json();
    expect(result).toMatchObject({
      counts: { active: 1, shared: 0 },
      leaderChangeSupported: false,
    });
    const encoded = JSON.stringify(result);
    for (const secret of [
      browserKeys.auth,
      browserKeys.publicKey,
      f.env.VAPID_PRIVATE_KEY!,
      "fcm.googleapis.com",
    ])
      expect(encoded).not.toContain(secret);
  });
  it("servervaliderar mottagare, destination, tomt innehåll och tröskel", async () => {
    await enable();
    expect((await manual("staff", "missing")).status).toBe(400);
    for (const data of [
      { title: "", body: "Hej", audience: "all", destination: "start" },
      { title: "Hej", body: "Hej", audience: "bad", destination: "start" },
      {
        title: "Hej",
        body: "Hej",
        audience: "all",
        destination: "https://evil.test",
      },
    ])
      expect(
        (
          await f.call(
            "/admin/notifications/send",
            "POST",
            { ...data, request_id: crypto.randomUUID() },
            cookie,
          )
        ).status,
      ).toBe(400);
    expect(
      (
        await f.call(
          "/admin/notifications/settings",
          "PUT",
          { push_goal_close_threshold: 0 },
          cookie,
        )
      ).status,
    ).toBe(400);
  });
});
describe("Sanerad leveransdiagnostik", () => {
  const appleEndpoint = "https://web.push.apple.com/private-endpoint-path";
  async function diagnosticDevice(endpoint = appleEndpoint) {
    const response = await f.call("/push/subscribe", "POST", {
      subscription: { ...subscription(), endpoint },
      staff_id: "emma",
    });
    expect(response.status).toBe(201);
    await enable();
    return (await response.json()) as { id: string; token: string };
  }
  function expectSanitized(
    warn: ReturnType<typeof vi.spyOn>,
    owner: { id: string; token: string },
  ) {
    const log = JSON.stringify(warn.mock.calls);
    for (const secret of [
      appleEndpoint,
      "private-endpoint-path",
      browserKeys.auth,
      browserKeys.publicKey,
      f.env.VAPID_PUBLIC_KEY!,
      f.env.VAPID_PRIVATE_KEY!,
      f.env.ADMIN_PIN!,
      owner.id,
      owner.token,
      "Emma",
      "emma",
      "Dagens fokus",
      "Nu kör vi!",
    ])
      expect(log).not.toContain(secret);
    if (transport.mock.calls.length) {
      const options = transport.mock.calls[0][1]!;
      expect(log).not.toContain(
        (options.headers as Record<string, string>).Authorization,
      );
      expect(log).not.toContain(
        base64url(new Uint8Array(options.body as ArrayBuffer)),
      );
    }
  }
  it.each([400, 403])(
    "HTTP %s ger exakt en sanerad Apple-varning utan ändrat API eller felhantering",
    async (status) => {
      const owner = await diagnosticDevice();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      // Even provider response bodies may contain sensitive details; they must not be logged.
      transport.mockResolvedValueOnce(
        new Response(
          appleEndpoint + browserKeys.auth + f.env.VAPID_PRIVATE_KEY,
          { status },
        ),
      );
      const response = await f.call(
        "/push/test",
        "POST",
        { request_id: crypto.randomUUID() },
        undefined,
        ownerHeaders(owner),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        state: "complete",
        total: 1,
        sent: 0,
        failed: 1,
      });
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        JSON.stringify({
          event: "push_delivery_failed",
          provider: "apple",
          status,
          event_type: "test",
        }),
      );
      expectSanitized(warn, owner);
      expect(
        f.db
          .prepare(
            "SELECT active,failure_count,disabled_at,last_success_at FROM push_subscriptions",
          )
          .get(),
      ).toEqual({
        active: 1,
        failure_count: 1,
        disabled_at: null,
        last_success_at: null,
      });
    },
  );
  it.each([300, 301, 302, 307, 308, 399])(
    "HTTP %s följs aldrig av riktig fetch och Location/Authorization förblir privata",
    async (status) => {
      const owner = await diagnosticDevice();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      let providerRequests = 0,
        redirectedRequests = 0,
        providerAuthorized = false;
      let location = "";
      // Local-only provider fixture: real fetch redirect handling, never internet push.
      const server = createServer((request, response) => {
        request.resume();
        if (request.url?.startsWith("/redirected")) {
          redirectedRequests++;
          response.writeHead(201).end();
        } else {
          providerRequests++;
          providerAuthorized =
            !!request.headers.authorization?.startsWith("vapid t=");
          response.writeHead(status, { Location: location }).end();
        }
      });
      try {
        await new Promise<void>((resolve) =>
          server.listen(0, "127.0.0.1", resolve),
        );
        const address = server.address();
        if (!address || typeof address === "string")
          throw new Error("Local test server unavailable");
        const origin = `http://127.0.0.1:${address.port}`;
        location = `${origin}/redirected?private=${browserKeys.auth}`;
        transport.mockImplementation((url, options) => {
          expect(url).toBe(appleEndpoint);
          expect(options?.redirect).toBe("manual");
          // Only map the approved provider URL to the local fixture; preserve every request option.
          return nativeFetch(origin + "/provider", options);
        });
        const response = await manual();
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          state: "complete",
          total: 1,
          sent: 0,
          failed: 1,
        });
        expect(transport).toHaveBeenCalledTimes(1);
        expect(providerRequests).toBe(1);
        expect(providerAuthorized).toBe(true);
        // No request reaches Location, so Authorization cannot be forwarded even to the same host.
        expect(redirectedRequests).toBe(0);
        expect(warn).toHaveBeenCalledExactlyOnceWith(
          JSON.stringify({
            event: "push_delivery_failed",
            provider: "apple",
            status,
            event_type: "manual",
          }),
        );
        expectSanitized(warn, owner);
        expect(JSON.stringify(warn.mock.calls)).not.toContain(location);
        expect(JSON.stringify(warn.mock.calls)).not.toContain("Location");
        expect(
          f.db
            .prepare(
              "SELECT active,failure_count,disabled_at,last_success_at FROM push_subscriptions",
            )
            .get(),
        ).toEqual({
          active: 1,
          failure_count: 1,
          disabled_at: null,
          last_success_at: null,
        });
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        });
      }
    },
  );
  it.each([200, 204])(
    "HTTP %s behåller lyckad leverans utan diagnostik",
    async (status) => {
      await diagnosticDevice();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      transport.mockResolvedValueOnce(new Response(null, { status }));
      expect(await (await manual()).json()).toEqual({
        state: "complete",
        total: 1,
        sent: 1,
        failed: 0,
      });
      expect(warn).not.toHaveBeenCalled();
      expect(
        f.db
          .prepare(
            "SELECT active,failure_count,last_success_at FROM push_subscriptions",
          )
          .get(),
      ).toEqual({
        active: 1,
        failure_count: 0,
        last_success_at: expect.any(String),
      });
    },
  );
  it("behåller åtta sekunders timeout och sanerad fetch_provider-diagnostik vid timeout", async () => {
    const owner = await diagnosticDevice();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const controller = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(controller.signal);
    transport.mockImplementation(async (_url, options) => {
      expect(options?.signal).toBe(controller.signal);
      controller.abort(
        new DOMException(appleEndpoint + browserKeys.auth, "TimeoutError"),
      );
      throw controller.signal.reason;
    });
    expect(await (await manual()).json()).toEqual({
      state: "complete",
      total: 1,
      sent: 0,
      failed: 1,
    });
    expect(timeout).toHaveBeenCalledExactlyOnceWith(8000);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        event: "push_delivery_exception",
        provider: "apple",
        stage: "fetch_provider",
        exception_type: "TimeoutError",
      }),
    );
    expectSanitized(warn, owner);
    expect(
      f.db
        .prepare(
          "SELECT active,failure_count,disabled_at FROM push_subscriptions",
        )
        .get(),
    ).toEqual({ active: 1, failure_count: 1, disabled_at: null });
  });
  it.each(["validate", "crypto", "vapid", "fetch", "custom-name"])(
    "%s-undantag loggar enbart en säker typ och behåller befintligt felresultat",
    async (source) => {
      const owner = await diagnosticDevice();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const sensitive = [
        appleEndpoint,
        browserKeys.auth,
        browserKeys.publicKey,
        f.env.VAPID_PRIVATE_KEY,
        owner.id,
        "Emma",
      ].join(" ");
      if (source === "validate")
        vi.spyOn(crypto.subtle, "importKey").mockRejectedValueOnce(
          new TypeError(sensitive),
        );
      else if (source === "crypto")
        vi.spyOn(crypto.subtle, "encrypt").mockRejectedValueOnce(
          new DOMException(sensitive, "OperationError"),
        );
      else if (source === "vapid")
        vi.spyOn(crypto.subtle, "sign").mockRejectedValueOnce(
          new TypeError(sensitive),
        );
      else {
        const error = new TypeError(sensitive, { cause: sensitive });
        error.stack = sensitive;
        if (source === "custom-name") error.name = sensitive;
        transport.mockRejectedValueOnce(error);
      }
      const response = await manual();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        state: "complete",
        total: 1,
        sent: 0,
        failed: 1,
      });
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        JSON.stringify({
          event: "push_delivery_exception",
          provider: "apple",
          stage:
            source === "validate"
              ? "validate_target"
              : source === "crypto"
                ? "encrypt_payload"
                : source === "vapid"
                  ? "vapid_authorization"
                  : "fetch_provider",
          exception_type:
            source === "crypto"
              ? "OperationError"
              : source === "custom-name"
                ? "Error"
                : "TypeError",
        }),
      );
      expectSanitized(warn, owner);
      expect(
        f.db
          .prepare(
            "SELECT active,failure_count,disabled_at,last_success_at FROM push_subscriptions",
          )
          .get(),
      ).toEqual({
        active: 1,
        failure_count: 1,
        disabled_at: null,
        last_success_at: null,
      });
      if (["validate", "crypto", "vapid"].includes(source))
        expect(transport).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["https://fcm.googleapis.com/fcm/send/private-path", "google"],
    [
      "https://updates.push.services.mozilla.com/wpush/v2/private-path",
      "mozilla",
    ],
    ["https://wns1.notify.windows.com/private-path", "windows"],
  ])(
    "kategoriserar %s utan att logga URL eller ändra 410-hantering",
    async (endpoint, provider) => {
      const owner = await diagnosticDevice(endpoint);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      transport.mockResolvedValueOnce(new Response(null, { status: 410 }));
      expect(await (await manual()).json()).toEqual({
        state: "complete",
        total: 1,
        sent: 0,
        failed: 1,
      });
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        JSON.stringify({
          event: "push_delivery_failed",
          provider,
          status: 410,
          event_type: "manual",
        }),
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain(endpoint);
      expectSanitized(warn, owner);
      expect(
        f.db
          .prepare(
            "SELECT active,failure_count,disabled_at FROM push_subscriptions",
          )
          .get(),
      ).toEqual({
        active: 0,
        failure_count: 1,
        disabled_at: expect.any(String),
      });
    },
  );
  it("lyckad leverans förblir tyst och återställer fortfarande felräknaren", async () => {
    await diagnosticDevice();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await (await manual()).json()).toEqual({
      state: "complete",
      total: 1,
      sent: 1,
      failed: 0,
    });
    expect(warn).not.toHaveBeenCalled();
    expect(
      f.db
        .prepare(
          "SELECT active,failure_count,last_success_at FROM push_subscriptions",
        )
        .get(),
    ).toEqual({
      active: 1,
      failure_count: 0,
      last_success_at: expect.any(String),
    });
  });
});
describe("Automatiska målnotiser", () => {
  async function goalFixture() {
    await subscribe();
    await enable();
    f.db.prepare("UPDATE settings SET value='3' WHERE key='daily_goal'").run();
    f.db
      .prepare(
        "UPDATE settings SET value='1' WHERE key='push_goal_close_threshold'",
      )
      .run();
  }
  it("global AV blockerar även mål och eget test utan att påverka försäljning", async () => {
    const owner = await subscribe();
    f.db.prepare("UPDATE settings SET value='1' WHERE key='daily_goal'").run();
    expect((await f.sale()).status).toBe(201);
    await f.finish();
    expect(
      (
        await f.call(
          "/push/test",
          "POST",
          { request_id: crypto.randomUUID() },
          undefined,
          ownerHeaders(owner),
        )
      ).status,
    ).toBe(409);
    expect(transport).not.toHaveBeenCalled();
    expect(
      f.db.prepare("SELECT COUNT(*) n FROM notification_events").get()?.n,
    ).toBe(0);
  });
  it("nära-mål och mål nått skickas en gång; retries/ångring/re-crossing upprepar inte", async () => {
    await goalFixture();
    const one = (await (await f.sale()).json()) as {
      id: string;
      request_id: string;
    };
    await f.finish();
    expect(transport).not.toHaveBeenCalled();
    const requestId = crypto.randomUUID();
    await f.sale("emma", "preemium", requestId);
    await f.finish();
    expect(transport).toHaveBeenCalledTimes(1);
    await f.sale("emma", "preemium", requestId);
    await f.finish();
    expect(transport).toHaveBeenCalledTimes(1);
    await f.sale();
    await f.finish();
    expect(transport).toHaveBeenCalledTimes(2);
    await f.sale();
    await f.finish();
    expect(transport).toHaveBeenCalledTimes(2);
    await f.call("/sales/" + one.id + "/void", "POST", {
      request_id: one.request_id,
    });
    await f.sale();
    await f.finish();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(
      f.db
        .prepare("SELECT event_key FROM notification_events ORDER BY event_key")
        .all()
        .map((r) => r.event_key),
    ).toEqual([
      "daily_goal_close:" + stockholmDay(),
      "daily_goal_reached:" + stockholmDay(),
    ]);
  });
  it("nästa Stockholmsdygn kan skicka igen och UTC-midnatt är inte gränsen", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T21:59:00Z"));
    await goalFixture();
    for (let i = 0; i < 3; i++) {
      await f.sale();
      await f.finish();
    }
    expect(transport).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date("2026-10-07T22:01:00Z"));
    for (let i = 0; i < 3; i++) {
      await f.sale();
      await f.finish();
    }
    expect(transport).toHaveBeenCalledTimes(4);
    expect(
      f.db
        .prepare(
          "SELECT DISTINCT event_date FROM notification_events ORDER BY event_date",
        )
        .all()
        .map((r) => r.event_date),
    ).toEqual(["2026-10-07", "2026-10-08"]);
  });
  it("avstängda automatiska typer/globalt AV producerar inga pushes", async () => {
    await goalFixture();
    f.db
      .prepare(
        "UPDATE settings SET value='0' WHERE key IN('push_goal_close_enabled','push_goal_reached_enabled')",
      )
      .run();
    for (let i = 0; i < 3; i++) {
      await f.sale();
      await f.finish();
    }
    expect(transport).not.toHaveBeenCalled();
    expect(
      f.db.prepare("SELECT COUNT(*) AS n FROM notification_events").get()?.n,
    ).toBe(0);
  });
  it("pushfel påverkar inte sparad försäljning, statistik eller idempotens", async () => {
    await goalFixture();
    transport.mockRejectedValue(new Error("Network error"));
    await f.sale();
    await f.finish();
    const id = crypto.randomUUID(),
      response = await f.sale("emma", "fin", id);
    expect(response.status).toBe(201);
    await f.finish();
    expect((await f.sale("emma", "fin", id)).status).toBe(200);
    expect(f.db.prepare("SELECT COUNT(*) AS n FROM sales").get()?.n).toBe(2);
    expect(await (await f.call("/stats")).json()).toMatchObject({
      count: 2,
      revenue: 568,
    });
  });
  it("ny migration lämnar försäljningshistorik/priser och FK intakta", async () => {
    await f.sale();
    await f.finish();
    expect(f.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(f.db.prepare("SELECT price_sek FROM sales").get()?.price_sek).toBe(
      389,
    );
    expect(
      f.db.prepare("SELECT COUNT(*) AS n FROM wash_programs").get()?.n,
    ).toBe(6);
  });
  it("mål lägre än tröskeln skickar inte en meningslös nära-notis", async () => {
    await goalFixture();
    f.db
      .prepare(
        "UPDATE settings SET value='5' WHERE key='push_goal_close_threshold'",
      )
      .run();
    for (let i = 0; i < 3; i++) {
      await f.sale();
      await f.finish();
    }
    expect(transport).toHaveBeenCalledTimes(1);
    expect(
      f.db.prepare("SELECT event_type FROM notification_events").get()
        ?.event_type,
    ).toBe("daily_goal_reached");
  });
});
describe("Standardenlig kryptering och VAPID", () => {
  it("mottagaren kan dekryptera aes128gcm-payloaden med sin privata P-256-nyckel", async () => {
    const payload = {
      title: "Tvättligan",
      body: "Svenska tecken 🎉",
      url: "/?view=stats",
      tag: "goal",
      type: "test",
    };
    const encoded = await encryptPayload(
      {
        endpoint: subscription().endpoint,
        p256dh: browserKeys.publicKey,
        auth: browserKeys.auth,
      },
      payload,
    );
    const salt = encoded.slice(0, 16),
      sender = encoded.slice(21, 86);
    expect(new DataView(encoded.buffer).getUint32(16)).toBe(4096);
    expect(encoded[20]).toBe(65);
    const senderKey = await crypto.subtle.importKey(
      "raw",
      bytes(sender),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    const shared = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "ECDH", public: senderKey },
        browserKeys.privateKey,
        256,
      ),
    );
    const derive = async (
      input: Uint8Array,
      salt: Uint8Array,
      info: Uint8Array,
      length: number,
    ) => {
      const key = await crypto.subtle.importKey(
        "raw",
        bytes(input),
        "HKDF",
        false,
        ["deriveBits"],
      );
      return new Uint8Array(
        await crypto.subtle.deriveBits(
          {
            name: "HKDF",
            hash: "SHA-256",
            salt: bytes(salt),
            info: bytes(info),
          },
          key,
          length * 8,
        ),
      );
    };
    const enc = new TextEncoder(),
      ikm = await derive(
        shared,
        decode64(browserKeys.auth),
        concat(
          enc.encode("WebPush: info\0"),
          decode64(browserKeys.publicKey),
          sender,
        ),
        32,
      );
    const cek = await derive(
        ikm,
        salt,
        enc.encode("Content-Encoding: aes128gcm\0"),
        16,
      ),
      nonce = await derive(
        ikm,
        salt,
        enc.encode("Content-Encoding: nonce\0"),
        12,
      );
    const key = await crypto.subtle.importKey(
      "raw",
      bytes(cek),
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );
    const plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bytes(nonce) },
        key,
        bytes(encoded.slice(86)),
      ),
    );
    expect(plain.at(-1)).toBe(2);
    expect(JSON.parse(new TextDecoder().decode(plain.slice(0, -1)))).toEqual(
      payload,
    );
  });
  it("JWT har korrekt aud/sub/exp och verifierbar raw ES256-signatur", async () => {
    const k = await keys(),
      now = Date.parse("2026-10-07T12:00:00Z");
    const auth = await vapidAuthorization(subscription().endpoint, k, now);
    const jwt = auth.match(/t=([^,]+)/)![1],
      parts = jwt.split(".");
    expect(JSON.parse(new TextDecoder().decode(decode64(parts[1])))).toEqual({
      aud: "https://fcm.googleapis.com",
      sub: k.subject,
      exp: Math.floor(now / 1000) + 43200,
    });
    expect(decode64(parts[2]).length).toBe(64);
    expect(
      await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        k.verifyKey,
        bytes(decode64(parts[2])),
        bytes(new TextEncoder().encode(parts[0] + "." + parts[1])),
      ),
    ).toBe(true);
    expect(auth).not.toContain(k.privateKey);
  });
  it("faktisk transport använder rätt headers, krypterad kropp och inga redirects", async () => {
    await subscribe();
    await enable();
    await manual();
    const options = transport.mock.calls[0][1]!;
    expect(options.method).toBe("POST");
    expect(options.redirect).toBe("manual");
    expect(options.headers).toMatchObject({
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "3600",
      Urgency: "normal",
    });
    expect((options.headers as Record<string, string>).Authorization).toMatch(
      /^vapid t=/,
    );
    expect(new TextDecoder().decode(options.body as ArrayBuffer)).not.toContain(
      "Nu kör vi",
    );
  });
});
