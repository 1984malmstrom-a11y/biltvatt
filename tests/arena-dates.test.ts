import { describe, expect, it } from "vitest";
import { arenaDay, arenaDateSpan, arenaPeriodDates, arenaPeriodLabel, arenaPeriodStatus } from "../src/arena-dates";

describe("Arena: mänskliga perioder i Stockholms tidszon", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  it("visar dagens, veckans, månadens och en vald periods datum", () => {
    expect(arenaPeriodLabel("2026-10-13", "2026-10-13", undefined, now)).toBe("Idag");
    expect(arenaPeriodLabel("2026-10-12", "2026-10-18", "week", now)).toBe("Den här veckan · 12–18 okt");
    expect(arenaPeriodLabel("2026-10-01", "2026-10-31", "month", now)).toBe("Den här månaden · 1–31 okt");
    expect(arenaPeriodLabel("2026-10-12", "2026-10-18", "custom", now)).toBe("Vald period · 12–18 okt");
    expect(arenaDateSpan("2026-10-31", "2026-11-02", now)).toBe("31 okt–2 nov");
    expect(arenaDateSpan("2026-12-28", "2027-01-03", now)).toBe("28 dec 2026–3 jan 2027");
  });
  it("förifyller kalenderperioder över årsskifte, skottår och lokal midnatt", () => {
    expect(arenaPeriodDates("week", new Date("2027-01-03T12:00:00Z"))).toEqual({ start_date:"2026-12-28", end_date:"2027-01-03" });
    expect(arenaPeriodDates("month", new Date("2028-02-15T12:00:00Z"))).toEqual({ start_date:"2028-02-01", end_date:"2028-02-29" });
    const midnight = new Date("2026-10-31T23:30:00Z");
    expect(arenaDay(midnight)).toBe("2026-11-01");
    expect(arenaPeriodDates("month", midnight)).toEqual({ start_date:"2026-11-01", end_date:"2026-11-30" });
  });
  it("skiljer aktivt, kommande och avslutat mål utan att ändra målet", () => {
    expect(arenaPeriodStatus("2026-10-13", "2026-10-13", now)).toBe("Aktivt");
    expect(arenaPeriodStatus("2026-10-14", "2026-10-18", now)).toBe("Kommande");
    expect(arenaPeriodStatus("2026-10-01", "2026-10-12", now)).toBe("Avslutat");
  });
});
