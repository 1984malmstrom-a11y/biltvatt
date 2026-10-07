export const HISTORICAL_AVERAGE_BENCHMARK_SEK = 250;
export const AVERAGE_LEAGUE_MINIMUM_SALES = 3;
export function benchmarkComparison(average: number, count: number) {
  if (!count || !Number.isFinite(average)) return null;
  const differenceSek = average - HISTORICAL_AVERAGE_BENCHMARK_SEK;
  const differencePercent =
    (differenceSek / HISTORICAL_AVERAGE_BENCHMARK_SEK) * 100;
  const sign = differenceSek > 0 ? "+" : differenceSek < 0 ? "−" : "±";
  const sek = new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: 0,
  }).format(Math.round(Math.abs(differenceSek)));
  const percent = new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(differencePercent));
  return {
    differenceSek,
    differencePercent,
    tone:
      differenceSek > 0
        ? "positive"
        : differenceSek < 0
          ? "negative"
          : "neutral",
    text: `${sign}${sek} kr · ${differenceSek === 0 ? "" : sign}${percent} %`,
  };
}
export function leaguePeriodLabel(period: string, start: string, end: string) {
  if (period === "today") return "Idag";
  if (period === "week") return "Vecka";
  if (period === "month") return "Månad";
  const format = (day: string) =>
    new Intl.DateTimeFormat("sv-SE", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(day + "T12:00:00Z"));
  return start === end ? format(start) : `${format(start)} – ${format(end)}`;
}
