import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import worker, { type Env } from "../worker/index";

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
export function fixture() {
  const db = new DatabaseSync(":memory:");
  for (const name of readdirSync(new URL("../migrations/", import.meta.url))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    db.exec(
      readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8"),
    );
  const env: Env = {
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
  const tasks: Promise<unknown>[] = [];
  const context = {
    waitUntil: (task: Promise<unknown>) => tasks.push(task),
  } as unknown as ExecutionContext;
  const call = (
    path: string,
    method = "GET",
    data?: unknown,
    cookie?: string,
    extra: Record<string, string> = {},
  ) =>
    worker.fetch(
      new Request("https://tvattligan.test/api" + path, {
        method,
        headers: {
          ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...extra,
        },
        ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
      }),
      env,
      context,
    );
  const login = async () => {
    const response = await call("/admin/login", "POST", { pin: "123456" });
    if (response.status !== 200) throw new Error("Fixture login failed");
    return response.headers.get("Set-Cookie")!.split(";")[0];
  };
  const sale = (
    staff_id = "emma",
    wash_program_id = "preemium",
    request_id = crypto.randomUUID(),
  ) => call("/sales", "POST", { staff_id, wash_program_id, request_id });
  const finish = async () => {
    await Promise.all(tasks.splice(0));
  };
  return { db, env, call, login, sale, finish };
}
