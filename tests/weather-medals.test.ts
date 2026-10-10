import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixture } from "./fixture";
import { getWeather, selectWeather, SMHI_POINT_URL } from "../worker/weather";
import { medalPlacements } from "../src/medals";
import { stockholmDay } from "../worker/stats";
import type { Stats } from "../src/types";

describe("SMHI SNOW1gv1 prognos", () => {
  const series = {
    timeSeries: [
      { time: "2026-10-31T23:00:00Z", data: { air_temperature: 5.4, symbol_code: 3 } },
      { time: "2026-11-02T11:00:00Z", data: { air_temperature: 7.8, symbol_code: 18 } },
      { time: "2026-11-02T14:00:00Z", data: { air_temperature: 8.2, symbol_code: 6 } },
    ],
  };
  it("använder aktuellt SNOW1gv1, Tingsryds koordinater och prognosfält", () => {
    expect(SMHI_POINT_URL).toContain("/category/snow1g/version/1/geotype/point/lon/14.979/lat/56.525/");
    expect(selectWeather(series, new Date("2026-10-31T23:20:00Z"))).toEqual({
      source: "SMHI SNOW1gv1", kind: "forecast",
      now: { time: "2026-10-31T23:00:00Z", temperature: 5.4, symbol: 3 },
      tomorrow: { time: "2026-11-02T11:00:00Z", temperature: 7.8, symbol: 18 },
    });
  });
  it("väljer lokal lunch genom sommartidsbyte och ignorerar saknade värden", () => {
    const forecast = selectWeather({ timeSeries: [
      { time: "2026-03-29T10:00:00Z", data: { air_temperature: 9999, symbol_code: 1 } },
      { time: "2026-03-29T10:30:00Z", data: { air_temperature: 9, symbol_code: 2 } },
    ] }, new Date("2026-03-28T22:30:00Z"));
    expect(forecast.now).toBeNull();
    expect(forecast.tomorrow?.time).toBe("2026-03-29T10:30:00Z");
    expect(() => selectWeather({ timeSeries: "bad" })).toThrow();
  });
  it("cachar bara SMHI:s offentliga GET-subanrop och räknar om dagsskiftet", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return new Response(JSON.stringify(series), { status: 200 });
    }) as typeof fetch;
    await getWeather(new Date("2026-10-31T21:00:00Z"), fetcher);
    const second = await getWeather(new Date("2026-10-31T23:20:00Z"), fetcher);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(SMHI_POINT_URL);
    expect(calls[0].init.cf).toEqual({
      cacheEverything: true,
      cacheTtlByStatus: { "200": 1800, "201-599": -1 },
    });
    expect(calls[0].init.headers).toEqual({ Accept: "application/json" });
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.redirect).toBe("manual");
    expect(second.tomorrow?.time).toBe("2026-11-02T11:00:00Z");
  });
  it("avvisar tjänstefel och felaktigt API-svar", async () => {
    await expect(getWeather(new Date(), (async () => new Response("", { status: 500 })) as typeof fetch)).rejects.toThrow("500");
    await expect(getWeather(new Date(), (async () => new Response(null, {
      status: 302, headers: { Location: "https://example.invalid/forecast" },
    })) as typeof fetch)).rejects.toThrow("302");
    await expect(getWeather(new Date(), (async () => new Response("{}")) as typeof fetch)).rejects.toThrow("Ogiltig prognos");
  });
  it("hanterar timeout, ogiltig JSON och saknade prognosvärden utan uppfunna temperaturer", async () => {
    const now = new Date("2026-10-08T10:00:00Z");
    const timedOut = (async () => { throw new DOMException("Timeout", "TimeoutError"); }) as typeof fetch;
    await expect(getWeather(now, timedOut)).rejects.toMatchObject({ name: "TimeoutError" });
    await expect(getWeather(now, (async () => new Response("{bad json")) as typeof fetch))
      .rejects.toMatchObject({ name: "SyntaxError" });
    const incomplete = await getWeather(now, (async () => Response.json({ timeSeries: [
      { time: "2026-10-08T10:00:00Z", data: { air_temperature: 9999, symbol_code: 2 } },
      { time: "2026-10-09T10:00:00Z", data: { air_temperature: 9 } },
    ] })) as typeof fetch);
    expect(incomplete.now).toBeNull();
    expect(incomplete.tomorrow).toBeNull();
  });
  it("kräver stationsbehörighet och skickar aldrig cachebara API-svar", async () => {
    const f = fixture();
    try {
      const unauthenticated = await f.call("/station/weather");
      expect(unauthenticated.status).toBe(401);
      expect(unauthenticated.headers.get("Cache-Control")).toBe("no-store");
      const admin = await f.login();
      const upstream = vi.fn(async () => new Response(JSON.stringify(series)));
      vi.stubGlobal("fetch", upstream);
      const weather = await f.call("/station/weather", "GET", undefined, admin);
      expect(weather.status).toBe(200);
      expect(weather.headers.get("Cache-Control")).toBe("no-store");
      expect(weather.headers.get("Set-Cookie")).toBeNull();
      expect(upstream).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
      await f.finish();
      f.db.close();
    }
  });
});

describe("Metallkort följer månadens Snittköpsliga", () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => { f = fixture(); });
  afterEach(async () => { await f.finish(); f.db.close(); });
  const monthly = async () => (await (await f.call("/stats?period=month")).json()) as Stats;
  it("kräver tre giltiga tvättar, följer rankingens tie-break och makulering", async () => {
    const month = stockholmDay().slice(0, 7);
    for (let i = 0; i < 2; i++) {
      await f.sale("emma", "preemium");
      await f.sale("peter", "preemium");
    }
    expect(medalPlacements(await monthly(), month)).toEqual({});
    await f.sale("emma", "preemium");
    await f.sale("peter", "preemium");
    // Equal averages and equal counts use the existing Swedish name tie-break.
    expect(medalPlacements(await monthly(), month)).toEqual({ emma: 1, peter: 2 });
    const emma = f.db.prepare("SELECT id,request_id FROM sales WHERE staff_id='emma' LIMIT 1").get()!;
    await f.call(`/sales/${emma.id}/void`, "POST", { request_id: emma.request_id });
    expect(medalPlacements(await monthly(), month)).toEqual({ peter: 1 });
  });
  it("släcker metall vid månadsskifte och statistikfel utan att radera historik", async () => {
    for (let i = 0; i < 3; i++) await f.sale("emma", "fin");
    const month = stockholmDay().slice(0, 7);
    const stats = await monthly();
    expect(medalPlacements(stats, month)).toEqual({ emma: 1 });
    const nextMonth = new Date(`${month}-01T12:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    expect(medalPlacements(stats, nextMonth.toISOString().slice(0, 7))).toEqual({});
    expect(medalPlacements(null, month)).toEqual({});
    expect(f.db.prepare("SELECT COUNT(*) AS count FROM sales").get()).toMatchObject({ count: 3 });
  });
});
