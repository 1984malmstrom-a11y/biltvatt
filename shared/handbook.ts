export const HANDBOOK_KINDS = ["bakeoff", "opening", "closing", "freshfood"] as const;
export type HandbookKind = typeof HANDBOOK_KINDS[number];
export const HANDBOOK_LABELS: Record<HandbookKind, string> = {
  bakeoff: "Bakeoff – Upplockningsschema",
  opening: "Öppningsrutiner",
  closing: "Stängningsrutiner",
  freshfood: "FreshFood",
};
export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Weekday = typeof WEEKDAYS[number];
export const WEEKDAY_LABELS = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"] as const;
export type HandbookBlock =
  | { type: "heading"; text: string; level: number }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; rows: string[][]; schedule?: boolean }
  | { type: "check"; id: string; text: string };
export type HandbookContent = {
  blocks: HandbookBlock[];
  days: Record<Weekday, { product: string; quantity: string }[]>;
  weekend?: Record<"Huvudvagn" | "Reservvagn" | "Frysen", { product: string; quantity: string }[]>;
};
export const BAKEOFF_GROUPS = ["Huvudvagn", "Reservvagn", "Frysen"] as const;
export const emptyWeekend = () => ({ Huvudvagn: [], Reservvagn: [], Frysen: [] }) as NonNullable<HandbookContent["weekend"]>;
export const emptyHandbookContent = (): HandbookContent => ({
  blocks: [],
  days: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] },
});
export const isHandbookKind = (kind: string): kind is HandbookKind =>
  HANDBOOK_KINDS.includes(kind as HandbookKind);
export const stockholmToday = (date = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
export const stockholmWeekday = (date = new Date()): Weekday => {
  const day = stockholmToday(date);
  const index = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return WEEKDAYS[index];
};
const text = (value: unknown, max: number) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
export function isHandbookContent(value: unknown, kind: HandbookKind): value is HandbookContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (!Object.keys(data).every((key) => ["blocks", "days", "weekend"].includes(key)) || !Array.isArray(data.blocks) || data.blocks.length > 250) return false;
  const ids = new Set<string>();
  for (const block of data.blocks) {
    if (!block || typeof block !== "object" || Array.isArray(block)) return false;
    const row = block as Record<string, unknown>;
    if (row.type === "heading") {
      if (!text(row.text, 180) || !Number.isInteger(row.level) || Number(row.level) < 1 || Number(row.level) > 4) return false;
    } else if (row.type === "paragraph") {
      if (!text(row.text, 3000)) return false;
    } else if (row.type === "list") {
      if (!Array.isArray(row.items) || row.items.length < 1 || row.items.length > 100 || !row.items.every((item) => text(item, 500))) return false;
    } else if (row.type === "table") {
      if (!Array.isArray(row.rows) || row.rows.length < 1 || row.rows.length > 100 ||
        !row.rows.every((cells) => Array.isArray(cells) && cells.length >= 1 && cells.length <= 12 && cells.every((cell) => typeof cell === "string" && cell.length <= 300))) return false;
      if (row.schedule !== undefined && typeof row.schedule !== "boolean") return false;
    } else if (row.type === "check" && (kind === "opening" || kind === "closing")) {
      if (!uuid(row.id) || !text(row.text, 500) || ids.has(String(row.id))) return false;
      ids.add(String(row.id));
    } else return false;
  }
  if (!data.days || typeof data.days !== "object" || Array.isArray(data.days)) return false;
  const days = data.days as Record<string, unknown>;
  if (Object.keys(days).sort().join() !== [...WEEKDAYS].sort().join()) return false;
  if (kind !== "bakeoff" && WEEKDAYS.some((day) => Array.isArray(days[day]) && (days[day] as unknown[]).length > 0)) return false;
  if (data.weekend !== undefined) {
    if (kind !== "bakeoff" || !data.weekend || typeof data.weekend !== "object" || Array.isArray(data.weekend)) return false;
    const weekend = data.weekend as Record<string, unknown>;
    if (Object.keys(weekend).sort().join() !== [...BAKEOFF_GROUPS].sort().join() ||
      !BAKEOFF_GROUPS.every((group) => Array.isArray(weekend[group]) && (weekend[group] as unknown[]).length <= 100 &&
      (weekend[group] as unknown[]).every((row) => !!row && typeof row === "object" && !Array.isArray(row) &&
      typeof (row as Record<string, unknown>).product === "string" && String((row as Record<string, unknown>).product).length <= 180 &&
      typeof (row as Record<string, unknown>).quantity === "string" && String((row as Record<string, unknown>).quantity).length <= 80))) return false;
  }
  return WEEKDAYS.every((day) => Array.isArray(days[day]) && (days[day] as unknown[]).length <= 100 &&
    (days[day] as unknown[]).every((row) => !!row && typeof row === "object" && !Array.isArray(row) &&
      text((row as Record<string, unknown>).product, 180) && text((row as Record<string, unknown>).quantity, 80) &&
      /^\d+(?:[,.]\d+)?(?:\s*[\p{L}]+)?$/u.test(String((row as Record<string, unknown>).quantity).trim())));
}
export function preserveUnchangedChecks(next: HandbookContent, previous: HandbookContent | null) {
  if (!previous) return next;
  const old = new Map(previous.blocks.filter((block): block is Extract<HandbookBlock, {type:"check"}> => block.type === "check").map((block) => [block.id, block.text]));
  return { ...next, blocks: next.blocks.map((block) => block.type === "check" && old.has(block.id) && old.get(block.id) !== block.text
    ? { ...block, id: crypto.randomUUID() } : block) };
}
