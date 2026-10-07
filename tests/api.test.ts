import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker, { type Env } from "../worker/index";
import {
  dateRange,
  midnightUTC,
  stockholmDay,
  summarize,
  type StatsRow,
} from "../worker/stats";
import type { Sale, Staff, Stats } from "../src/types";

// SQLite executes the actual migrations and prepared SQL used by D1; no SQL queries are mocked.
class Statement {
  values: (string | number | null)[] = [];
  constructor(
    private db: DatabaseSync,
    private sql: string,
  ) {}
  bind(...values: (string | number | null)[]) {
    this.values = values;
    return this;
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.values) ?? null;
  }
  async all() {
    return {
      success: true,
      results: this.db.prepare(this.sql).all(...this.values),
      meta: {},
    };
  }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.values);
    return {
      success: true,
      results: [],
      meta: { changes: Number(result.changes) },
    };
  }
}
let db: DatabaseSync, env: Env;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(
      new URL("../migrations/0001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  env = {
    ADMIN_PIN: "123456",
    DB: {
      prepare: (sql: string) => new Statement(db, sql),
      batch: async (statements: Statement[]) => {
        db.exec("BEGIN");
        try {
          const results = [];
          for (const s of statements) results.push(await s.run());
          db.exec("COMMIT");
          return results;
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },
    } as unknown as D1Database,
  };
});
afterEach(() => db.close());
const call = (
  path: string,
  method = "GET",
  data?: unknown,
  cookie?: string,
  origin?: string,
) =>
  worker.fetch(
    new Request(`https://tvattligan.test/api${path}`, {
      method,
      headers: {
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(origin ? { Origin: origin } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    }),
    env,
  );
const sale = (
  staff_id = "emma",
  wash_program_id = "preemium",
  request_id = crypto.randomUUID(),
) => call("/sales", "POST", { staff_id, wash_program_id, request_id });
const login = async () => {
  const response = await call("/admin/login", "POST", { pin: "123456" });
  expect(response.status).toBe(200);
  return response.headers.get("Set-Cookie")!.split(";")[0];
};

describe("Försäljning och dataintegritet", () => {
  it("registrerar säljare, program, pris, unikt ID och tidsstämpel", async () => {
    const response = await sale();
    expect(response.status).toBe(201);
    const result = (await response.json()) as Sale;
    expect(result).toMatchObject({
      staff_id: "emma",
      wash_program_id: "preemium",
      price_sek: 389,
      voided_at: null,
    });
    expect(result.id).toMatch(/^[\da-f-]{36}$/);
    expect(Date.parse(result.sold_at)).toBeGreaterThan(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM sales").get()?.n).toBe(1);
  });
  it("läser aktuellt pris från servern och avvisar klientens pris", async () => {
    db.prepare("UPDATE wash_programs SET price_sek=409 WHERE id=?").run(
      "preemium",
    );
    expect(((await (await sale()).json()) as Sale).price_sek).toBe(409);
    expect(
      (
        await call("/sales", "POST", {
          staff_id: "emma",
          wash_program_id: "preemium",
          price_sek: 1,
          request_id: crypto.randomUUID(),
        })
      ).status,
    ).toBe(400);
  });
  it("räknar inte dubbla begäranden och upptäcker återanvändning för annat program", async () => {
    const id = crypto.randomUUID();
    const first = (await (await sale("emma", "preemium", id)).json()) as Sale;
    const repeat = await sale("emma", "preemium", id);
    expect(repeat.status).toBe(200);
    expect(((await repeat.json()) as Sale).id).toBe(first.id);
    expect((await sale("emma", "fin", id)).status).toBe(409);
    expect(db.prepare("SELECT COUNT(*) AS n FROM sales").get()?.n).toBe(1);
  });
  it("makulerar idempotent och utesluter ångrad försäljning ur statistik och mål", async () => {
    const result = (await (await sale()).json()) as Sale;
    expect(
      (
        await call(`/sales/${result.id}/void`, "POST", {
          request_id: crypto.randomUUID(),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(`/sales/${result.id}/void`, "POST", {
          request_id: result.request_id,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(`/sales/${result.id}/void`, "POST", {
          request_id: result.request_id,
        })
      ).status,
    ).toBe(200);
    const stats = (await (await call("/stats")).json()) as Stats;
    expect(stats.count).toBe(0);
    expect(stats.revenue).toBe(0);
    expect(stats.goals.dailyCount).toBe(0);
    expect(
      db.prepare("SELECT voided_at FROM sales").get()?.voided_at,
    ).toBeTruthy();
  });
  it("beräknar omsättning, snittköp och Preemium-andel", async () => {
    await sale("emma", "preemium");
    await sale("emma", "fin");
    const stats = (await (await call("/stats")).json()) as Stats;
    expect(stats.count).toBe(2);
    expect(stats.revenue).toBe(568);
    expect(stats.average).toBe(284);
    expect(stats.premiumShare).toBe(50);
    expect(stats.programs).toHaveLength(2);
    expect(stats.goals.dailyCount).toBe(2);
  });
  it("bevarar historiska priser efter administrativ prisändring", async () => {
    await sale();
    const cookie = await login();
    expect(
      (
        await call(
          "/admin/wash-programs/preemium",
          "PATCH",
          { price_sek: 449 },
          cookie,
        )
      ).status,
    ).toBe(200);
    const next = (await (await sale()).json()) as Sale;
    expect(next.price_sek).toBe(449);
    const stats = (await (await call("/stats")).json()) as Stats;
    expect(stats.revenue).toBe(838);
    expect(
      db
        .prepare("SELECT price_sek FROM sales ORDER BY rowid")
        .all()
        .map((x) => x.price_sek),
    ).toEqual([389, 449]);
  });
  it("döljer inaktiv personal och avvisar försäljning för inaktiva poster", async () => {
    const cookie = await login();
    await call("/admin/staff/emma", "PATCH", { active: 0 }, cookie);
    const people = (await (await call("/staff")).json()) as Staff[];
    expect(people.map((p) => p.name)).not.toContain("Emma");
    const all = (await (
      await call("/staff?all=1", "GET", undefined, cookie)
    ).json()) as Staff[];
    expect(all).toHaveLength(5);
    expect((await sale()).status).toBe(400);
    await call("/admin/wash-programs/fin", "PATCH", { active: 0 }, cookie);
    expect((await sale("peter", "fin")).status).toBe(400);
  });
  it("validerar data och tillåter inte radering av historik", async () => {
    const cookie = await login();
    expect(
      (await call("/admin/staff", "POST", { name: "", color: "#abc" }, cookie))
        .status,
    ).toBe(400);
    expect(
      (
        await call(
          "/admin/wash-programs/fin",
          "PATCH",
          { price_sek: -1 },
          cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (await call("/admin/settings", "PUT", { daily_goal: 2.5 }, cookie))
        .status,
    ).toBe(400);
    expect(
      (await call("/admin/staff/emma", "DELETE", undefined, cookie)).status,
    ).toBe(404);
  });
  it("visar individuell statistik", async () => {
    await sale("emma", "fin");
    await sale("peter", "preemium");
    const stats = (await (await call("/stats/staff/emma")).json()) as Stats;
    expect(stats.count).toBe(1);
    expect(stats.revenue).toBe(179);
    expect(stats.staff[0].name).toBe("Emma");
  });
});
describe("Topplistor", () => {
  it("rangordnar säljare och kräver 3 försäljningar för snitt och andel", async () => {
    for (let i = 0; i < 3; i++) await sale("emma", "fin");
    for (let i = 0; i < 4; i++) await sale("peter", "preemium");
    for (let i = 0; i < 2; i++) await sale("johan", "preemium");
    const stats = (await (await call("/stats")).json()) as Stats;
    expect(stats.leaders.count.map((p) => p.name)).toEqual([
      "Peter",
      "Emma",
      "Johan",
    ]);
    expect(stats.leaders.revenue.map((p) => p.name)).toEqual([
      "Peter",
      "Johan",
      "Emma",
    ]);
    expect(stats.leaders.average.map((p) => p.name)).toEqual(["Peter", "Emma"]);
    expect(stats.leaders.premiumShare.map((p) => p.name)).toEqual([
      "Peter",
      "Emma",
    ]);
  });
  it("ger noll och tomma listor när perioden saknar försäljning", () => {
    const stats = summarize([] as StatsRow[]);
    expect(stats.average).toBe(0);
    expect(stats.premiumShare).toBe(0);
    expect(stats.leaders.count).toEqual([]);
  });
});
describe("Admin, sessioner och export", () => {
  it("avvisar alla oskyddade admin-anrop", async () => {
    for (const [path, method, data] of [
      ["/admin/settings", "GET", undefined],
      ["/admin/settings", "PUT", { daily_goal: 10 }],
      ["/admin/staff", "POST", { name: "Ny", color: "#123456" }],
      ["/admin/staff/emma", "PATCH", { name: "Test" }],
      ["/admin/wash-programs/fin", "PATCH", { price_sek: 10 }],
      ["/admin/export", "GET", undefined],
    ] as const)
      expect((await call(path, method, data)).status).toBe(401);
    expect((await call("/staff?all=1")).status).toBe(401);
    expect((await call("/admin/login", "POST", { pin: "000000" })).status).toBe(
      401,
    );
  });
  it("skapar serverlagrad säker cookie och logout spärrar sessionen", async () => {
    const response = await call("/admin/login", "POST", { pin: "123456" });
    const cookie = response.headers.get("Set-Cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(
      (await call("/admin/settings", "GET", undefined, cookie)).status,
    ).toBe(200);
    await call("/admin/logout", "POST", undefined, cookie);
    expect(
      (await call("/admin/settings", "GET", undefined, cookie)).status,
    ).toBe(401);
  });
  it("begränsar PIN-försök och avvisar utgångna sessioner", async () => {
    for (let i = 0; i < 5; i++)
      expect(
        (await call("/admin/login", "POST", { pin: "000000" })).status,
      ).toBe(401);
    expect((await call("/admin/login", "POST", { pin: "123456" })).status).toBe(
      429,
    );
    db.exec("DELETE FROM login_attempts");
    const cookie = await login();
    db.exec("UPDATE admin_sessions SET expires_at='2000-01-01T00:00:00Z'");
    expect(
      (await call("/admin/settings", "GET", undefined, cookie)).status,
    ).toBe(401);
  });
  it("avvisar CSRF-anrop och kräver serverkonfigurerad PIN", async () => {
    const cookie = await login();
    expect(
      (
        await call(
          "/admin/settings",
          "PUT",
          { daily_goal: 99 },
          cookie,
          "https://evil.test",
        )
      ).status,
    ).toBe(403);
    env.ADMIN_PIN = undefined;
    expect((await call("/admin/login", "POST", { pin: "123456" })).status).toBe(
      503,
    );
  });
  it("sparar personal och mål och exporterar BOM, semikolon och makuleringar", async () => {
    const cookie = await login();
    expect(
      (
        await call(
          "/admin/staff",
          "POST",
          { name: "=FORMEL", color: "#123456" },
          cookie,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await call(
          "/admin/settings",
          "PUT",
          { daily_goal: 30, monthly_goal: 600 },
          cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      await (await call("/admin/settings", "GET", undefined, cookie)).json(),
    ).toEqual({ daily_goal: 30, monthly_goal: 600 });
    const result = (await (await sale()).json()) as Sale;
    await call(`/sales/${result.id}/void`, "POST", {
      request_id: result.request_id,
    });
    await call("/admin/staff/emma", "PATCH", { name: "=FORMEL" }, cookie);
    const response = await call("/admin/export", "GET", undefined, cookie);
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([239, 187, 191]);
    const csv = new TextDecoder().decode(bytes);
    expect(csv).toContain("Datum;Tid;Säljare;Tvättprogram;Pris;Status");
    expect(csv).toContain("Makulerad");
    expect(csv).toContain("'=FORMEL");
    expect(csv).not.toContain("undo_token_hash");
  });
});
describe("Stockholmstid och perioder", () => {
  it("konverterar vinter, sommar och båda DST-gränserna korrekt", () => {
    expect(midnightUTC("2026-01-15")).toBe("2026-01-14T23:00:00.000Z");
    expect(midnightUTC("2026-07-15")).toBe("2026-07-14T22:00:00.000Z");
    expect(midnightUTC("2026-03-29")).toBe("2026-03-28T23:00:00.000Z");
    expect(midnightUTC("2026-03-30")).toBe("2026-03-29T22:00:00.000Z");
    expect(midnightUTC("2026-10-25")).toBe("2026-10-24T22:00:00.000Z");
    expect(midnightUTC("2026-10-26")).toBe("2026-10-25T23:00:00.000Z");
  });
  it("använder måndag och rätt kalenderdag för periodgränser", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const range = dateRange(new URL("https://test/?period=week"), now);
    expect(range.start).toBe("2026-10-05");
    expect(range.end).toBe("2026-10-11");
    expect(dateRange(new URL("https://test/?period=month"), now).end).toBe(
      "2026-10-31",
    );
    expect(stockholmDay(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02");
  });
  it("avvisar ogiltiga, bakvända eller alltför långa perioder", async () => {
    for (const query of [
      "period=custom&start=2026-02-30&end=2026-03-01",
      "period=custom&start=2026-10-07&end=2026-10-01",
      "period=other",
      "period=custom&start=2020-01-01&end=2026-01-01",
    ])
      expect((await call("/stats?" + query)).status).toBe(400);
  });
});
