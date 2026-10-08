import { useCallback, useEffect, useState } from "react";
import { api, send } from "./api";
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
  revision: number;
  updated_at: string;
};
type Row = Omit<Shift, "id" | "period_id" | "revision" | "updated_at">;
const blank = { title: "", message: "", published: false, expires_on: "" };

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
    [notices, setNotices] = useState<Notice[]>([]);
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
      const [schedule, info] = await Promise.all([
        api<{ periods: Period[]; shifts: Shift[] }>(
          "/admin/station/v2/schedule",
        ),
        api<Notice[]>("/admin/station/v2/notices"),
      ]);
      setPeriods(schedule.periods);
      setShifts(schedule.shifts);
      setNotices(info);
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
      setError((e as Error).message);
    }
  }
  async function importSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!preview.length) return;
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
  return (
    <div className="v2-admin-sections">
      <section className="station-admin-card">
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
              <button className="station-primary" disabled={busy}>
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
      <section className="station-admin-card">
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
                setNotice({ ...notice, expires_on: e.target.value })
              }
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
                {n.expires_on ? ` · Till ${n.expires_on}` : ""}
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
