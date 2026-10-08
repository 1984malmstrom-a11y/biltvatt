import { addDays, stockholmDay } from "./stats";

// SMHI SNOW1gv1 point forecast, WGS84 coordinates for central Tingsryd.
// https://opendata.smhi.se/metfcst/snow1gv1
export const SMHI_POINT_URL =
  "https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/14.979/lat/56.525/data.json";
const CACHE_SECONDS = 30 * 60;
type ForecastStep = {
  time: string;
  data: { air_temperature?: number; symbol_code?: number };
};
type Forecast = { timeSeries: ForecastStep[] };

export type WeatherPeriod = {
  time: string;
  temperature: number;
  symbol: number;
};
export type Weather = {
  source: "SMHI SNOW1gv1";
  kind: "forecast";
  now: WeatherPeriod | null;
  tomorrow: WeatherPeriod | null;
};

const stockholmHour = (time: string) =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Stockholm",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(time)),
  );

export function selectWeather(data: unknown, now = new Date()): Weather {
  if (!data || typeof data !== "object" || !Array.isArray((data as Forecast).timeSeries))
    throw new Error("Ogiltig prognos från SMHI.");
  const steps = (data as Forecast).timeSeries
    .filter((step) =>
      step &&
      Number.isFinite(Date.parse(step.time)) &&
      Number.isFinite(step.data?.air_temperature) &&
      step.data.air_temperature !== 9999 &&
      Number.isInteger(step.data?.symbol_code) &&
      step.data.symbol_code !== 9999,
    )
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const tomorrow = addDays(stockholmDay(now), 1);
  const nearestNow = steps.find((step) => Date.parse(step.time) >= now.getTime() - 30 * 60_000);
  const midday = steps
    .filter((step) => stockholmDay(new Date(step.time)) === tomorrow)
    .sort((a, b) => Math.abs(stockholmHour(a.time) - 12) - Math.abs(stockholmHour(b.time) - 12))[0];
  const period = (step?: ForecastStep): WeatherPeriod | null =>
    step
      ? { time: step.time, temperature: step.data.air_temperature!, symbol: step.data.symbol_code! }
      : null;
  return {
    source: "SMHI SNOW1gv1",
    kind: "forecast",
    now: nearestNow && Date.parse(nearestNow.time) - now.getTime() <= 3 * 3600_000
      ? period(nearestNow)
      : null,
    tomorrow: midday && Math.abs(stockholmHour(midday.time) - 12) <= 2
      ? period(midday)
      : null,
  };
}

// Cache the source series, not the selected periods: tomorrow changes at local midnight.
export async function getWeather(
  now = new Date(),
  fetcher: typeof fetch = fetch,
  cache: Cache | undefined = (globalThis.caches as CacheStorage & { default?: Cache })?.default,
  cacheKey = SMHI_POINT_URL,
): Promise<Weather> {
  const key = new Request(cacheKey);
  let response: Response | undefined;
  try {
    response = await cache?.match(key);
  } catch {
    // A transient edge-cache failure must not hide an available forecast.
  }
  if (!response) {
    const upstream = await fetcher(SMHI_POINT_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) throw new Error(`SMHI svarade ${upstream.status}.`);
    const data = await upstream.json();
    selectWeather(data, now); // Never cache malformed responses.
    response = new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
    });
    try {
      await cache?.put(key, response.clone());
    } catch {
      // The fresh forecast can still be returned if the edge cache is unavailable.
    }
  }
  return selectWeather(await response.json(), now);
}
