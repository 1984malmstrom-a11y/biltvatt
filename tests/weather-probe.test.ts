import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { probeSmhi } from "../scripts/weather-probe/worker";

const forecast = { timeSeries: [
  { time: "2026-10-08T10:00:00Z", data: { air_temperature: 12, symbol_code: 3 } },
  { time: "2026-10-09T10:00:00Z", data: { air_temperature: 9, symbol_code: 5 } },
] };
const incoming = () => new Request("https://probe.test/probe", { headers: {
  Cookie: "private=session", Authorization: "Bearer private",
  "cf-workers-preview-token": "private-preview-token",
} });

describe("isolerat SMHI-prov", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T10:00:00Z")); });
  afterEach(() => vi.useRealTimers());

  it("avgränsar ett preview-fel och skickar inga inkommande hemligheter till SMHI", async () => {
    const seen: Request[] = [];
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      if (typeof input === "string" && init?.cache === "no-store")
        return new Response("blocked", { status: 403 });
      if (typeof input === "string") throw new TypeError("private diagnostic text");
      seen.push(input as Request);
      return new Response(JSON.stringify(forecast), { status: 200 });
    }) as typeof fetch;
    const response = await probeSmhi(incoming(), fetcher);
    const data = await response.json() as { attempts: { mode: string; errorType?: string; httpStatus?: number }[]; [key: string]: unknown };
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(data).toMatchObject({ ok: true, stage: "complete", fetchMode: "preview-header-stripped" });
    expect(data.attempts.map((a: { mode: string; errorType?: string; httpStatus?: number }) =>
      [a.mode, a.errorType ?? a.httpStatus])).toEqual([
      ["app-fetch", "TypeError"], ["manual-no-cache", 403], ["preview-header-stripped", 200],
    ]);
    expect(seen).toHaveLength(1);
    expect([...seen[0].headers]).toEqual([["accept", "application/json"]]);
    expect(JSON.stringify(data)).not.toContain("private");
  });

  it("rapporterar redirectens status och endast målvärdens namn", async () => {
    const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.redirect === "manual") return new Response(null, {
        status: 302, headers: { Location: "https://redirect.example/secret-path?token=private" },
      });
      throw new TypeError("redirect blocked");
    }) as typeof fetch;
    const response = await probeSmhi(incoming(), fetcher);
    const data = await response.json() as { attempts: { mode: string; httpStatus?: number; redirectHost?: string | null }[]; [key: string]: unknown };
    expect(response.status).toBe(503);
    expect(data).toMatchObject({ ok: false, stage: "fetch" });
    expect(data.attempts[1]).toMatchObject({ mode: "manual-no-cache", httpStatus: 302, redirectHost: "redirect.example" });
    expect(JSON.stringify(data)).not.toContain("private");
    expect(JSON.stringify(data)).not.toContain("secret-path");
  });

  it("skiljer HTTP-fel, trasig JSON och felaktig SNOW1gv1-modell", async () => {
    const http = await probeSmhi(incoming(), (async () => new Response("blocked", { status: 403 })) as typeof fetch);
    const httpData = await http.json() as { stage: string; attempts: { httpStatus?: number }[] };
    expect(httpData.stage).toBe("http");
    expect(httpData.attempts.every((a) => a.httpStatus === 403)).toBe(true);
    const invalidJson = await probeSmhi(incoming(), (async () => new Response("<html>", {
      headers: { "Content-Type": "text/html" },
    })) as typeof fetch);
    const jsonData = await invalidJson.json() as { stage: string; errorType: string; attempts: { httpStatus?: number; contentType?: string | null }[] };
    expect(jsonData).toMatchObject({ stage: "json", errorType: "SyntaxError" });
    expect(jsonData.attempts[0]).toMatchObject({ httpStatus: 200, contentType: "text/html" });
    const schema = await probeSmhi(incoming(), (async () => Response.json({ timeSeries: "bad" })) as typeof fetch);
    expect(await schema.json()).toMatchObject({ stage: "schema", shape: { timeSeriesArray: false, steps: 0 } });
  });

  it("visar urvalsfel separat när båda prognostiderna saknas", async () => {
    const response = await probeSmhi(incoming(), (async () => Response.json({ timeSeries: [] })) as typeof fetch);
    expect(await response.json()).toMatchObject({ ok: false, stage: "selection", shape: { timeSeriesArray: true, steps: 0 } });
  });
});
