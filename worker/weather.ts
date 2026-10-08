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

// Only this public SMHI subrequest is cacheable. The authenticated station API
// response remains no-store, and the local-day selection runs on every request.
export function fetchSmhiForecast(fetcher: typeof fetch = fetch): Promise<Response> {
  return fetcher(SMHI_POINT_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(8000),
    cf: {
      // Scope the override to this one GET; never cache redirects or errors.
      cacheEverything: true,
      cacheTtlByStatus: { "200": CACHE_SECONDS, "201-599": -1 },
    },
  });
}

export async function getWeather(
  now = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<Weather> {
  const upstream = await fetchSmhiForecast(fetcher);
  if (!upstream.ok) throw new Error(`SMHI svarade ${upstream.status}.`);
  return selectWeather(await upstream.json(), now);
}
