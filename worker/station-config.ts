import type { Env } from "./index";

// Every station uses its own D1 binding. A legacy fallback preserves existing
// local tests, while deployments must configure STATION_ID explicitly.
export const stationId = (env: Env): string => {
  const id = env.STATION_ID || "tingsryd";
  if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id))
    throw new Error("Ogiltigt stations-ID i Cloudflare-konfigurationen.");
  return id;
};
