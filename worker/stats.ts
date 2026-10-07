import type { Stats, PersonStats, Sale } from "../src/types";
export interface StatsRow extends Sale {
  staff_name: string;
  staff_color: string;
  program_name: string;
}

export function summarize(rows: StatsRow[]): Omit<Stats, "goals" | "range"> {
  const valid = rows.filter((row) => !row.voided_at);
  const count = valid.length;
  const revenue = valid.reduce((sum, row) => sum + row.price_sek, 0);
  const people = new Map<string, PersonStats & { premium: number }>();
  const programs = new Map<
    string,
    { id: string; name: string; count: number; revenue: number }
  >();
  for (const row of valid) {
    const person = people.get(row.staff_id) ?? {
      id: row.staff_id,
      name: row.staff_name,
      color: row.staff_color,
      count: 0,
      revenue: 0,
      average: 0,
      premiumShare: 0,
      premium: 0,
    };
    person.count++;
    person.revenue += row.price_sek;
    person.premium += Number(row.wash_program_id === "preemium");
    people.set(row.staff_id, person);
    const program = programs.get(row.wash_program_id) ?? {
      id: row.wash_program_id,
      name: row.program_name,
      count: 0,
      revenue: 0,
    };
    program.count++;
    program.revenue += row.price_sek;
    programs.set(row.wash_program_id, program);
  }
  const staff = [...people.values()].map(({ premium, ...p }) => ({
    ...p,
    average: p.revenue / p.count,
    premiumShare: (100 * premium) / p.count,
  }));
  const rank = (
    field: "count" | "revenue" | "average" | "premiumShare",
    minimum = 0,
  ) =>
    staff
      .filter((p) => p.count >= minimum)
      .sort(
        (a, b) =>
          b[field] - a[field] ||
          b.count - a.count ||
          a.name.localeCompare(b.name, "sv"),
      );
  return {
    count,
    revenue,
    average: count ? revenue / count : 0,
    premiumShare: count
      ? (100 * valid.filter((r) => r.wash_program_id === "preemium").length) /
        count
      : 0,
    programs: [...programs.values()].sort((a, b) => b.count - a.count),
    staff,
    leaders: {
      count: rank("count"),
      revenue: rank("revenue"),
      average: rank("average", 3),
      premiumShare: rank("premiumShare", 3),
    },
  };
}

export function stockholmDay(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function midnightUTC(day: string): string {
  const base = Date.parse(`${day}T00:00:00Z`);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Stockholm",
    hour: "2-digit",
    hourCycle: "h23",
  });
  // Stockholm is UTC+1/+2. Probe the instant before local midnight, also across DST transitions.
  const offset =
    (Number(formatter.format(new Date(base - 2 * 3600000))) + 2) % 24;
  return new Date(base - offset * 3600000).toISOString();
}
export function dateRange(url: URL, now = new Date()) {
  const today = stockholmDay(now);
  const period = url.searchParams.get("period") ?? "today";
  let start = today,
    end = today;
  if (period === "week") {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    start = addDays(today, -((weekday + 6) % 7));
    end = addDays(start, 6);
  } else if (period === "month") {
    start = `${today.slice(0, 7)}-01`;
    const date = new Date(`${start}T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    end = addDays(date.toISOString().slice(0, 10), -1);
  } else if (period === "custom") {
    start = url.searchParams.get("start") ?? "";
    end = url.searchParams.get("end") ?? "";
  } else if (period !== "today") throw new Error("Ogiltig period.");
  const valid = (d: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    Number.isFinite(Date.parse(d)) &&
    new Date(d).toISOString().slice(0, 10) === d;
  if (
    !valid(start) ||
    !valid(end) ||
    start > end ||
    Date.parse(end) - Date.parse(start) > 366 * 86400000
  )
    throw new Error("Välj en giltig period på högst 367 dagar.");
  return {
    start,
    end,
    from: midnightUTC(start),
    to: midnightUTC(addDays(end, 1)),
  };
}
