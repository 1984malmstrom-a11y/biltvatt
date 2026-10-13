export type ArenaPeriod = "week" | "month" | "custom";

export const arenaDay = (value = new Date()) => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit",
}).format(value);
const date = (value: string) => new Date(`${value}T12:00:00Z`);
const offset = (value: string, days: number) => {
  const d = date(value); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
};

export function arenaPeriodDates(period: "week" | "month", now = new Date()) {
  const today = arenaDay(now);
  if (period === "week") {
    const start_date = offset(today, -((date(today).getUTCDay() + 6) % 7));
    return { start_date, end_date: offset(start_date, 6) };
  }
  const start_date = `${today.slice(0, 7)}-01`, next = date(start_date);
  next.setUTCMonth(next.getUTCMonth() + 1, 1);
  return { start_date, end_date: offset(next.toISOString().slice(0, 10), -1) };
}

export function arenaDateSpan(start: string, end: string, now = new Date()) {
  const short = (value: string, year = false) => new Intl.DateTimeFormat("sv-SE", {
    timeZone: "UTC", day: "numeric", month: "short", ...(year ? { year: "numeric" as const } : {}),
  }).format(date(value)).replace(/\./g, "");
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const showYear = !sameYear || start.slice(0, 4) !== arenaDay(now).slice(0, 4);
  if (start === end) return short(start, showYear);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${Number(start.slice(8))}–${short(end, showYear)}`;
  return `${short(start, !sameYear)}–${short(end, showYear)}`;
}

export function arenaPeriodLabel(start: string, end: string, period?: ArenaPeriod, now = new Date()) {
  if (start === end && start === arenaDay(now)) return "Idag";
  const span = arenaDateSpan(start, end, now);
  for (const type of ["week", "month"] as const) {
    const current = arenaPeriodDates(type, now);
    if ((!period || period === type) && start === current.start_date && end === current.end_date)
      return `${type === "week" ? "Den här veckan" : "Den här månaden"} · ${span}`;
  }
  return `${period === "week" ? "Vecka" : period === "month" ? "Månad" : "Vald period"} · ${span}`;
}

export function arenaPeriodStatus(start: string, end: string, now = new Date()) {
  const today = arenaDay(now);
  return today < start ? "Kommande" : today > end ? "Avslutat" : "Aktivt";
}
