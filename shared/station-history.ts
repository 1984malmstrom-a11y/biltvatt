import { stockholmToday } from "./handbook";

export type TaskHistoryAction = "created" | "completed" | "reopened" | "edited" | "deleted";
export type WasteHistoryAction = "created" | "renamed" | "date_changed" | "resolved" | "reopened" | "deleted";
export type TaskHistoryEvent = { id: number; task_date: string; action: TaskHistoryAction; occurred_at: string; label: string | null };
export type WasteHistoryEvent = { id: number; action: WasteHistoryAction; occurred_at: string; label: string | null; old_expires_on: string | null; new_expires_on: string | null };
export type HistoryPage<T> = { events: T[]; next_cursor: number | null };

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;
export function publicationIsNew(publishedAt: string | null, now = new Date()) {
  if (!publishedAt) return false;
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return false;
  const age = dayNumber(stockholmToday(now)) - dayNumber(stockholmToday(date));
  return age >= 0 && age < 7;
}

// History stores IDs, actions and dates only. Labels are fetched from current
// rows and withheld when they might contain credentials or long instructions.
export function safeHistoryLabel(value: string | null): string | null {
  if (!value || value.length > 100 || /[\r\n]/.test(value) ||
      /\b(?:pin|password|passcode|token|secret|session|api.?key|login)\b|lösenord|åtkomstkod|inloggningskod|behörighetskod|\bkod\b|\b\d{4,}\b/i.test(value)) return null;
  return value;
}

export const historyTime = (value: string) => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date(value));
export const historyDay = (value: string) => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm", day: "numeric", month: "long", year: "numeric",
}).format(new Date(value));
export const historyShortDate = (value: string) => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm", day: "2-digit", month: "2-digit",
}).format(new Date(`${value}T12:00:00Z`));

export function taskHistoryDescription(event: TaskHistoryEvent) {
  const label = event.label ?? "Uppgift";
  switch (event.action) {
    case "created": return `${label} lades till`;
    case "completed": return `${label} markerades som klar`;
    case "reopened": return `Avbockning ångrades för ${label.toLowerCase()}`;
    case "edited": return `Texten ändrades för ${label.toLowerCase()}`;
    case "deleted": return `${label} togs bort`;
  }
}
export function wasteHistoryDescription(event: WasteHistoryEvent) {
  const label = event.label ?? "Produkt";
  switch (event.action) {
    case "created": return `${label} registrerades${event.new_expires_on ? ` med datum ${historyShortDate(event.new_expires_on)}` : ""}`;
    case "renamed": return `Produktnamnet ändrades till ${label}`;
    case "date_changed": return `Utgångsdatum för ${label} ändrades från ${event.old_expires_on ? historyShortDate(event.old_expires_on) : "–"} till ${event.new_expires_on ? historyShortDate(event.new_expires_on) : "–"}`;
    case "resolved": return `${label} markerades som åtgärdad`;
    case "reopened": return `Åtgärdsmarkering ångrades för ${label.toLowerCase()}`;
    case "deleted": return "Felregistrerad produkt togs bort";
  }
}
