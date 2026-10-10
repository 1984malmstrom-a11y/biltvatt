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
  db.exec(
    readFileSync(
      new URL("../migrations/0002_admin_maintenance.sql", import.meta.url),
      "utf8",
    ),
  );
  db.exec(
    readFileSync(
      new URL("../migrations/0003_push_notifications.sql", import.meta.url),
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
  it("ändrar Borstlös till 219 kr via skyddad admin utan att ändra gamla kvitton", async () => {
    expect((await sale("emma", "borstlos")).status).toBe(201);
    const cookie = await login();
    expect((await call("/admin/wash-programs/borstlos", "PATCH", { price_sek: 219 }, cookie)).status).toBe(200);
    const updated = (await (await sale("emma", "borstlos")).json()) as Sale;
    expect(updated.price_sek).toBe(219);
    expect(db.prepare("SELECT price_sek FROM sales ORDER BY rowid").all().map((row) => row.price_sek)).toEqual([199, 219]);
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
    ).toBe(415);
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
describe("Säkert Admin-underhåll", () => {
  it("framåtmigrerar befintlig historik utan ändrade försäljningsvärden eller FK-brott", () => {
    const productionLike = new DatabaseSync(":memory:");
    try {
      productionLike.exec(
        readFileSync(
          new URL("../migrations/0001_initial.sql", import.meta.url),
          "utf8",
        ),
      );
      productionLike
        .prepare(
          "INSERT INTO sales(id,staff_id,wash_program_id,price_sek,sold_at,created_at,request_id,undo_token_hash,voided_at) VALUES('old-sale','emma','preemium',369,'2025-01-01T12:00:00Z','2025-01-01T12:00:00Z','old-request','private-hash','2025-01-01T12:01:00Z')",
        )
        .run();
      const before = productionLike
        .prepare(
          "SELECT id,staff_id,wash_program_id,price_sek,sold_at,created_at,request_id,undo_token_hash,voided_at FROM sales",
        )
        .get();
      productionLike.exec(
        readFileSync(
          new URL("../migrations/0002_admin_maintenance.sql", import.meta.url),
          "utf8",
        ),
      );
      const after = productionLike.prepare("SELECT * FROM sales").get()!;
      expect(after).toMatchObject(before!);
      expect(after).toMatchObject({
        void_reason: "SELLER_UNDO",
        revision: 0,
        updated_at: "2025-01-01T12:00:00Z",
      });
      expect(productionLike.prepare("PRAGMA foreign_key_check").all()).toEqual(
        [],
      );
      expect(
        productionLike.prepare("SELECT COUNT(*) AS n FROM staff").get()?.n,
      ).toBe(5);
    } finally {
      productionLike.close();
    }
  });
  const row = (id: string) =>
    db.prepare("SELECT * FROM sales WHERE id=?").get(id)!;
  const stats = async () => (await (await call("/stats")).json()) as Stats;
  const resetPreview = async (
    cookie: string,
    data: unknown = { scope: "team", period: "all" },
  ) => {
    const response = await call(
      "/admin/stats/reset/preview",
      "POST",
      data,
      cookie,
    );
    expect(response.status).toBe(200);
    return (await response.json()) as {
      id: string;
      count: number;
      revenue: number;
      label: string;
      period_label: string;
    };
  };
  const reset = (cookie: string, id: string, confirmation = "NOLLSTÄLL") =>
    call(
      "/admin/stats/reset",
      "POST",
      { preview_id: id, confirmation },
      cookie,
    );
  const deletePreview = async (cookie: string, id: string) => {
    const response = await call(
      `/admin/staff/${id}/deletion-preview`,
      "GET",
      undefined,
      cookie,
    );
    expect(response.status).toBe(200);
    return (await response.json()) as { id: string; count: number };
  };
  it("redigerar namn/färg och bevarar auditspår", async () => {
    const cookie = await login();
    expect(
      (
        await call(
          "/admin/staff/emma",
          "PATCH",
          { name: "Emelie", color: "#112233" },
          cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      db.prepare("SELECT name,color FROM staff WHERE id='emma'").get(),
    ).toMatchObject({ name: "Emelie", color: "#112233" });
    expect(
      db.prepare("SELECT * FROM staff_audit WHERE staff_id='emma'").get(),
    ).toMatchObject({ action: "EDIT" });
  });
  it("raderar bara säljare utan någon historik och kräver granskning/bekräftelse", async () => {
    const cookie = await login(),
      p = await deletePreview(cookie, "kalle");
    expect(p.count).toBe(0);
    expect(
      (
        await call(
          "/admin/staff/kalle",
          "DELETE",
          { preview_id: p.id, confirmation: "nej" },
          cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          "/admin/staff/kalle",
          "DELETE",
          { preview_id: p.id, confirmation: "RADERA" },
          cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      db.prepare("SELECT * FROM staff WHERE id='kalle'").get(),
    ).toBeUndefined();
    expect(
      db.prepare("SELECT * FROM staff_audit WHERE staff_id='kalle'").get(),
    ).toMatchObject({ action: "DELETE" });
  });
  it("arkiverar historisk personal utan FK-brott, makulerar och döljer i alla topplistor", async () => {
    const cookie = await login();
    for (let i = 0; i < 3; i++) await sale();
    await sale("peter", "fin");
    const p = await deletePreview(cookie, "emma");
    expect(p.count).toBe(3);
    expect(
      (
        await call(
          "/admin/staff/emma",
          "DELETE",
          { preview_id: p.id, confirmation: "RADERA" },
          cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      db.prepare("SELECT active,deleted_at FROM staff WHERE id='emma'").get(),
    ).toMatchObject({ active: 0, deleted_at: expect.any(String) });
    expect(db.prepare("SELECT COUNT(*) AS n FROM sales").get()?.n).toBe(4);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    const list = (await (await call("/staff")).json()) as Staff[];
    expect(list.some((p) => p.id === "emma")).toBe(false);
    expect((await sale()).status).toBe(400);
    const result = await stats();
    expect(result.count).toBe(1);
    expect(result.revenue).toBe(179);
    expect(result.average).toBe(179);
    expect(result.goals.dailyCount).toBe(1);
    for (const leaders of Object.values(result.leaders))
      expect(leaders.some((p) => p.id === "emma")).toBe(false);
    expect((await call("/stats/staff/emma")).status).toBe(404);
    expect(
      (await call("/admin/staff/emma", "PATCH", { active: 1 }, cookie)).status,
    ).toBe(404);
    const history = (await (
      await call(
        "/admin/sales?period=all&staff_id=emma",
        "GET",
        undefined,
        cookie,
      )
    ).json()) as { rows: { staff_name: string; void_reason: string }[] };
    expect(history.rows).toHaveLength(3);
    expect(history.rows[0]).toMatchObject({
      staff_name: "Emma",
      void_reason: "STAFF_DELETED",
    });
  });
  it("även enbart makulerad historik förhindrar fysisk personalradering", async () => {
    const cookie = await login(),
      s = (await (await sale()).json()) as Sale;
    await call(`/sales/${s.id}/void`, "POST", { request_id: s.request_id });
    const p = await deletePreview(cookie, "emma");
    expect(p.count).toBe(1);
    await call(
      "/admin/staff/emma",
      "DELETE",
      { preview_id: p.id, confirmation: "RADERA" },
      cookie,
    );
    expect(
      db.prepare("SELECT deleted_at FROM staff WHERE id='emma'").get()
        ?.deleted_at,
    ).toBeTruthy();
    expect(row(s.id).void_reason).toBe("SELLER_UNDO");
  });
  it("kan återställa arkiverad identitet utan att tyst återställa statistik", async () => {
    const cookie = await login(),
      s = (await (await sale()).json()) as Sale,
      p = await deletePreview(cookie, "emma");
    await call(
      "/admin/staff/emma",
      "DELETE",
      { preview_id: p.id, confirmation: "RADERA" },
      cookie,
    );
    expect(
      (
        await call(
          `/admin/sales/${s.id}/restore`,
          "POST",
          { expected_revision: 1, confirmation: "ÅTERSTÄLL" },
          cookie,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(
          "/admin/staff/emma/restore",
          "POST",
          { confirmation: "ÅTERSTÄLL" },
          cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      db.prepare("SELECT active,deleted_at FROM staff WHERE id='emma'").get(),
    ).toMatchObject({ active: 0, deleted_at: null });
    expect((await stats()).count).toBe(0);
    expect(
      (
        await call(
          `/admin/sales/${s.id}/restore`,
          "POST",
          { expected_revision: 1, confirmation: "ÅTERSTÄLL" },
          cookie,
        )
      ).status,
    ).toBe(200);
    expect((await stats()).revenue).toBe(389);
  });
  it("avvisar personalradering när en försäljning tillkommer efter granskningen", async () => {
    const cookie = await login(),
      p = await deletePreview(cookie, "kalle");
    await sale("kalle");
    expect(
      (
        await call(
          "/admin/staff/kalle",
          "DELETE",
          { preview_id: p.id, confirmation: "RADERA" },
          cookie,
        )
      ).status,
    ).toBe(409);
    expect(
      db.prepare("SELECT deleted_at FROM staff WHERE id='kalle'").get()
        ?.deleted_at,
    ).toBeNull();
    expect((await stats()).count).toBe(1);
  });
  it("korrigerar säljare och program med nytt serverpris, audit och versionsskydd", async () => {
    const cookie = await login(),
      s = (await (await sale()).json()) as Sale;
    db.prepare("UPDATE wash_programs SET price_sek=189 WHERE id='fin'").run();
    const response = await call(
      `/admin/sales/${s.id}`,
      "PATCH",
      {
        staff_id: "peter",
        wash_program_id: "fin",
        expected_program_price: 189,
        expected_revision: 0,
      },
      cookie,
    );
    expect(response.status).toBe(200);
    expect(row(s.id)).toMatchObject({
      staff_id: "peter",
      wash_program_id: "fin",
      price_sek: 189,
      revision: 1,
      updated_by: "ADMIN",
      updated_at: expect.any(String),
    });
    const result = await stats();
    expect(result.revenue).toBe(189);
    expect(result.staff[0].id).toBe("peter");
    expect(
      (
        await call(
          `/admin/sales/${s.id}`,
          "PATCH",
          { staff_id: "emma", expected_revision: 0 },
          cookie,
        )
      ).status,
    ).toBe(409);
    const audit = (await (
      await call(`/admin/sales/${s.id}/audit`, "GET", undefined, cookie)
    ).json()) as { before_json: string; after_json: string; action: string }[];
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("ADMIN_CORRECTION");
    expect(JSON.parse(audit[0].before_json).price_sek).toBe(389);
    expect(JSON.parse(audit[0].after_json).price_sek).toBe(189);
  });
  it("bevarar historiskt pris vid bara säljarbyte och avvisar fria prisfält", async () => {
    const cookie = await login(),
      s = (await (await sale()).json()) as Sale;
    db.prepare(
      "UPDATE wash_programs SET price_sek=499 WHERE id='preemium'",
    ).run();
    expect(
      (
        await call(
          `/admin/sales/${s.id}`,
          "PATCH",
          { staff_id: "peter", expected_revision: 0 },
          cookie,
        )
      ).status,
    ).toBe(200);
    expect(row(s.id).price_sek).toBe(389);
    expect(
      (
        await call(
          `/admin/sales/${s.id}`,
          "PATCH",
          { price_sek: 1, expected_revision: 1 },
          cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          `/admin/sales/${s.id}`,
          "PATCH",
          {
            wash_program_id: "fin",
            expected_program_price: 1,
            expected_revision: 1,
          },
          cookie,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(
          `/admin/sales/${s.id}`,
          "PATCH",
          { staff_id: "saknas", expected_revision: 1 },
          cookie,
        )
      ).status,
    ).toBe(409);
  });
  it("makulerar och återställer med rätt KPI, snittköp och bevarad historik", async () => {
    const cookie = await login(),
      s = (await (await sale()).json()) as Sale;
    await sale("peter", "fin");
    expect(
      (
        await call(
          `/admin/sales/${s.id}/void`,
          "POST",
          { expected_revision: 0, confirmation: "RADERA" },
          cookie,
        )
      ).status,
    ).toBe(200);
    expect(await stats()).toMatchObject({
      count: 1,
      revenue: 179,
      average: 179,
      premiumShare: 0,
    });
    expect(row(s.id)).toMatchObject({
      void_reason: "ADMIN_VOID",
      voided_by: "ADMIN",
      revision: 1,
    });
    expect(
      (
        await call(
          `/admin/sales/${s.id}/restore`,
          "POST",
          { expected_revision: 1, confirmation: "ÅTERSTÄLL" },
          cookie,
        )
      ).status,
    ).toBe(200);
    expect(await stats()).toMatchObject({
      count: 2,
      revenue: 568,
      average: 284,
      premiumShare: 50,
    });
    expect(row(s.id).voided_at).toBeNull();
    expect(
      db
        .prepare("SELECT action FROM sales_audit WHERE sale_id=? ORDER BY id")
        .all(s.id)
        .map((a) => a.action),
    ).toEqual(["ADMIN_VOID", "ADMIN_RESTORE"]);
  });
  it("filtrerar och paginerar Admin-historik utan privata kvitton", async () => {
    const cookie = await login(),
      s = (await (await sale()).json()) as Sale;
    await sale("peter", "fin");
    await call(`/sales/${s.id}/void`, "POST", { request_id: s.request_id });
    const data = (await (
      await call(
        "/admin/sales?period=all&staff_id=emma&wash_program_id=preemium&status=voided&page_size=1",
        "GET",
        undefined,
        cookie,
      )
    ).json()) as { total: number; rows: object[] };
    expect(data.total).toBe(1);
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).not.toHaveProperty("request_id");
    expect(data.rows[0]).not.toHaveProperty("undo_token_hash");
    expect(
      (await call("/admin/sales?status=fake", "GET", undefined, cookie)).status,
    ).toBe(400);
    expect(
      (await call("/admin/sales?page=0", "GET", undefined, cookie)).status,
    ).toBe(400);
    expect(
      (await call("/admin/sales?page_size=101", "GET", undefined, cookie))
        .status,
    ).toBe(400);
    const page2 = (await (
      await call(
        "/admin/sales?period=all&page_size=1&page=2",
        "GET",
        undefined,
        cookie,
      )
    ).json()) as { total: number; rows: object[] };
    expect(page2.total).toBe(2);
    expect(page2.rows).toHaveLength(1);
  });
  it("förhandsgranskar och nollställer en säljare utan att beröra laget", async () => {
    const cookie = await login();
    await sale();
    await sale("emma", "fin");
    await sale("peter", "finast");
    const p = await resetPreview(cookie, {
      scope: "staff",
      staff_id: "emma",
      period: "all",
    });
    expect(p).toMatchObject({
      count: 2,
      revenue: 568,
      label: "Emma",
      period_label: "All historik",
    });
    expect((await stats()).count).toBe(3); // preview is read-only for business data
    expect((await reset(cookie, p.id)).status).toBe(200);
    expect(await stats()).toMatchObject({
      count: 1,
      revenue: 219,
      average: 219,
    });
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM sales WHERE void_reason='ADMIN_RESET'",
        )
        .get()?.n,
    ).toBe(2);
    expect(db.prepare("SELECT COUNT(*) AS n FROM sales").get()?.n).toBe(3);
    expect((await reset(cookie, p.id)).status).toBe(409);
  });
  it("kräver NOLLSTÄLL server-side för hela laget/all historik", async () => {
    const cookie = await login();
    await sale();
    await sale("peter", "fin");
    const p = await resetPreview(cookie);
    expect((await reset(cookie, p.id, "ja")).status).toBe(400);
    expect((await stats()).count).toBe(2);
    expect((await reset(cookie, p.id)).status).toBe(200);
    expect((await stats()).count).toBe(0);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM sales_audit WHERE action='ADMIN_RESET'",
        )
        .get()?.n,
    ).toBe(2);
    expect(
      db.prepare("SELECT * FROM reset_batches WHERE id=?").get(p.id),
    ).toMatchObject({ count: 2, revenue: 568, created_by: "ADMIN" });
  });
  it.each(["today", "week", "month"])(
    "nollställer %s men inte äldre försäljningar",
    async (period) => {
      const cookie = await login(),
        old = (await (await sale()).json()) as Sale;
      await sale("peter", "fin");
      db.prepare(
        "UPDATE sales SET sold_at='2020-01-01T12:00:00.000Z' WHERE id=?",
      ).run(old.id);
      const p = await resetPreview(cookie, { scope: "team", period });
      expect(p.count).toBe(1);
      expect(p.revenue).toBe(179);
      expect((await reset(cookie, p.id)).status).toBe(200);
      expect(row(old.id).voided_at).toBeNull();
    },
  );
  it("begränsar valfri period till Stockholms dygn inklusive datumgränser", async () => {
    const cookie = await login(),
      inside = (await (await sale()).json()) as Sale,
      outside = (await (await sale("peter", "fin")).json()) as Sale;
    db.prepare("UPDATE sales SET sold_at=? WHERE id=?").run(
      "2026-09-30T22:00:00.000Z",
      inside.id,
    );
    db.prepare("UPDATE sales SET sold_at=? WHERE id=?").run(
      "2026-10-01T22:00:00.000Z",
      outside.id,
    );
    const p = await resetPreview(cookie, {
      scope: "team",
      period: "custom",
      start: "2026-10-01",
      end: "2026-10-01",
    });
    expect(p.count).toBe(1);
    expect((await reset(cookie, p.id)).status).toBe(200);
    expect(row(inside.id).voided_at).toBeTruthy();
    expect(row(outside.id).voided_at).toBeNull();
    expect(
      (
        await call(
          "/admin/stats/reset/preview",
          "POST",
          {
            scope: "team",
            period: "custom",
            start: "2026-02-30",
            end: "2026-03-01",
          },
          cookie,
        )
      ).status,
    ).toBe(400);
  });
  it("återställer bara granskade resetposter, inte tidigare ångrade försäljningar", async () => {
    const cookie = await login(),
      undo = (await (await sale()).json()) as Sale;
    await sale("peter", "fin");
    await call(`/sales/${undo.id}/void`, "POST", {
      request_id: undo.request_id,
    });
    const p = await resetPreview(cookie);
    expect(p.count).toBe(1);
    await reset(cookie, p.id);
    const response = await call(
      "/admin/stats/restore/preview",
      "POST",
      { reset_id: p.id },
      cookie,
    );
    const restore = (await response.json()) as {
      id: string;
      count: number;
      revenue: number;
    };
    expect(restore).toMatchObject({ count: 1, revenue: 179 });
    expect(
      (
        await call(
          "/admin/stats/restore",
          "POST",
          { preview_id: restore.id, confirmation: "ÅTERSTÄLL" },
          cookie,
        )
      ).status,
    ).toBe(200);
    expect(await stats()).toMatchObject({ count: 1, revenue: 179 });
    expect(row(undo.id).voided_at).toBeTruthy();
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM sales_audit WHERE action='ADMIN_RESTORE'",
        )
        .get()?.n,
    ).toBe(1);
  });
  it("stale/utgångna förhandsgranskningar gör inga deländringar", async () => {
    const cookie = await login(),
      s = (await (await sale()).json()) as Sale;
    const p = await resetPreview(cookie);
    await sale("peter", "fin");
    expect((await reset(cookie, p.id)).status).toBe(409);
    expect((await stats()).count).toBe(2);
    expect(db.prepare("SELECT COUNT(*) AS n FROM reset_batches").get()?.n).toBe(
      0,
    );
    const p2 = await resetPreview(cookie);
    await call(
      `/admin/sales/${s.id}`,
      "PATCH",
      { staff_id: "peter", expected_revision: 0 },
      cookie,
    );
    expect((await reset(cookie, p2.id)).status).toBe(409);
    expect((await stats()).count).toBe(2);
    const p3 = await resetPreview(cookie);
    db.prepare(
      "UPDATE maintenance_previews SET expires_at='2000-01-01' WHERE id=?",
    ).run(p3.id);
    expect((await reset(cookie, p3.id)).status).toBe(409);
  });
  it("förhandsgranskning med samma antal men utbytta registreringar avvisas", async () => {
    const cookie = await login(),
      s = (await (await sale()).json()) as Sale,
      p = await resetPreview(cookie);
    await call(`/sales/${s.id}/void`, "POST", { request_id: s.request_id });
    await sale("peter", "fin");
    expect((await reset(cookie, p.id)).status).toBe(409);
    expect(await stats()).toMatchObject({ count: 1, revenue: 179 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM reset_batches").get()?.n).toBe(
      0,
    );
  });
  it("enskild makulering/återställning kräver explicit bekräftelse och giltig version", async () => {
    const cookie = await login(),
      s = (await (await sale()).json()) as Sale;
    expect(
      (
        await call(
          `/admin/sales/${s.id}/void`,
          "POST",
          { expected_revision: 0, confirmation: "nej" },
          cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          `/admin/sales/${s.id}/void`,
          "POST",
          { confirmation: "RADERA" },
          cookie,
        )
      ).status,
    ).toBe(400);
    await call(
      `/admin/sales/${s.id}/void`,
      "POST",
      { expected_revision: 0, confirmation: "RADERA" },
      cookie,
    );
    expect(
      (
        await call(
          `/admin/sales/${s.id}`,
          "PATCH",
          { staff_id: "peter", expected_revision: 1 },
          cookie,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(
          `/admin/sales/${s.id}/restore`,
          "POST",
          { expected_revision: 1, confirmation: "nej" },
          cookie,
        )
      ).status,
    ).toBe(400);
    expect(row(s.id).voided_at).toBeTruthy();
  });
  it("stale återställning och arkiverad säljare kan inte återinföras av en batch", async () => {
    const cookie = await login(),
      s = (await (await sale()).json()) as Sale,
      p = await resetPreview(cookie);
    await reset(cookie, p.id);
    const restoration = (await (
      await call(
        "/admin/stats/restore/preview",
        "POST",
        { reset_id: p.id },
        cookie,
      )
    ).json()) as { id: string };
    const d = await deletePreview(cookie, "emma");
    await call(
      "/admin/staff/emma",
      "DELETE",
      { preview_id: d.id, confirmation: "RADERA" },
      cookie,
    );
    expect(
      (
        await call(
          "/admin/stats/restore",
          "POST",
          { preview_id: restoration.id, confirmation: "ÅTERSTÄLL" },
          cookie,
        )
      ).status,
    ).toBe(409);
    expect(row(s.id).voided_at).toBeTruthy();
    expect((await stats()).count).toBe(0);
  });
  it("alla underhållsendpoints kräver Admin och CSRF-skydd", async () => {
    for (const [path, method, data] of [
      ["/admin/sales", "GET", undefined],
      ["/admin/sales/fake/audit", "GET", undefined],
      ["/admin/sales/fake", "PATCH", { staff_id: "emma" }],
      ["/admin/sales/fake/void", "POST", {}],
      ["/admin/sales/fake/restore", "POST", {}],
      ["/admin/staff/emma", "DELETE", {}],
      ["/admin/staff/emma/deletion-preview", "GET", undefined],
      ["/admin/staff/emma/restore", "POST", {}],
      ["/admin/stats/reset/preview", "POST", {}],
      ["/admin/stats/reset", "POST", {}],
      ["/admin/stats/resets", "GET", undefined],
      ["/admin/stats/restore/preview", "POST", {}],
      ["/admin/stats/restore", "POST", {}],
    ] as const)
      expect((await call(path, method, data)).status).toBe(401);
    const cookie = await login();
    expect(
      (
        await call(
          "/admin/stats/reset",
          "POST",
          {},
          cookie,
          "https://evil.test",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "/admin/stats/reset/preview",
          "POST",
          { scope: "staff", staff_id: "missing", period: "all" },
          cookie,
        )
      ).status,
    ).toBe(404);
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
