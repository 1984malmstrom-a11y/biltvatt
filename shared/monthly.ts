export const MONTHLY_CATEGORIES = [
  { key: "customers_per_day", label: "Kunder/dag", unit: "antal", fields: ["current", "previous", "percent"] },
  { key: "average_purchase", label: "Snittköp (TB)", unit: "kr", fields: ["current", "previous", "percent"] },
  { key: "fuel_per_day", label: "Drivmedel/dag", unit: "liter", fields: ["current", "previous", "percent"] },
  { key: "car_wash_average", label: "Biltvättssnitt", unit: "kr", fields: ["current", "previous", "percent"] },
  { key: "sales", label: "Försäljning", unit: "%", fields: ["percent"] },
  { key: "economic_result", label: "Ekonomiskt resultat", unit: "kr", fields: ["value"] },
] as const;

export type Comparison = { current: number | null; previous: number | null; percent: number | null };
export type FixedMonthlyMetrics = {
  kind: "fixed-v25";
  customers_per_day: Comparison;
  average_purchase: Comparison;
  fuel_per_day: Comparison;
  car_wash_average: Comparison;
  sales: { percent: number | null };
  economic_result: { value: number | null };
};

export const emptyMonthlyMetrics = (): FixedMonthlyMetrics => ({
  kind: "fixed-v25",
  customers_per_day: { current: null, previous: null, percent: null },
  average_purchase: { current: null, previous: null, percent: null },
  fuel_per_day: { current: null, previous: null, percent: null },
  car_wash_average: { current: null, previous: null, percent: null },
  sales: { percent: null },
  economic_result: { value: null },
});

export function isFixedMonthlyMetrics(value: unknown): value is FixedMonthlyMetrics {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join() !== ["kind", ...MONTHLY_CATEGORIES.map((item) => item.key)].sort().join() || row.kind !== "fixed-v25") return false;
  return MONTHLY_CATEGORIES.every(({ key, fields }) => {
    const metric = row[key];
    if (!metric || typeof metric !== "object" || Array.isArray(metric)) return false;
    const data = metric as Record<string, unknown>;
    return Object.keys(data).sort().join() === [...fields].sort().join() &&
      fields.every((field) => data[field] === null || (typeof data[field] === "number" && Number.isFinite(data[field])));
  });
}

export function parseSwedishNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/[\u00a0\u202f\s]/g, "");
  if (!/^[+-]?(?:\d+)(?:[,.]\d+)?$/.test(compact)) return NaN;
  return Number(compact.replace(",", "."));
}

export function inputNumber(value: number | null): string {
  return value === null ? "" : String(value).replace(".", ",");
}

export function formatMonthlyNumber(value: number | null, unit: "antal" | "liter" | "kr" | "%", signed = false): string {
  if (value === null) return "Saknas";
  const digits = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 10 }).format(Math.abs(value));
  const prefix = value < 0 ? "−" : signed && value > 0 ? "+" : "";
  return `${prefix}${digits}${unit === "antal" ? "" : ` ${unit}`}`;
}

export const monthlyTone = (value: number | null) =>
  value === null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative";
