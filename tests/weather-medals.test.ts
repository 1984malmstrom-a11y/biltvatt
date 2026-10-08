import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  it("cachar källserien 30 minuter på servern men räknar om dagsskiftet", async () => {
    const storage = new Map<string, Response>();
    const cache = {
      match: async (key: Request) => storage.get(key.url)?.clone(),
      put: async (key: Request, response: Response) => { storage.set(key.url, response.clone()); },
    } as unknown as Cache;
    let requests = 0;
    const fetcher = (async () => {
      requests++;
      return new Response(JSON.stringify(series), { status: 200 });
    }) as typeof fetch;
    await getWeather(new Date("2026-10-31T21:00:00Z"), fetcher, cache);
    const second = await getWeather(new Date("2026-10-31T23:20:00Z"), fetcher, cache);
    expect(requests).toBe(1);
    expect(storage.get(SMHI_POINT_URL)?.headers.get("Cache-Control")).toBe("public, max-age=1800");
    expect(second.tomorrow?.time).toBe("2026-11-02T11:00:00Z");
  });
  it("avvisar tjänstefel och felaktigt API-svar", async () => {
    await expect(getWeather(new Date(), (async () => new Response("", { status: 500 })) as typeof fetch, undefined)).rejects.toThrow("500");
    await expect(getWeather(new Date(), (async () => new Response("{}")) as typeof fetch, undefined)).rejects.toThrow("Ogiltig prognos");
  });
  it("visar färsk prognos även när edge-cachen tillfälligt fallerar", async () => {
    const broken = {
      match: async () => { throw new Error("cache offline"); },
      put: async () => { throw new Error("cache offline"); },
    } as unknown as Cache;
    const fetcher = (async () => new Response(JSON.stringify(series))) as typeof fetch;
    const result = await getWeather(new Date("2026-10-31T23:20:00Z"), fetcher, broken);
    expect(result.now?.temperature).toBe(5.4);
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
