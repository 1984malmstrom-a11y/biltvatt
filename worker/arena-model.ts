import { checkFields, fail, integer, text } from "./http";
import { addDays, dateRange, midnightUTC } from "./stats";
import { parseArenaMoney } from "../shared/arena-money";

export const arenaUUID = (value: unknown) => {
  const id = text(value, "Begärande-ID", 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) fail(400, "Begärande-ID måste vara ett UUID.");
  return id;
};
export const arenaPoints = (value: unknown, positive = false): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < (positive ? 0.01 : 0) || value > 10000 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7)
    fail(400, "Poäng ska vara 0–10 000 med högst två decimaler.");
  return value as number;
};
const optionalText = (value: unknown, label: string, max = 80) => value === "" ? "" : text(value, label, max);
const active = (value: unknown) => {
  if (value !== 0 && value !== 1) fail(400, "Aktiv ska vara 0 eller 1.");
  return value as number;
};
export function arenaTB(value:unknown) {
  const ore=parseArenaMoney(value);
  if(ore===null) return fail(400,"TB ska vara 0–1 000 000 kr med högst två decimaler.");
  return ore;
}
export function activityInput(data: Record<string, unknown>) {
  checkFields(data, ["name", "offer_text", "price_text", "points", "image_key", "category", "sort_order", "active", "tb_kronor", "tb_ore", "display_mode"]);
  if(data.tb_kronor!==undefined && data.tb_ore!==undefined) fail(400,"Ange TB i kronor eller öre, inte båda.");
  if(data.display_mode!==undefined && !["points","tb"].includes(String(data.display_mode))) fail(400,"Välj poäng eller TB som badge.");
  const tb=data.tb_kronor!==undefined ? arenaTB(data.tb_kronor) : data.tb_ore!==undefined ? integer(data.tb_ore,"TB i öre",100000000) : undefined;
  return {
    name: text(data.name, "Namn"), offer_text: optionalText(data.offer_text, "Erbjudande"),
    price_text: optionalText(data.price_text, "Pristext"), points: arenaPoints(data.points),
    image_key: data.image_key === null ? null : arenaUUID(data.image_key),
    category: optionalText(data.category, "Kategori", 40), sort_order: integer(data.sort_order, "Sortering", 10000), active: active(data.active),
    ...(tb!==undefined ? {tb_ore:tb} : {}),...(data.display_mode!==undefined ? {display_mode:String(data.display_mode)} : {}),
  };
}
export function arenaRange(url: URL, now = new Date()) {
  for (const field of url.searchParams.keys()) if (!["period", "start", "end", "activity_id", "category", "metric"].includes(field)) fail(400, "Okänt statistikfilter.");
  if(url.searchParams.has("metric") && !["points","tb","count"].includes(url.searchParams.get("metric")!)) fail(400,"Välj poäng, TB eller antal.");
  try { return dateRange(url, now); } catch (e) { return fail(400, (e as Error).message); }
}
export function goalDates(start: unknown, end: unknown) {
  const url = new URL("https://arena.test/?period=custom");
  url.searchParams.set("start", text(start, "Startdatum", 10));
  url.searchParams.set("end", text(end, "Slutdatum", 10));
  return arenaRange(url);
}
export function campaignInput(data: Record<string, unknown>) {
  checkFields(data, ["name", "activity_id", "start_date", "end_date", "target_count", "target_points", "active"]);
  const range = goalDates(data.start_date, data.end_date);
  const count = data.target_count === null ? null : integer(data.target_count, "Antalsmål");
  const points = data.target_points === null ? null : arenaPoints(data.target_points, true);
  if (count === 0 || (count === null && points === null)) fail(400, "Ange ett positivt antalsmål och/eller poängmål.");
  return { name: text(data.name, "Kampanjnamn"), activity_id: text(data.activity_id, "Aktivitet", 80), start_at: range.from, end_at: range.to, target_count: count, target_points: points, active: active(data.active) };
}
export function goalInput(data: Record<string, unknown>) {
  checkFields(data, ["seller_id", "period_type", "start_date", "end_date", "target_points"]);
  if (!["week", "month", "custom"].includes(String(data.period_type))) fail(400, "Välj vecka, månad eller egen period.");
  const range = goalDates(data.start_date, data.end_date);
  if (data.period_type === "week" && (new Date(`${range.start}T12:00:00Z`).getUTCDay() !== 1 || range.end !== addDays(range.start, 6))) fail(400, "Veckomål ska gälla måndag–söndag.");
  if (data.period_type === "month") {
    const next = new Date(`${range.start}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1, 1);
    if (!range.start.endsWith("-01") || range.end !== addDays(next.toISOString().slice(0, 10), -1)) fail(400, "Månadsmål ska gälla en hel kalendermånad.");
  }
  return { seller_id: data.seller_id === null ? null : text(data.seller_id, "Säljare", 120), period_type: String(data.period_type), start_date: range.start, end_date: range.end, target_points: arenaPoints(data.target_points, true) };
}
export const goalBounds = (start: string, end: string) => [midnightUTC(start), midnightUTC(addDays(end, 1))];

// Accept only raster images whose actual header and dimensions match the declared type.
export function arenaImage(bytes: Uint8Array, mime: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (at: number, length: number) => String.fromCharCode(...bytes.slice(at, at + length));
  let width = 0, height = 0;
  if (mime === "image/png" && bytes.length >= 24 && bytes.slice(0, 8).join() === "137,80,78,71,13,10,26,10" && ascii(12, 4) === "IHDR") {
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (mime === "image/webp" && bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const tag = ascii(12, 4);
    if (tag === "VP8 " && bytes.length >= 30 && ascii(23, 3) === "\x9d\x01\x2a") { width = view.getUint16(26, true) & 16383; height = view.getUint16(28, true) & 16383; }
    if (tag === "VP8L" && bytes[20] === 47) { const bits = view.getUint32(21, true); width = (bits & 16383) + 1; height = ((bits >>> 14) & 16383) + 1; }
    if (tag === "VP8X") { width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16); height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16); }
  }
  if (!width || !height || width > 640 || height > 640 || bytes.length > 250000) fail(400, "Bilden ska vara PNG/WebP, högst 640 × 640 px och 250 kB.");
  return { width, height };
}
