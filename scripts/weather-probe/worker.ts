import { fetchSmhiForecast, selectWeather, SMHI_POINT_URL } from "../../worker/weather";

// Standalone public-data probe. It has no D1, assets or secret bindings.
type ErrorCategory = "dns" | "tls" | "redirect" | "request-options" | "abort-signal" | "network" | "unknown";
type Attempt = {
  mode: string;
  elapsedMs: number;
  httpStatus?: number;
  errorType?: string;
  errorCategory?: ErrorCategory;
  errorDescription?: string;
  contentType?: string | null;
  cacheStatus?: string | null;
  redirectHost?: string | null;
  finalHost?: string | null;
  redirected?: boolean;
};

const reply = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "no-store" },
});

// Never return an exception message or cause: they may contain a URL or secret.
// These categories are hints from known terms, not proof of the underlying fault.
function safeError(error: unknown) {
  const name = error instanceof Error ? error.name : "UnknownError";
  const errorType = ["AbortError", "TimeoutError", "TypeError", "SyntaxError", "RangeError"].includes(name)
    ? name : "UnknownError";
  const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
  const detail = [error, cause]
    .filter((item): item is Error => item instanceof Error)
    .map((item) => `${item.message} ${(item as Error & { code?: unknown }).code ?? ""}`)
    .join(" ").toLowerCase();
  let errorCategory: ErrorCategory = "unknown";
  if (/\bdns\b|enotfound|eai_again|name resolution|resolve host|host not found/.test(detail))
    errorCategory = "dns";
  else if (/\btls\b|\bssl\b|certificate|handshake|cert_/.test(detail))
    errorCategory = "tls";
  else if (/redirect|location header/.test(detail))
    errorCategory = "redirect";
  else if (/requestinit|request init|invalid (?:option|property|init)|cache option|unsupported.*(?:cache|redirect|fetch option)/.test(detail))
    errorCategory = "request-options";
  else if (/abort|signal|timed? ?out|timeout/.test(detail))
    errorCategory = "abort-signal";
  else if (/network|connection|econn|fetch failed|failed to fetch|unable to fetch/.test(detail))
    errorCategory = "network";
  const descriptions: Record<ErrorCategory, string> = {
    dns: "Feltexten nämner DNS eller namnuppslagning.",
    tls: "Feltexten nämner TLS eller certifikat.",
    redirect: "Feltexten nämner omdirigering.",
    "request-options": "Feltexten nämner ogiltiga eller ostödda anropsinställningar.",
    "abort-signal": "Feltexten nämner signal, avbrott eller timeout.",
    network: "Feltexten nämner nätverk eller anslutning utan närmare orsak.",
    unknown: "Feltexten gav ingen säker klassificering.",
  };
  return { errorType, errorCategory, errorDescription: descriptions[errorCategory] };
}

function redirectHost(response: Response): string | null {
  const location = response.headers.get("Location");
  if (!location || response.status < 300 || response.status > 399) return null;
  try { return new URL(location, SMHI_POINT_URL).hostname.slice(0, 120); }
  catch { return "invalid-location"; }
}

function finalHost(response: Response): string | null {
  if (!response.url) return null;
  try { return new URL(response.url).hostname.slice(0, 120); }
  catch { return "invalid-response-url"; }
}

function safeContentType(response: Response): string | null {
  const value = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (!value) return null;
  return ["application/json", "text/html", "text/plain", "application/octet-stream"].includes(value)
    ? value : "other";
}

function safeCacheStatus(response: Response): string | null {
  const value = response.headers.get("CF-Cache-Status")?.toUpperCase();
  if (!value) return null;
  return ["HIT", "MISS", "BYPASS", "DYNAMIC", "EXPIRED", "STALE", "UPDATING", "REVALIDATED"].includes(value)
    ? value : "other";
}

async function attempt(mode: string, action: () => Promise<Response>) {
  const started = Date.now();
  try {
    const response = await action();
    const report: Attempt = {
      mode, elapsedMs: Date.now() - started, httpStatus: response.status,
      contentType: safeContentType(response),
      cacheStatus: safeCacheStatus(response),
      redirectHost: redirectHost(response),
      finalHost: finalHost(response),
      redirected: response.redirected,
    };
    return { report, response };
  } catch (error) {
    return { report: { mode, elapsedMs: Date.now() - started, ...safeError(error) } as Attempt };
  }
}

async function discard(response?: Response) {
  try { await response?.body?.cancel(); } catch { /* Ignore cleanup failures. */ }
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

export async function probeSmhi(request: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  if (request.method !== "GET" || new URL(request.url).pathname !== "/probe")
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const attempts: Attempt[] = [];
  const run = async (mode: string, action: () => Promise<Response>) => {
    const result = await attempt(mode, action);
    attempts.push(result.report);
    await discard(result.response);
    return result;
  };

  // Baselines contain no RequestInit, extra headers, cache configuration or signal.
  await run("example-basic", () => fetcher("https://example.com"));
  await run("smhi-basic", () => fetcher(SMHI_POINT_URL));
  await run("smhi-redirect-manual", () => fetcher(SMHI_POINT_URL, { redirect: "manual" }));
  await run("smhi-redirect-error", () => fetcher(SMHI_POINT_URL, { redirect: "error" }));

  let signal: AbortSignal | undefined;
  let signalCheck: { supported: boolean; initiallyAborted?: boolean; errorType?: string;
    errorCategory?: ErrorCategory; errorDescription?: string };
  try {
    signal = AbortSignal.timeout(8000);
    signalCheck = { supported: true, initiallyAborted: signal.aborted };
  } catch (error) {
    signalCheck = { supported: false, ...safeError(error) };
  }
  if (signal) await run("smhi-with-signal", () => fetcher(SMHI_POINT_URL, { signal }));

  await run("smhi-headers-only", () => fetcher(SMHI_POINT_URL, {
    method: "GET", headers: { Accept: "application/json" },
  }));

  // Same cache options as V2, isolated from its headers, redirect policy and signal.
  await run("smhi-cache-only", () => fetcher(SMHI_POINT_URL, {
    cf: { cacheEverything: true, cacheTtlByStatus: { "200": 1800, "201-599": -1 } },
  }));
  await run("smhi-combined-no-cache", () => fetcher(SMHI_POINT_URL, {
    method: "GET", headers: { Accept: "application/json" },
    redirect: "error", signal: AbortSignal.timeout(8000),
  }));
  const normal = await attempt("app-fetch", () => fetchSmhiForecast(fetcher));
  attempts.push(normal.report);
  const diagnostics = { attempts, signalCheck, previewTokenPresent: request.headers.has("cf-workers-preview-token") };
  if (!normal.response?.ok) {
    await discard(normal.response);
    return reply({ ok: false, stage: normal.response ? "http" : "fetch", ...diagnostics }, 503);
  }

  let data: unknown;
  try { data = await normal.response.json(); }
  catch (error) {
    return reply({ ok: false, stage: "json", ...safeError(error), ...diagnostics }, 503);
  }
  const model = shape(data);
  let forecast: ReturnType<typeof selectWeather>;
  try { forecast = selectWeather(data); }
  catch (error) {
    return reply({ ok: false, stage: "schema", ...safeError(error), shape: model, ...diagnostics }, 503);
  }
  const complete = forecast.now !== null && forecast.tomorrow !== null;
  return reply({
    ok: complete, stage: complete ? "complete" : "selection", ...diagnostics,
    shape: model, source: forecast.source, kind: forecast.kind,
    now: forecast.now, tomorrow: forecast.tomorrow,
  });
}

export default { fetch: probeSmhi };
