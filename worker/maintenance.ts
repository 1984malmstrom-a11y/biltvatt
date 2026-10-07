import type { Env } from "./index";
import { body, checkFields, fail, integer, json, text } from "./http";
import { dateRange } from "./stats";

type Params = (string | number | null)[];
interface Filters {
  scope: string;
  staff_id?: string;
  period: string;
  start?: string;
  end?: string;
  reset_id?: string;
  from?: string;
  to?: string;
}
interface Preview {
  id: string;
  kind: string;
  filters_json: string;
  label: string;
  period_label: string;
  count: number;
  revenue: number;
  expires_at: string;
  used_at: string | null;
}
interface Row {
  id: string;
  staff_id: string;
  wash_program_id: string;
  price_sek: number;
  revision: number;
  voided_at: string | null;
  deleted_at: string | null;
}
const joined =
  "sales s JOIN staff t ON t.id=s.staff_id JOIN wash_programs p ON p.id=s.wash_program_id";
const fields =
  "s.id,s.staff_id,s.wash_program_id,s.price_sek,s.sold_at,s.voided_at,s.void_reason,s.updated_at,s.updated_by,s.revision,s.reset_id,t.name AS staff_name,t.deleted_at,p.name AS program_name";
function range(period: string, start?: string, end?: string) {
  if (period === "all")
    return { sql: "1=1", values: [] as Params, label: "All historik" };
  if (!["today", "week", "month", "custom"].includes(period))
    return fail(400, "Välj en giltig period.");
  const url = new URL("https://local.test");
  url.searchParams.set("period", period);
  if (start) url.searchParams.set("start", start);
  if (end) url.searchParams.set("end", end);
  try {
    const r = dateRange(url);
    return {
      sql: "s.sold_at>=? AND s.sold_at<?",
      values: [r.from, r.to] as Params,
      label: `${r.start} – ${r.end}`,
    };
  } catch (e) {
    return fail(400, (e as Error).message);
  }
}
function selection(filters: Filters, kind: string) {
  const r =
    filters.from && filters.to
      ? {
          sql: "s.sold_at>=? AND s.sold_at<?",
          values: [filters.from, filters.to] as Params,
          label: `${filters.start} – ${filters.end}`,
        }
      : range(filters.period, filters.start, filters.end);
  let sql = r.sql;
  const values = [...r.values];
  if (filters.scope === "staff") {
    sql += " AND s.staff_id=?";
    values.push(filters.staff_id!);
  }
  if (kind === "restore") {
    sql +=
      " AND s.reset_id=? AND s.void_reason='ADMIN_RESET' AND s.voided_at IS NOT NULL AND t.deleted_at IS NULL";
    values.push(filters.reset_id!);
  } else if (kind === "reset")
    sql += " AND s.voided_at IS NULL AND t.deleted_at IS NULL";
  if (kind === "delete_staff") sql += " AND t.deleted_at IS NULL";
  return { sql, values, label: r.label };
}
async function preview(
  env: Env,
  kind: string,
  filters: Filters,
  label: string,
) {
  if (filters.period !== "all") {
    const r = range(filters.period, filters.start, filters.end);
    [filters.from, filters.to] = r.values as string[];
    [filters.start, filters.end] = r.label.split(" – ");
  }
  const selected = selection(filters, kind),
    id = crypto.randomUUID();
  // Snapshot and its totals are captured in the same D1 transaction, not in the browser.
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO maintenance_previews(id,kind,filters_json,label,period_label,expires_at) VALUES(?,?,?,?,?,?)",
    ).bind(
      id,
      kind,
      JSON.stringify(filters),
      label,
      selected.label,
      new Date(Date.now() + 10 * 60000).toISOString(),
    ),
    env.DB.prepare(
      `INSERT INTO maintenance_preview_sales(preview_id,sale_id,revision) SELECT ?,s.id,s.revision FROM ${joined} WHERE ${selected.sql}`,
    ).bind(id, ...selected.values),
    env.DB.prepare(
      "UPDATE maintenance_previews SET count=(SELECT COUNT(*) FROM maintenance_preview_sales WHERE preview_id=?),revenue=COALESCE((SELECT SUM(s.price_sek) FROM maintenance_preview_sales v JOIN sales s ON s.id=v.sale_id WHERE v.preview_id=?),0) WHERE id=?",
    ).bind(id, id, id),
  ]);
  return env.DB.prepare("SELECT * FROM maintenance_previews WHERE id=?")
    .bind(id)
    .first<Preview>();
}
async function readPreview(
  env: Env,
  data: Record<string, unknown>,
  kind: string,
) {
  const id = text(data.preview_id, "Förhandsgranskning");
  const p = await env.DB.prepare(
    "SELECT * FROM maintenance_previews WHERE id=?",
  )
    .bind(id)
    .first<Preview>();
  if (
    !p ||
    p.kind !== kind ||
    p.used_at ||
    p.expires_at <= new Date().toISOString()
  )
    return fail(
      409,
      "Förhandsgranskningen har gått ut eller använts. Granska på nytt.",
    );
  return p;
}
// Atomically claim only an unchanged snapshot. The subsequent writes are conditional on
// this fresh operation token inside the SAME transaction, closing the check/write race.
function claim(env: Env, p: Preview, filters: Filters, token: string) {
  const selected = selection(filters, p.kind);
  return env.DB.prepare(
    `UPDATE maintenance_previews SET used_at=? WHERE id=? AND used_at IS NULL AND expires_at>?
    AND count=(SELECT COUNT(*) FROM ${joined} WHERE ${selected.sql})
    AND count=(SELECT COUNT(*) FROM ${joined} JOIN maintenance_preview_sales v ON s.id=v.sale_id WHERE v.preview_id=? AND v.revision=s.revision AND ${selected.sql})`,
  ).bind(
    token,
    p.id,
    new Date().toISOString(),
    ...selected.values,
    p.id,
    ...selected.values,
  );
}
function approved(p: Preview, token: string) {
  return {
    sql: "EXISTS(SELECT 1 FROM maintenance_previews WHERE id=? AND used_at=?)",
    values: [p.id, token] as Params,
  };
}

export async function maintenance(
  request: Request,
  env: Env,
): Promise<Response | null> {
  // Called ONLY after index.ts has validated the Admin session and same-origin guard.
  const url = new URL(request.url),
    path = url.pathname.replace(/^\/api/, ""),
    method = request.method;
  const now = new Date().toISOString();
  if (path === "/admin/sales" && method === "GET") {
    const r = range(
      url.searchParams.get("period") ?? "today",
      url.searchParams.get("start") ?? undefined,
      url.searchParams.get("end") ?? undefined,
    );
    let where = r.sql;
    const values = [...r.values];
    for (const key of ["staff_id", "wash_program_id"] as const) {
      const value = url.searchParams.get(key);
      if (value) {
        const id = text(value, key);
        if (
          !(await env.DB.prepare(
            `SELECT id FROM ${key === "staff_id" ? "staff" : "wash_programs"} WHERE id=?`,
          )
            .bind(id)
            .first())
        )
          fail(
            400,
            "Filtret innehåller en okänd säljare eller ett okänt program.",
          );
        where += ` AND s.${key}=?`;
        values.push(id);
      }
    }
    const status = url.searchParams.get("status") ?? "all";
    if (!["all", "registered", "voided"].includes(status))
      fail(400, "Ogiltig status.");
    if (status !== "all")
      where += ` AND s.voided_at IS ${status === "registered" ? "NULL" : "NOT NULL"}`;
    const page = integer(
      Number(url.searchParams.get("page") ?? 1),
      "Sida",
      1000000,
    );
    const size = integer(
      Number(url.searchParams.get("page_size") ?? 25),
      "Sidstorlek",
      100,
    );
    if (!page || !size)
      fail(400, "Sida och sidstorlek måste vara större än noll.");
    const total = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM ${joined} WHERE ${where}`,
    )
      .bind(...values)
      .first<{ n: number }>();
    const rows = await env.DB.prepare(
      `SELECT ${fields} FROM ${joined} WHERE ${where} ORDER BY s.sold_at DESC,s.id DESC LIMIT ? OFFSET ?`,
    )
      .bind(...values, size, (page - 1) * size)
      .all();
    return json({ rows: rows.results, total: total!.n, page, page_size: size });
  }
  const sale = path.match(
    /^\/admin\/sales\/([^/]+)(?:\/(void|restore|audit))?$/,
  );
  if (sale && sale[2] === "audit" && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT id,action,actor,changed_at,before_json,after_json FROM sales_audit WHERE sale_id=? ORDER BY id",
    )
      .bind(sale[1])
      .all();
    return json(rows.results);
  }
  if (
    sale &&
    ((method === "PATCH" && !sale[2]) ||
      (method === "POST" && ["void", "restore"].includes(sale[2])))
  ) {
    const data = await body(request);
    checkFields(
      data,
      method === "PATCH"
        ? [
            "staff_id",
            "wash_program_id",
            "expected_revision",
            "expected_program_price",
          ]
        : ["expected_revision", "confirmation"],
    );
    const row = await env.DB.prepare(
      `SELECT ${fields} FROM ${joined} WHERE s.id=?`,
    )
      .bind(sale[1])
      .first<Row>();
    if (!row) return fail(404, "Registreringen finns inte.");
    const revision = integer(data.expected_revision, "Version");
    if (revision !== row.revision)
      return fail(409, "Registreringen har ändrats. Läs in den igen.");
    let statement: D1PreparedStatement;
    if (method === "PATCH") {
      if (row.voided_at)
        return fail(409, "Återställ registreringen innan den korrigeras.");
      if (!data.staff_id && !data.wash_program_id)
        return fail(400, "Välj säljare eller tvättprogram.");
      const staffId =
        data.staff_id === undefined
          ? row.staff_id
          : text(data.staff_id, "Säljare");
      const programId =
        data.wash_program_id === undefined
          ? row.wash_program_id
          : text(data.wash_program_id, "Tvättprogram");
      const changedProgram = programId !== row.wash_program_id;
      const price = changedProgram
        ? integer(data.expected_program_price, "Förhandsvisat pris", 10000)
        : row.price_sek;
      statement = env.DB.prepare(
        `UPDATE sales SET staff_id=?,wash_program_id=?,price_sek=?,updated_at=?,updated_by='ADMIN',revision=revision+1
        WHERE id=? AND revision=? AND voided_at IS NULL
        AND EXISTS(SELECT 1 FROM staff WHERE id=? AND deleted_at IS NULL AND (active=1 OR id=?))
        AND EXISTS(SELECT 1 FROM wash_programs WHERE id=? AND (active=1 OR id=?) ${changedProgram ? "AND price_sek=?" : ""})`,
      ).bind(
        staffId,
        programId,
        price,
        now,
        row.id,
        revision,
        staffId,
        row.staff_id,
        programId,
        row.wash_program_id,
        ...(changedProgram ? [price] : []),
      );
    } else {
      if (data.confirmation !== (sale[2] === "void" ? "RADERA" : "ÅTERSTÄLL"))
        return fail(400, "Bekräfta åtgärden först.");
      const restore = sale[2] === "restore";
      statement = env.DB.prepare(
        `UPDATE sales SET voided_at=?,void_reason=?,voided_by=?,reset_id=NULL,updated_at=?,updated_by='ADMIN',revision=revision+1
        WHERE id=? AND revision=? AND voided_at IS ${restore ? "NOT NULL" : "NULL"} ${restore ? "AND EXISTS(SELECT 1 FROM staff WHERE id=sales.staff_id AND deleted_at IS NULL)" : ""}`,
      ).bind(
        restore ? null : now,
        restore ? null : "ADMIN_VOID",
        restore ? null : "ADMIN",
        now,
        row.id,
        revision,
      );
    }
    const result = await statement.run();
    if (!result.meta.changes)
      return fail(
        409,
        "Registreringen, säljaren eller priset har ändrats. Uppdatera och försök igen.",
      );
    return json(
      await env.DB.prepare(`SELECT ${fields} FROM ${joined} WHERE s.id=?`)
        .bind(row.id)
        .first(),
    );
  }
  const staff = path.match(
    /^\/admin\/staff\/([^/]+)(?:\/(deletion-preview|restore))?$/,
  );
  if (staff && staff[2] === "deletion-preview" && method === "GET") {
    const person = await env.DB.prepare(
      "SELECT id,name FROM staff WHERE id=? AND deleted_at IS NULL",
    )
      .bind(staff[1])
      .first<{ id: string; name: string }>();
    if (!person) return fail(404, "Säljaren finns inte eller är arkiverad.");
    return json(
      await preview(
        env,
        "delete_staff",
        { scope: "staff", staff_id: person.id, period: "all" },
        person.name,
      ),
    );
  }
  if (staff && !staff[2] && method === "DELETE") {
    const data = await body(request);
    checkFields(data, ["preview_id", "confirmation"]);
    const p = await readPreview(env, data, "delete_staff"),
      filters = JSON.parse(p.filters_json) as Filters;
    if (filters.staff_id !== staff[1] || data.confirmation !== "RADERA")
      return fail(400, "Bekräfta rätt säljare.");
    const token = crypto.randomUUID(),
      ok = approved(p, token);
    const operations = [claim(env, p, filters, token)];
    if (p.count === 0)
      operations.push(
        env.DB.prepare(
          `DELETE FROM staff WHERE id=? AND deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM sales WHERE staff_id=?) AND ${ok.sql}`,
        ).bind(staff[1], staff[1], ...ok.values),
      );
    else {
      operations.push(
        env.DB.prepare(
          `UPDATE staff SET deleted_at=?,active=0 WHERE id=? AND deleted_at IS NULL AND ${ok.sql}`,
        ).bind(now, staff[1], ...ok.values),
      );
      operations.push(
        env.DB.prepare(
          `UPDATE sales SET voided_at=?,void_reason='STAFF_DELETED',voided_by='ADMIN',updated_at=?,updated_by='ADMIN',revision=revision+1 WHERE staff_id=? AND voided_at IS NULL AND ${ok.sql}`,
        ).bind(now, now, staff[1], ...ok.values),
      );
    }
    const results = await env.DB.batch(operations);
    if (!results[0].meta.changes || !results[1].meta.changes)
      return fail(409, "Underlaget har ändrats. Granska säljaren på nytt.");
    return json({ ok: true, archived: p.count > 0 });
  }
  // Archiving is reversible, but restoring the identity intentionally restores NO sales.
  if (staff && staff[2] === "restore" && method === "POST") {
    const data = await body(request);
    checkFields(data, ["confirmation"]);
    if (data.confirmation !== "ÅTERSTÄLL")
      return fail(400, "Bekräfta återställningen.");
    const result = await env.DB.prepare(
      "UPDATE staff SET deleted_at=NULL,active=0 WHERE id=? AND deleted_at IS NOT NULL",
    )
      .bind(staff[1])
      .run();
    if (!result.meta.changes) return fail(409, "Säljaren är inte arkiverad.");
    return json({ ok: true });
  }
  if (path === "/admin/stats/reset/preview" && method === "POST") {
    const data = await body(request);
    checkFields(data, ["scope", "staff_id", "period", "start", "end"]);
    if (data.scope !== "team" && data.scope !== "staff")
      return fail(400, "Välj laget eller en säljare.");
    const filters: Filters = {
      scope: data.scope,
      period: text(data.period, "Period"),
      ...(data.start !== undefined
        ? { start: text(data.start, "Startdatum") }
        : {}),
      ...(data.end !== undefined ? { end: text(data.end, "Slutdatum") } : {}),
    };
    let label = "Hela laget";
    if (filters.scope === "staff") {
      filters.staff_id = text(data.staff_id, "Säljare");
      const person = await env.DB.prepare(
        "SELECT name FROM staff WHERE id=? AND deleted_at IS NULL",
      )
        .bind(filters.staff_id)
        .first<{ name: string }>();
      if (!person) return fail(404, "Säljaren finns inte.");
      label = person.name;
    }
    return json(await preview(env, "reset", filters, label));
  }
  if (path === "/admin/stats/resets" && method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT b.*,(SELECT COUNT(*) FROM sales s JOIN staff t ON t.id=s.staff_id WHERE s.reset_id=b.id AND s.void_reason='ADMIN_RESET' AND s.voided_at IS NOT NULL AND t.deleted_at IS NULL) AS restorable_count FROM reset_batches b ORDER BY b.created_at DESC,b.id LIMIT 50`,
    ).all();
    return json(rows.results);
  }
  if (path === "/admin/stats/restore/preview" && method === "POST") {
    const data = await body(request);
    checkFields(data, ["reset_id"]);
    const id = text(data.reset_id, "Nollställning");
    const batch = await env.DB.prepare(
      "SELECT label FROM reset_batches WHERE id=?",
    )
      .bind(id)
      .first<{ label: string }>();
    if (!batch) return fail(404, "Nollställningen finns inte.");
    return json(
      await preview(
        env,
        "restore",
        { scope: "team", period: "all", reset_id: id },
        batch.label,
      ),
    );
  }
  if (
    ["/admin/stats/reset", "/admin/stats/restore"].includes(path) &&
    method === "POST"
  ) {
    const kind = path.endsWith("/reset") ? "reset" : "restore";
    const data = await body(request);
    checkFields(data, ["preview_id", "confirmation"]);
    const p = await readPreview(env, data, kind),
      filters = JSON.parse(p.filters_json) as Filters;
    if (data.confirmation !== (kind === "reset" ? "NOLLSTÄLL" : "ÅTERSTÄLL"))
      return fail(
        400,
        kind === "reset"
          ? "Bekräfta med NOLLSTÄLL."
          : "Bekräfta återställningen.",
      );
    if (!p.count)
      return fail(400, "Förhandsgranskningen innehåller inga registreringar.");
    const token = crypto.randomUUID(),
      ok = approved(p, token),
      restore = kind === "restore";
    const operations = [claim(env, p, filters, token)];
    if (!restore)
      operations.push(
        env.DB.prepare(
          `INSERT INTO reset_batches(id,label,period_label,count,revenue,created_at,created_by) SELECT id,label,period_label,count,revenue,?,'ADMIN' FROM maintenance_previews WHERE id=? AND used_at=?`,
        ).bind(now, p.id, token),
      );
    operations.push(
      env.DB.prepare(
        `UPDATE sales SET voided_at=?,void_reason=?,voided_by=?,reset_id=?,updated_at=?,updated_by='ADMIN',revision=revision+1 WHERE id IN(SELECT sale_id FROM maintenance_preview_sales WHERE preview_id=?) AND ${ok.sql}`,
      ).bind(
        restore ? null : now,
        restore ? null : "ADMIN_RESET",
        restore ? null : "ADMIN",
        restore ? null : p.id,
        now,
        p.id,
        ...ok.values,
      ),
    );
    const results = await env.DB.batch(operations);
    if (!results[0].meta.changes)
      return fail(
        409,
        "Försäljningar har ändrats sedan förhandsgranskningen. Granska på nytt; inget ändrades.",
      );
    return json({
      ok: true,
      count: p.count,
      revenue: p.revenue,
      reset_id: restore ? filters.reset_id : p.id,
    });
  }
  return null;
}
