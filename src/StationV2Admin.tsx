import { useCallback, useEffect, useRef, useState } from "react";
import { api, send } from "./api";
import { findScheduleConflicts, type ScheduleRow } from "../shared/schedule";
import { emptyMonthlyMetrics, formatMonthlyNumber, inputNumber, MONTHLY_CATEGORIES, monthlyTone, parseSwedishNumber, type FixedMonthlyMetrics } from "../shared/monthly";
type Shift = {
  id: string;
  period_id: string;
  work_date: string;
  first_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  revision: number;
  updated_at: string;
};
type Period = {
  id: string;
  label: string;
  starts_on: string;
  ends_on: string;
  updated_at: string;
};
type Notice = {
  id: string;
  title: string;
  message: string;
  published: number;
  expires_on: string | null;
  expires_time: string | null;
  revision: number;
  updated_at: string;
};
type Row = ScheduleRow;
type Monthly = { month: string; metrics: FixedMonthlyMetrics | null; legacy: boolean; revision: number | null; updated_at: string | null };
const monthlyDraft = (metrics: FixedMonthlyMetrics | null) => {
  const source = metrics ?? emptyMonthlyMetrics();
  return Object.fromEntries(MONTHLY_CATEGORIES.flatMap(({ key, fields }) =>
    fields.map((field) => [`${key}.${field}`, inputNumber((source[key] as Record<string, number | null>)[field])]),
  )) as Record<string, string>;
};
const parseMonthlyDraft = (draft: Record<string, string>): FixedMonthlyMetrics => {
  const result = emptyMonthlyMetrics();
  for (const { key, fields } of MONTHLY_CATEGORIES) for (const field of fields) {
    const value = parseSwedishNumber(draft[`${key}.${field}`] ?? "");
    if (value !== null && !Number.isFinite(value)) throw new Error("Ange giltiga tal med komma som decimaltecken.");
    (result[key] as Record<string, number | null>)[field] = value;
  }
  return result;
};
const blank = {
  title: "", message: "", published: false, expires_on: "", expires_time: "",
};
const previousMonth = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    year: "numeric", month: "2-digit", timeZone: "Europe/Stockholm",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
};

function csvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (quoted)
    throw new Error("CSV-filen har ett citattecken som inte avslutas.");
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
export function parseScheduleCsv(raw: string): Row[] {
  const rows = csvRows(raw.replace(/^\uFEFF/, ""));
  const expected = ["datum", "förnamn", "start", "slut", "status"];
  const header = rows.shift()?.map((x) => x.trim().toLocaleLowerCase("sv-SE"));
  if (
    !header ||
    header.length !== 5 ||
    header.some((h, i) => h !== expected[i])
  )
    throw new Error(
      "CSV ska ha rubrikerna datum,förnamn,start,slut,status i den ordningen.",
    );
  if (rows.length < 1 || rows.length > 500)
    throw new Error("CSV ska innehålla 1–500 pass.");
  return rows.map((r, i) => {
    if (r.length !== 5) throw new Error(`Rad ${i + 2} har fel antal kolumner.`);
    const [work_date, first_name, starts_at, ends_at, statusRaw] = r.map((x) =>
      x.trim(),
    );
    const status = statusRaw || "active";
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(work_date) ||
      Number.isNaN(Date.parse(work_date)) ||
      new Date(work_date).toISOString().slice(0, 10) !== work_date ||
      !first_name ||
      first_name.length > 60 ||
      !/^[\p{L}][\p{L} .'-]*$/u.test(first_name) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(starts_at) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(ends_at) ||
      starts_at === ends_at ||
      !["active", "cancelled", "leave", "sick"].includes(status)
    )
      throw new Error(
        `Rad ${i + 2} innehåller ogiltigt datum, namn, tid eller status.`,
      );
    return { work_date, first_name, starts_at, ends_at, status };
  });
}
export default function StationV2Admin() {
  const [periods, setPeriods] = useState<Period[]>([]),
    [shifts, setShifts] = useState<Shift[]>([]),
    [notices, setNotices] = useState<Notice[]>([]),
    [monthly, setMonthly] = useState<Monthly[]>([]);
  const [month, setMonth] = useState(previousMonth),
    [metrics, setMetrics] = useState<Record<string, string>>(() => monthlyDraft(null)),
    [legacyMonth, setLegacyMonth] = useState(false),
    [monthlyVersion, setMonthlyVersion] = useState<number | null>(null);
  const monthlyInitialized = useRef(false);
  const monthRequest = useRef(0);
  const [label, setLabel] = useState(""),
    [starts, setStarts] = useState(""),
    [ends, setEnds] = useState(""),
    [preview, setPreview] = useState<Row[]>([]),
    [fileName, setFileName] = useState("");
  const [periodId, setPeriodId] = useState(""),
    [shift, setShift] = useState<Row>({
      work_date: "",
      first_name: "",
      starts_at: "",
      ends_at: "",
      status: "active",
    }),
    [shiftId, setShiftId] = useState(""),
    [shiftVersion, setShiftVersion] = useState(0);
  const [notice, setNotice] = useState(blank),
    [noticeId, setNoticeId] = useState(""),
    [noticeVersion, setNoticeVersion] = useState(0);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [schedule, info, figures] = await Promise.all([
        api<{ periods: Period[]; shifts: Shift[] }>(
          "/admin/station/v2/schedule",
        ),
        api<Notice[]>("/admin/station/v2/notices"),
        api<Monthly[]>("/admin/station/v2/monthly"),
      ]);
      setPeriods(schedule.periods);
      setShifts(schedule.shifts);
      setNotices(info);
      setMonthly(figures);
      if (!monthlyInitialized.current) {
        const latest = figures.find((row) => row.month === previousMonth());
        if (latest) {
          setMetrics(monthlyDraft(latest.metrics));
          setLegacyMonth(latest.legacy);
          setMonthlyVersion(latest.revision);
        }
        monthlyInitialized.current = true;
      }
      setPeriodId((p) => p || schedule.periods[0]?.id || "");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function chooseFile(file: File | null) {
    if (!file) return;
    setError("");
    try {
      const content = await file.text();
      const parsed = parseScheduleCsv(content);
      setPreview(parsed);
      setFileName(file.name);
      setStarts(
        parsed.reduce(
          (a, r) => (a < r.work_date ? a : r.work_date),
          parsed[0].work_date,
        ),
      );
      setEnds(
        parsed.reduce(
          (a, r) => (a > r.work_date ? a : r.work_date),
          parsed[0].work_date,
        ),
      );
    } catch (e) {
      setPreview([]);
      setFileName("");
      setError((e as Error).message);
    }
  }
  async function importSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!preview.length) return;
    if (findScheduleConflicts(preview, shifts).length) {
      setError("Rätta dubbletter och överlapp innan import.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(
        "/admin/station/v2/schedule/import",
        send("POST", {
          label,
          starts_on: starts,
          ends_on: ends,
          shifts: preview,
        }),
      );
      setPreview([]);
      setFileName("");
      setLabel("");
      setMessage("Schemat importerades.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function editShift(row: Shift) {
    setShiftId(row.id);
    setPeriodId(row.period_id);
    setShiftVersion(row.revision);
    setShift({
      work_date: row.work_date,
      first_name: row.first_name,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      status: row.status,
    });
  }
  async function saveShift(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        shiftId
          ? `/admin/station/v2/shifts/${shiftId}`
          : "/admin/station/v2/shifts",
        send(
          shiftId ? "PUT" : "POST",
          shiftId
            ? { ...shift, expected_revision: shiftVersion }
            : { ...shift, period_id: periodId },
        ),
      );
      setShiftId("");
      setShift({
        work_date: "",
        first_name: "",
        starts_at: "",
        ends_at: "",
        status: "active",
      });
      setMessage("Arbetspasset sparades.");
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function saveNotice(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        noticeId
          ? `/admin/station/v2/notices/${noticeId}`
          : "/admin/station/v2/notices",
        send(noticeId ? "PUT" : "POST", {
          title: notice.title,
          message: notice.message,
          published: notice.published,
          expires_on: notice.expires_on || null,
          expires_time: notice.expires_time || null,
          ...(noticeId ? { expected_revision: noticeVersion } : {}),
        }),
      );
      setNoticeId("");
      setNotice(blank);
      setMessage("Meddelandet sparades.");
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function deleteNotice(row: Notice) {
    if (!window.confirm(`Ta bort ”${row.title}”?`)) return;
    try {
      await api(
        `/admin/station/v2/notices/${row.id}`,
        send("DELETE", { expected_revision: row.revision }),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
    }
  }
  async function chooseMonth(value: string) {
    const request = ++monthRequest.current;
    setMonth(value);
    setError("");
    if (!value) return;
    try {
      const row = await api<Monthly>(`/admin/station/v2/monthly/${value}`);
      if (request !== monthRequest.current) return;
      setMetrics(monthlyDraft(row.metrics));
      setLegacyMonth(row.legacy);
      setMonthlyVersion(row.revision);
    } catch (e) { if (request === monthRequest.current) setError((e as Error).message); }
  }
  async function saveMonthly(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ revision: number }>(
        `/admin/station/v2/monthly/${month}`,
        send("PUT", {
          metrics: parseMonthlyDraft(metrics),
          expected_revision: monthlyVersion,
        }),
      );
      setMonthlyVersion(result.revision);
      setMessage("Månadens siffror sparades.");
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  const previewConflicts = preview.length ? findScheduleConflicts(preview, shifts) : [];
  return (
    <div className="v2-admin-sections">
      <section className="station-admin-card" id="station-schedule">
        <span className="station-card-index">04 / SCHEMA</span>
        <h2>Arbetsschema</h2>
        <p>
          Importera CSV med rubrikerna{" "}
          <code>datum,förnamn,start,slut,status</code>. Status kan vara active,
          cancelled, leave eller sick. Ett pass som slutar tidigare än det
          börjar löper över midnatt.
        </p>
        <form onSubmit={(e) => void importSchedule(e)}>
          <label>
            Periodens namn
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={100}
              required
              placeholder="Vecka 41–44"
            />
          </label>
          <div className="v2-admin-pair">
            <label>
              Från
              <input
                type="date"
                value={starts}
                onChange={(e) => setStarts(e.target.value)}
                required
              />
            </label>
            <label>
              Till
              <input
                type="date"
                value={ends}
                onChange={(e) => setEnds(e.target.value)}
                required
              />
            </label>
          </div>
          <label>
            CSV-fil
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void chooseFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {preview.length > 0 && (
            <>
              <p role="status">
                Förhandsgranskning: {preview.length} pass från {fileName}. Inget
                sparas förrän du väljer Importera.
              </p>
              {previewConflicts.length > 0 && (
                <div role="alert" className="station-error">
                  <p>Importen är stoppad tills följande konflikter har rättats:</p>
                  <ul>
                    {previewConflicts.slice(0, 8).map((conflict, i) => (
                      <li key={i}>
                        Rad {conflict.row + 1}: {conflict.kind === "duplicate" ? "dubblett" : "överlappande aktivt pass"}
                        {conflict.existing ? " med ett befintligt pass" : ` med rad ${(conflict.otherRow ?? 0) + 1}`}.
                      </li>
                    ))}
                  </ul>
                  {previewConflicts.length > 8 && <p>Ytterligare {previewConflicts.length - 8} konflikter finns.</p>}
                </div>
              )}
              <div className="v2-admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Förnamn</th>
                      <th>Start</th>
                      <th>Slut</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i}>
                        <td>{row.work_date}</td>
                        <td>{row.first_name}</td>
                        <td>{row.starts_at}</td>
                        <td>{row.ends_at}</td>
                        <td>{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="station-primary" disabled={busy || previewConflicts.length > 0}>
                Importera {preview.length} pass
              </button>
            </>
          )}
        </form>
        <h3>Registrerade perioder</h3>
        {periods.length ? (
          periods.map((p) => (
            <p key={p.id}>
              <strong>{p.label}</strong> · {p.starts_on}–{p.ends_on} ·
              Uppdaterad{" "}
              {new Date(p.updated_at).toLocaleString("sv-SE", {
                timeZone: "Europe/Stockholm",
              })}
            </p>
          ))
        ) : (
          <p>Inget schema registrerat.</p>
        )}
        {periods.length > 0 && (
          <>
            <h3>Rätta eller lägg till pass</h3>
            <form onSubmit={(e) => void saveShift(e)}>
              <label>
                Schemaperiod
                <select
                  value={periodId}
                  onChange={(e) => setPeriodId(e.target.value)}
                >
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="v2-admin-pair">
                <label>
                  Datum
                  <input
                    type="date"
                    value={shift.work_date}
                    onChange={(e) =>
                      setShift({ ...shift, work_date: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Förnamn
                  <input
                    value={shift.first_name}
                    onChange={(e) =>
                      setShift({ ...shift, first_name: e.target.value })
                    }
                    maxLength={60}
                    required
                  />
                </label>
                <label>
                  Start
                  <input
                    type="time"
                    value={shift.starts_at}
                    onChange={(e) =>
                      setShift({ ...shift, starts_at: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Slut
                  <input
                    type="time"
                    value={shift.ends_at}
                    onChange={(e) =>
                      setShift({ ...shift, ends_at: e.target.value })
                    }
                    required
                  />
                </label>
              </div>
              <label>
                Status
                <select
                  value={shift.status}
                  onChange={(e) =>
                    setShift({ ...shift, status: e.target.value })
                  }
                >
                  <option value="active">Arbetar</option>
                  <option value="cancelled">Inställt</option>
                  <option value="leave">Ledig</option>
                  <option value="sick">Sjukfrånvaro</option>
                </select>
              </label>
              <button className="station-primary" disabled={busy}>
                {shiftId ? "Spara ändring" : "Lägg till pass"}
              </button>
              {shiftId && (
                <button
                  type="button"
                  onClick={() => {
                    setShiftId("");
                    setShift({
                      work_date: "",
                      first_name: "",
                      starts_at: "",
                      ends_at: "",
                      status: "active",
                    });
                  }}
                >
                  Avbryt redigering
                </button>
              )}
            </form>
            <div className="v2-admin-table">
              <table>
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Förnamn</th>
                    <th>Tid</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((s) => (
                    <tr key={s.id}>
                      <td>{s.work_date}</td>
                      <td>{s.first_name}</td>
                      <td>
                        {s.starts_at}–{s.ends_at}
                      </td>
                      <td>{s.status}</td>
                      <td>
                        <button onClick={() => editShift(s)}>Ändra</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      <section className="station-admin-card" id="station-notices">
        <span className="station-card-index">05 / VIKTIG INFO</span>
        <h2>Meddelanden till personalen</h2>
        <form onSubmit={(e) => void saveNotice(e)}>
          <label>
            Rubrik
            <input
              value={notice.title}
              onChange={(e) => setNotice({ ...notice, title: e.target.value })}
              maxLength={100}
              required
            />
          </label>
          <label>
            Meddelande
            <textarea
              value={notice.message}
              onChange={(e) =>
                setNotice({ ...notice, message: e.target.value })
              }
              maxLength={1000}
              rows={4}
              required
            />
          </label>
          <label>
            Utgångsdatum (valfritt)
            <input
              type="date"
              value={notice.expires_on}
              onChange={(e) =>
                setNotice({
                  ...notice,
                  expires_on: e.target.value,
                  expires_time: e.target.value ? notice.expires_time : "",
                })
              }
            />
          </label>
          <label>
            Sluttid i Tingsryd (valfritt)
            <input
              type="time"
              value={notice.expires_time}
              disabled={!notice.expires_on}
              onChange={(e) => setNotice({ ...notice, expires_time: e.target.value })}
            />
          </label>
          <label className="v2-admin-checkbox">
            <input
              type="checkbox"
              checked={notice.published}
              onChange={(e) =>
                setNotice({ ...notice, published: e.target.checked })
              }
            />{" "}
            Publicerat
          </label>
          <button className="station-primary" disabled={busy}>
            {noticeId ? "Spara ändring" : "Skapa meddelande"}
          </button>
          {noticeId && (
            <button
              type="button"
              onClick={() => {
                setNotice(blank);
                setNoticeId("");
              }}
            >
              Avbryt redigering
            </button>
          )}
        </form>
        <div className="v2-admin-notices">
          {notices.map((n) => (
            <article key={n.id}>
              <strong>{n.title}</strong>
              <span>
                {n.published ? "Publicerat" : "Utkast"}
                {n.expires_on
                  ? ` · Till ${n.expires_on}${n.expires_time ? ` ${n.expires_time}` : ""}`
                  : ""}
              </span>
              <p>{n.message}</p>
              <button
                onClick={() => {
                  setNoticeId(n.id);
                  setNoticeVersion(n.revision);
                  setNotice({
                    title: n.title,
                    message: n.message,
                    published: !!n.published,
                    expires_on: n.expires_on ?? "",
                    expires_time: n.expires_time ?? "",
                  });
                }}
              >
                Ändra
              </button>
              <button onClick={() => void deleteNotice(n)}>Ta bort</button>
            </article>
          ))}
        </div>
      </section>
      <section className="station-admin-card v2-monthly-admin" id="station-monthly">
        <span className="station-card-index">06 / MÅNADSSIFFROR</span>
        <h2>Förra månadens siffror</h2>
        <p>Välj en avslutad månad. Alla procentsatser matas in manuellt. Lämna ett fält tomt om värdet saknas.</p>
        <form onSubmit={(e) => void saveMonthly(e)}>
          <label>
            Månad
            <input type="month" value={month} max={previousMonth()} required
              onChange={(e) => void chooseMonth(e.target.value)} />
          </label>
          {legacyMonth && <p className="v25-legacy" role="status">Denna månad innehåller äldre fria värden. De är bevarade och kan inte skrivas över av det nya formuläret.</p>}
          <div className="v25-admin-grid">
            {MONTHLY_CATEGORIES.map(({ key, label, unit, fields }) => (
              <fieldset key={key} className={key === "economic_result" ? "v25-result-editor" : "v25-category-editor"} disabled={legacyMonth}>
                <legend>{label}</legend>
                <div className="v25-field-grid">
                  {fields.map((field) => {
                    const fieldLabel = field === "current" ? "Aktuellt värde" : field === "previous" ? "Föregående år" : field === "percent" ? "Förändring" : "Ekonomiskt resultat";
                    const suffix = field === "percent" ? "%" : unit === "antal" ? "antal" : unit;
                    const percentage = field === "percent" ? parseSwedishNumber(metrics[`${key}.${field}`] ?? "") : null;
                    return <label key={field}>{fieldLabel}
                      <span className="v25-input-wrap"><input inputMode="decimal" type="text" value={metrics[`${key}.${field}`] ?? ""} aria-label={`${label} – ${fieldLabel}`}
                        onChange={(e) => setMetrics((current) => ({ ...current, [`${key}.${field}`]: e.target.value }))} /><span>{suffix}</span></span>
                      {percentage !== null && Number.isFinite(percentage) && <output className={monthlyTone(percentage)}>{formatMonthlyNumber(percentage, "%", true)}</output>}
                    </label>;
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="v2-monthly-actions">
            <button className="station-primary" disabled={busy || !month || legacyMonth}>
              Spara månad
            </button>
          </div>
        </form>
        {monthly.length > 0 && (
          <div className="v2-monthly-list">
            <h3>Registrerade månader</h3>
            {monthly.map((row) => (
              <button key={row.month} onClick={() => void chooseMonth(row.month)}>
                {row.month}{row.legacy ? " · äldre format" : ""}
              </button>
            ))}
          </div>
        )}
      </section>
      {error && (
        <p className="station-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="station-notice" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
