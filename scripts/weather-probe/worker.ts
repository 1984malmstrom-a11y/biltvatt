import { fetchSmhiForecast, selectWeather, SMHI_POINT_URL } from "../../worker/weather";

// Standalone public-data probe. It has no D1, assets or secret bindings.
type Attempt = {
  mode: string;
  elapsedMs: number;
  httpStatus?: number;
  errorType?: string;
  contentType?: string | null;
  cacheStatus?: string | null;
  redirectHost?: string | null;
};

const reply = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "no-store" },
});

function errorType(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  return ["AbortError", "TimeoutError", "TypeError", "SyntaxError", "RangeError"].includes(name)
    ? name : "UnknownError";
}

function redirectHost(response: Response): string | null {
  const location = response.headers.get("Location");
  if (!location || response.status < 300 || response.status > 399) return null;
  try { return new URL(location, SMHI_POINT_URL).hostname.slice(0, 120); }
  catch { return "invalid-location"; }
}

async function attempt(mode: string, action: () => Promise<Response>) {
  const started = Date.now();
  try {
    const response = await action();
    const report: Attempt = {
      mode, elapsedMs: Date.now() - started, httpStatus: response.status,
      contentType: response.headers.get("Content-Type")?.split(";")[0].slice(0, 60) ?? null,
      cacheStatus: response.headers.get("CF-Cache-Status"),
      redirectHost: redirectHost(response),
    };
    return { report, response };
  } catch (error) {
    return { report: { mode, elapsedMs: Date.now() - started, errorType: errorType(error) } as Attempt };
  }
}

function shape(data: unknown) {
  const value = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const series = Array.isArray(value.timeSeries) ? value.timeSeries : null;
  const first = series?.[0] && typeof series[0] === "object"
    ? series[0] as Record<string, unknown> : {};
  const fields = first.data && typeof first.data === "object"
    ? first.data as Record<string, unknown> : {};
  return {
    timeSeriesArray: series !== null,
    steps: series?.length ?? 0,
    timeType: typeof first.time,
    dataType: typeof first.data,
    temperatureType: typeof fields.air_temperature,
    symbolType: typeof fields.symbol_code,
  };
}

// Cloudflare documents that remote previews can forward a preview token to
// subrequests. Clone the incoming request as documented, then remove *all*
// incoming headers so cookies, authorization and the preview token cannot reach SMHI.
function withoutPreviewHeaders(incoming: Request, fetcher: typeof fetch): typeof fetch {
  return ((url: string | URL | Request, init?: RequestInit) => {
    const clean = new Request(url, incoming);
    for (const name of [...clean.headers.keys()]) clean.headers.delete(name);
    clean.headers.set("Accept", "application/json");
    return fetcher(clean, { ...init, headers: { Accept: "application/json" } });
  }) as typeof fetch;
}

function uncachedManual(fetcher: typeof fetch): Promise<Response> {
  return fetcher(SMHI_POINT_URL, {
    method: "GET", headers: { Accept: "application/json" },
    redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(8000),
  });
}

export async function probeSmhi(request: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  if (request.method !== "GET" || new URL(request.url).pathname !== "/probe")
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const attempts: Attempt[] = [];
  const normal = await attempt("app-fetch", () => fetchSmhiForecast(fetcher));
  attempts.push(normal.report);
  let upstream = normal.response;
  let fetchMode = "app-fetch";

  if (!upstream?.ok) {
    const manual = await attempt("manual-no-cache", () => uncachedManual(fetcher));
    attempts.push(manual.report);
    const cleanFetcher = withoutPreviewHeaders(request, fetcher);
    const clean = await attempt("preview-header-stripped", () => fetchSmhiForecast(cleanFetcher));
    attempts.push(clean.report);
    if (clean.response?.ok) {
      upstream = clean.response;
      fetchMode = "preview-header-stripped";
    } else {
      const cleanManual = await attempt("stripped-manual-no-cache", () => uncachedManual(cleanFetcher));
      attempts.push(cleanManual.report);
      return reply({
        ok: false, stage: normal.response ? "http" : "fetch", attempts,
        previewTokenPresent: request.headers.has("cf-workers-preview-token"),
      }, 503);
    }
  }

  let data: unknown;
  try { data = await upstream.json(); }
  catch (error) {
    return reply({ ok: false, stage: "json", errorType: errorType(error), attempts }, 503);
  }
  const model = shape(data);
  let forecast: ReturnType<typeof selectWeather>;
  try { forecast = selectWeather(data); }
  catch (error) {
    return reply({ ok: false, stage: "schema", errorType: errorType(error), shape: model, attempts }, 503);
  }
  return reply({
    ok: forecast.now !== null && forecast.tomorrow !== null,
    stage: forecast.now !== null && forecast.tomorrow !== null ? "complete" : "selection",
    fetchMode, attempts, shape: model,
    source: forecast.source, kind: forecast.kind,
    now: forecast.now, tomorrow: forecast.tomorrow,
  });
}

export default { fetch: probeSmhi };
