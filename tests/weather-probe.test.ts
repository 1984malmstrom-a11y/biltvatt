import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import probeWorker, { probeSmhi } from "../scripts/weather-probe/worker";
import { SMHI_POINT_URL } from "../worker/weather";

const forecast = { timeSeries: [
  { time: "2026-10-08T10:00:00Z", data: { air_temperature: 12, symbol_code: 3 } },
  { time: "2026-10-09T10:00:00Z", data: { air_temperature: 9, symbol_code: 5 } },
] };
const incoming = () => new Request("https://probe.test/probe", { headers: {
  Cookie: "private=session", Authorization: "Bearer private",
  "cf-workers-preview-token": "private-preview-token",
} });
type ProbeBody = { attempts: { mode: string; httpStatus?: number; errorType?: string;
  errorCategory?: string; redirectHost?: string | null }[]; signalCheck: {
  supported: boolean; initiallyAborted?: boolean; errorCategory?: string;
}; [key: string]: unknown };

describe("isolerat SMHI-prov", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T10:00:00Z")); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it("Cloudflares tre handlerargument binder inte env som fetch-funktion", async () => {
    const upstream = vi.fn(async (input: string | URL | Request) => input === "https://example.com"
      ? new Response("example", { status: 200 })
      : Response.json(forecast));
    vi.stubGlobal("fetch", upstream);
    const env = { marker: "cloudflare-env-is-not-a-fetcher" };
    const context = {
      waitUntil: vi.fn(), passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    const response = await probeWorker.fetch(incoming(), env, context);
    const data = await response.json() as ProbeBody;
    expect(response.status).toBe(200);
    expect(data).toMatchObject({ ok: true, stage: "complete" });
    expect(data.attempts).toHaveLength(9);
    expect(data.attempts.every((attempt) => attempt.httpStatus === 200)).toBe(true);
    expect(upstream).toHaveBeenCalledTimes(9);
    expect(upstream.mock.calls[0][0]).toBe("https://example.com");
    expect(JSON.stringify(data)).not.toContain(env.marker);
  });

  it("jämför minimal GET, signal, cache och ordinarie anrop utan att vidarebefordra inkommande headers", async () => {
    const calls: { input: string | URL | Request; init?: RequestInit }[] = [];
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ input, init });
      return typeof input === "string" && input === "https://example.com"
        ? new Response("example", { status: 200 })
        : Response.json(forecast);
    }) as typeof fetch;
    const response = await probeSmhi(incoming(), fetcher);
    const data = await response.json() as ProbeBody;
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(data).toMatchObject({ ok: true, stage: "complete", signalCheck: {
      supported: true, initiallyAborted: false,
    } });
    expect(data.attempts.map((a) => a.mode)).toEqual([
      "example-basic", "smhi-basic", "smhi-redirect-manual", "smhi-redirect-error",
      "smhi-with-signal", "smhi-headers-only", "smhi-cache-only",
      "smhi-combined-no-cache", "app-fetch",
    ]);
    expect(calls[0]).toEqual({ input: "https://example.com", init: undefined });
    expect(calls[1]).toEqual({ input: SMHI_POINT_URL, init: undefined });
    expect(calls[2].init).toEqual({ redirect: "manual" });
    expect(calls[3].init).toEqual({ redirect: "error" });
    expect(calls[4].init?.signal).toBeInstanceOf(AbortSignal);
    expect(calls[5].init).toEqual({ method: "GET", headers: { Accept: "application/json" } });
    expect(calls[6].init).toEqual({ cf: {
      cacheEverything: true, cacheTtlByStatus: { "200": 1800, "201-599": -1 },
    } });
    expect(calls[7].init).toMatchObject({ method: "GET", redirect: "error" });
    expect(calls[7].init?.signal).toBeInstanceOf(AbortSignal);
    expect(calls[7].init?.cf).toBeUndefined();
    expect(calls[8].init).toMatchObject({ method: "GET", redirect: "error", cf: calls[6].init?.cf });
    expect(JSON.stringify(calls)).not.toContain("private");
    expect(JSON.stringify(data)).not.toContain("private");
  });

  it("isolerar signalfel och sanerar felbeskrivningen", async () => {
    const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.signal) throw new TypeError("Invalid signal; token=private-secret");
      return Response.json(forecast);
    }) as typeof fetch;
    const response = await probeSmhi(incoming(), fetcher);
    const data = await response.json() as ProbeBody;
    expect(response.status).toBe(503);
    expect(data).toMatchObject({ ok: false, stage: "fetch" });
    expect(data.attempts.find((a) => a.mode === "smhi-basic")?.httpStatus).toBe(200);
    expect(data.attempts.find((a) => a.mode === "smhi-with-signal")).toMatchObject({
      errorType: "TypeError", errorCategory: "abort-signal",
    });
    expect(data.attempts.find((a) => a.mode === "smhi-cache-only")?.httpStatus).toBe(200);
    expect(JSON.stringify(data)).not.toContain("private-secret");
  });

  it("isolerar cacheinställningsfel från fungerande minimalt anrop och signal", async () => {
    const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.cf) throw new TypeError("Invalid RequestInit cache option at secret=private");
      return Response.json(forecast);
    }) as typeof fetch;
    const data = await (await probeSmhi(incoming(), fetcher)).json() as ProbeBody;
    expect(data.attempts.find((a) => a.mode === "smhi-basic")?.httpStatus).toBe(200);
    expect(data.attempts.find((a) => a.mode === "smhi-with-signal")?.httpStatus).toBe(200);
    expect(data.attempts.find((a) => a.mode === "smhi-cache-only")).toMatchObject({
      errorType: "TypeError", errorCategory: "request-options",
    });
    expect(JSON.stringify(data)).not.toContain("secret=private");
  });

  it("visar separat om AbortSignal.timeout inte kan skapas", async () => {
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => { throw new TypeError("Unsupported signal private"); });
    const fetcher = (async () => Response.json(forecast)) as typeof fetch;
    const data = await (await probeSmhi(incoming(), fetcher)).json() as ProbeBody;
    expect(data.signalCheck).toMatchObject({ supported: false, errorCategory: "abort-signal" });
    expect(data.attempts.some((a) => a.mode === "smhi-with-signal")).toBe(false);
    expect(data.attempts.find((a) => a.mode === "app-fetch")).toMatchObject({
      errorType: "TypeError", errorCategory: "abort-signal",
    });
    expect(JSON.stringify(data)).not.toContain("private");
  });

  it("rapporterar HTTP-status och endast redirectens värdnamn", async () => {
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      if (input === "https://example.com") return new Response("ok");
      if (init?.redirect === "manual") return new Response(null, {
        status: 302, headers: { Location: "https://redirect.example/secret-path?token=private" },
      });
      return new Response("blocked", { status: 403 });
    }) as typeof fetch;
    const response = await probeSmhi(incoming(), fetcher);
    const data = await response.json() as ProbeBody;
    expect(response.status).toBe(503);
    expect(data.stage).toBe("http");
    expect(data.attempts.find((a) => a.mode === "smhi-basic")?.httpStatus).toBe(403);
    expect(data.attempts.find((a) => a.mode === "smhi-redirect-manual")).toMatchObject({
      httpStatus: 302, redirectHost: "redirect.example",
    });
    expect(JSON.stringify(data)).not.toContain("secret-path");
    expect(JSON.stringify(data)).not.toContain("token=private");
  });

  it("isolerar redirect:error och redovisar bara en säker felkategori", async () => {
    const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.redirect === "error") throw new TypeError("Redirect to private.example/secret-token");
      return Response.json(forecast);
    }) as typeof fetch;
    const data = await (await probeSmhi(incoming(), fetcher)).json() as ProbeBody;
    expect(data.attempts.find((a) => a.mode === "smhi-basic")?.httpStatus).toBe(200);
    expect(data.attempts.find((a) => a.mode === "smhi-redirect-error")).toMatchObject({
      errorType: "TypeError", errorCategory: "redirect",
    });
    expect(data.attempts.find((a) => a.mode === "smhi-with-signal")?.httpStatus).toBe(200);
    expect(JSON.stringify(data)).not.toContain("private.example");
    expect(JSON.stringify(data)).not.toContain("secret-token");
  });

  it("skiljer DNS-hint från oklassificerat TypeError utan att läcka feltext", async () => {
    const fetcher = (async (input: string | URL | Request) => {
      if (input === "https://example.com") return new Response("ok");
      throw new TypeError("getaddrinfo ENOTFOUND private-host.example");
    }) as typeof fetch;
    const data = await (await probeSmhi(incoming(), fetcher)).json() as ProbeBody;
    expect(data.attempts.find((a) => a.mode === "smhi-basic")).toMatchObject({
      errorType: "TypeError", errorCategory: "dns",
    });
    expect(JSON.stringify(data)).not.toContain("private-host");
  });

  it("skiljer JSON-, modell- och tidsurvalsfel efter lyckad fetch", async () => {
    const cases = [
      ["<html>", "json"],
      [JSON.stringify({ timeSeries: "bad" }), "schema"],
      [JSON.stringify({ timeSeries: [] }), "selection"],
    ] as const;
    for (const [body, stage] of cases) {
      const fetcher = (async () => new Response(body)) as typeof fetch;
      const data = await (await probeSmhi(incoming(), fetcher)).json() as ProbeBody;
      expect(data.stage).toBe(stage);
      expect(data.attempts.find((a) => a.mode === "app-fetch")?.httpStatus).toBe(200);
    }
  });
});
