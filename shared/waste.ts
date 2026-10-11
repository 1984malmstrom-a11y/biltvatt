import { stockholmToday } from "./handbook";

export type WasteItem = {
  id: string; product_name: string; expires_on: string; resolved: number;
  revision: number; created_at: string; updated_at: string;
};
export type WasteStatus = "expired" | "today" | "tomorrow" | "later";
export function wasteStatus(expires: string, today = stockholmToday()): WasteStatus {
  if (expires < today) return "expired";
  if (expires === today) return "today";
  const next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return expires === next.toISOString().slice(0, 10) ? "tomorrow" : "later";
}
export const wasteStatusLabel: Record<WasteStatus, string> = {
  expired: "Utgånget", today: "Går ut idag", tomorrow: "Går ut imorgon", later: "",
};
export function sortWaste(items: WasteItem[]) {
  return [...items].sort((a, b) => a.expires_on.localeCompare(b.expires_on) ||
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
