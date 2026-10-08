import { fetchSmhiForecast, selectWeather } from "../../worker/weather";

// Standalone public-data probe. This Worker has no D1, assets or secret bindings.
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET" || new URL(request.url).pathname !== "/probe")
      return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    try {
      const upstream = await fetchSmhiForecast();
      if (!upstream.ok)
        return Response.json({ ok: false, smhiStatus: upstream.status }, {
          status: 503, headers: { "Cache-Control": "no-store" },
        });
      const data = await upstream.json();
      const forecast = selectWeather(data);
      return Response.json({
        ok: forecast.now !== null && forecast.tomorrow !== null,
        source: forecast.source,
        kind: forecast.kind,
        now: forecast.now,
        tomorrow: forecast.tomorrow,
        upstreamCacheStatus: upstream.headers.get("CF-Cache-Status"),
        upstreamAgeSeconds: upstream.headers.get("Age"),
      }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return Response.json({ ok: false, error: "SMHI-prognosen kunde inte hämtas eller läsas." }, {
        status: 503, headers: { "Cache-Control": "no-store" },
      });
    }
  },
};
