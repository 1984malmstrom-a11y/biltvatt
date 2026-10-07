import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fixture } from "./fixture";
import {
  benchmarkComparison,
  HISTORICAL_AVERAGE_BENCHMARK_SEK,
  leaguePeriodLabel,
} from "../shared/business";
import { AverageLeague, BenchmarkDelta } from "../src/AverageLeague";
import { Dashboard } from "../src/components";
import { stockholmDay } from "../worker/stats";
import type { Stats } from "../src/types";
let f: ReturnType<typeof fixture>;
beforeEach(() => {
  f = fixture();
});
afterEach(async () => {
  await f.finish();
  f.db.close();
});
describe("Historiskt snittköp: jan–sep 2026 är alltid 250 kr", () => {
  it.each([
    [276, 26, 10.4, "+26 kr · +10,4 %"],
    [238, -12, -4.8, "−12 kr · −4,8 %"],
    [250, 0, 0, "±0 kr · 0,0 %"],
  ])("formler och svensk text för %s", (average, sek, percent, text) => {
    const result = benchmarkComparison(Number(average), 3)!;
    expect(result.differenceSek).toBe(sek);
    expect(result.differencePercent).toBeCloseTo(Number(percent));
    expect(result.text).toBe(text);
    const rendered = renderToStaticMarkup(
      createElement(BenchmarkDelta, {
        average: Number(average),
        count: 3,
        explanation: true,
      }),
    );
    expect(rendered).toContain(text);
    expect(rendered).toContain("mot jan–sep 2026 (250 kr)");
  });
  it("tom period har ingen missvisande minusjämförelse", () => {
    expect(benchmarkComparison(0, 0)).toBeNull();
    const rendered = renderToStaticMarkup(
      createElement(BenchmarkDelta, { average: 0, count: 0 }),
    );
    expect(rendered).toContain("Ingen jämförelse ännu");
    expect(rendered).not.toContain("−250");
    expect(rendered).not.toContain("100 %");
  });
  it("avrundar SEK och behåller en svensk decimal i procent", () => {
    expect(benchmarkComparison(276.4, 3)?.text).toBe("+26 kr · +10,6 %");
  });
  it.each(["today", "week", "month", "custom"])(
    "låst benchmark oberoende av %s",
    (period) => {
      leaguePeriodLabel(period, "2026-10-01", "2026-10-07");
      expect(HISTORICAL_AVERAGE_BENCHMARK_SEK).toBe(250);
      expect(benchmarkComparison(276, 4)?.differenceSek).toBe(26);
    },
  );
});
describe("Snittköpsligans kanoniska D1-statistik", () => {
  async function populate() {
    f.db
      .prepare("UPDATE wash_programs SET price_sek=276 WHERE id='preemium'")
      .run();
    f.db.prepare("UPDATE wash_programs SET price_sek=238 WHERE id='fin'").run();
    f.db
      .prepare("UPDATE wash_programs SET price_sek=250 WHERE id='hosttvatt'")
      .run();
    for (let i = 0; i < 3; i++) {
      await f.sale("emma", "preemium");
      await f.sale("peter", "fin");
      await f.sale("johan", "hosttvatt");
    }
    for (let i = 0; i < 2; i++) await f.sale("lisa", "finast-plus");
  }
  const stats = async (query = "period=today") =>
    (await (await f.call("/stats?" + query)).json()) as Stats;
  it.each(["today", "week", "month", "custom"])(
    "rangordning/3-tvättarskrav under %s",
    async (period) => {
      await populate();
      const today = stockholmDay(),
        s = await stats(`period=${period}&start=${today}&end=${today}`);
      expect(s.leaders.average.map((p) => p.id)).toEqual([
        "emma",
        "johan",
        "peter",
      ]);
      expect(s.leaders.average.map((p) => p.average)).toEqual([276, 250, 238]);
      expect(s.leaders.average.some((p) => p.id === "lisa")).toBe(false);
      const html = renderToStaticMarkup(
        createElement(AverageLeague, {
          stats: s,
          periodLabel: leaguePeriodLabel(period, s.range.start, s.range.end),
        }),
      );
      expect(html).toContain("På väg in i listan");
      expect(html).toContain("2/3 tvättar");
      expect(html).toContain("+26 kr · +10,4 %");
      expect(html).toContain("±0 kr · 0,0 %");
      expect(html).toContain("−12 kr · −4,8 %");
    },
  );
  it("en enda premiumtvätt kan aldrig ge en placering; progress saknar benchmark", async () => {
    await f.sale();
    const s = await stats(),
      html = renderToStaticMarkup(
        createElement(AverageLeague, { stats: s, periodLabel: "Idag" }),
      );
    expect(s.leaders.average).toEqual([]);
    expect(html).toContain("1/3 tvättar");
    expect(html).not.toContain("+139 kr");
    expect(html).not.toContain("Plats 1");
  });
  it("ångrade och resetposter utesluts ur snitt, kvalifikation och omsättning", async () => {
    await populate();
    const emma = f.db
      .prepare("SELECT id,request_id FROM sales WHERE staff_id='emma' LIMIT 1")
      .get()!;
    await f.call("/sales/" + emma.id + "/void", "POST", {
      request_id: emma.request_id,
    });
    let s = await stats();
    expect(s.leaders.average.map((p) => p.id)).toEqual(["johan", "peter"]);
    expect(s.staff.find((p) => p.id === "emma")?.count).toBe(2);
    const cookie = await f.login(),
      p = (await (
        await f.call(
          "/admin/stats/reset/preview",
          "POST",
          { scope: "staff", staff_id: "johan", period: "all" },
          cookie,
        )
      ).json()) as { id: string };
    await f.call(
      "/admin/stats/reset",
      "POST",
      { preview_id: p.id, confirmation: "NOLLSTÄLL" },
      cookie,
    );
    s = await stats();
    expect(s.leaders.average.map((p) => p.id)).toEqual(["peter"]);
    expect(s.staff.some((p) => p.id === "johan")).toBe(false);
    expect(s.revenue).toBe(2 * 276 + 3 * 238 + 2 * 329);
  });
  it("inaktiv personal behåller historik enligt V1; arkiverad personal räknas aldrig", async () => {
    await populate();
    f.db.prepare("UPDATE staff SET active=0 WHERE id='emma'").run();
    expect((await stats()).leaders.average[0].id).toBe("emma");
    f.db
      .prepare(
        "UPDATE staff SET deleted_at='2026-10-07',active=0 WHERE id='emma'",
      )
      .run();
    expect((await stats()).leaders.average.map((p) => p.id)).toEqual([
      "johan",
      "peter",
    ]);
  });
  it("ny giltig registrering kan ändra ordningen", async () => {
    await populate();
    f.db
      .prepare("UPDATE wash_programs SET price_sek=389 WHERE id='preemium'")
      .run();
    await f.sale("johan", "preemium");
    expect((await stats()).leaders.average.map((p) => p.id)).toEqual([
      "johan",
      "emma",
      "peter",
    ]);
  });
  it("primär dashboard ersätter programfördelning och duplicerar inte snittligan", async () => {
    await populate();
    const s = await stats();
    const primary = renderToStaticMarkup(
      createElement(Dashboard, { stats: s, primary: true }),
    );
    expect(primary).toContain("Snittköpsligan");
    expect(primary).not.toContain("Sålda tvättprogram");
    expect(primary).not.toContain("Högst snittköp");
    for (const text of [
      "Flest sålda tvättar",
      "Högst omsättning",
      "Högst Preemium-andel",
    ])
      expect(primary).toContain(text);
    const admin = renderToStaticMarkup(
      createElement(Dashboard, { stats: s, primary: false }),
    );
    expect(admin).toContain("Sålda tvättprogram");
    expect(admin).toContain("mot jan–sep 2026 (250 kr)");
  });
  it("tom ligavy fabricerar inga namn eller snitt", async () => {
    const html = renderToStaticMarkup(
      createElement(AverageLeague, {
        stats: await stats(),
        periodLabel: "Idag",
      }),
    );
    expect(html).toContain("Snart börjar kampen om förstaplatsen.");
    expect(html).not.toContain("Emma");
    expect(html).not.toContain("389 kr");
  });
});
