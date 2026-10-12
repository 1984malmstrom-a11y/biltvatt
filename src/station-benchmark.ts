// Per-station optional comparison. Do not reuse Tingsryd's historical
// 250 kr benchmark on a different station without explicit configuration.
export function stationBenchmark(): { amount: number; label: string } | null {
  const raw = import.meta.env.VITE_STATION_BENCHMARK_SEK?.trim();
  if (!raw) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return null;
  const label = import.meta.env.VITE_STATION_BENCHMARK_LABEL?.trim() || "stationens referenssnitt";
  return { amount, label };
}
