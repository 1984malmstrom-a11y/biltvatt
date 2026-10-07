import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { api, HttpError, sek, send } from "./api";
import type { Staff, WashProgram } from "./types";

interface Row {
  id: string;
  staff_id: string;
  staff_name: string;
  deleted_at: string | null;
  wash_program_id: string;
  program_name: string;
  price_sek: number;
  sold_at: string;
  voided_at: string | null;
  void_reason: string | null;
  revision: number;
}
interface Preview {
  id: string;
  label: string;
  period_label: string;
  count: number;
  revenue: number;
}
interface Batch {
  id: string;
  label: string;
  period_label: string;
  count: number;
  revenue: number;
  created_at: string;
  restorable_count: number;
}
interface Audit {
  id: number;
  action: string;
  actor: string;
  changed_at: string;
  before_json: string;
  after_json: string;
}
interface Props {
  staff: Staff[];
  programs: WashProgram[];
  onChanged: () => Promise<void>;
  onUnauthorized: () => void;
}
const day = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(
    new Date(),
  );
const date = (value: string, time = false) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    ...(time
      ? { hour: "2-digit", minute: "2-digit" }
      : { year: "numeric", month: "2-digit", day: "2-digit" }),
  }).format(new Date(value));

function Dialog({
  title,
  children,
  close,
  busy,
  returnFocus,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  busy: boolean;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLElement>(null),
    id = useId(),
    busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    const prior =
      returnFocus.current ?? (document.activeElement as HTMLElement | null);
    const panel = ref.current!;
    const focusable = () => [
      ...panel.querySelectorAll<HTMLElement>(
        "button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex='0']",
      ),
    ];
    (focusable()[0] ?? panel).focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) close();
      if (e.key === "Tab") {
        const elements = focusable(),
          first = elements[0],
          last = elements.at(-1);
        if (!first) {
          e.preventDefault();
          panel.focus();
        } else if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === panel)
        ) {
          e.preventDefault();
          last!.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      prior?.focus();
    };
  }, [close, returnFocus]);
  return createPortal(
    <div className="modal-backdrop">
      <section
        ref={ref}
        tabIndex={-1}
        className="modal maintenance-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <div className="section-heading">
          <h2 id={id}>{title}</h2>
          <button
            className="icon-button"
            disabled={busy}
            onClick={close}
            aria-label="Stäng"
          >
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}
function useActions(props: Pick<Props, "onChanged" | "onUnauthorized">) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const run = async (action: () => Promise<void>, changed = false) => {
    if (lock.current) return;
    const focused = document.activeElement as HTMLElement | null;
    if (focused && !focused.closest('[role="dialog"]'))
      returnFocus.current = focused;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (changed) {
        await props.onChanged();
        setNotice(
          "Ändringen är sparad. Statistik och historik är uppdaterade.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Åtgärden misslyckades.");
      if (e instanceof HttpError && e.status === 401) props.onUnauthorized();
    } finally {
      lock.current = false;
      setBusy(false);
      requestAnimationFrame(() => {
        if (
          !document.querySelector('[role="dialog"]') &&
          returnFocus.current?.isConnected
        )
          returnFocus.current.focus();
      });
    }
  };
  const feedback = (
    <>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="maintenance-notice" role="status">
          {notice}
        </p>
      )}
    </>
  );
  return { busy, error, setError, run, feedback, returnFocus };
}
export function StaffMaintenance({
  person,
  ...props
}: Omit<Props, "staff" | "programs"> & { person: Staff }) {
  const actions = useActions(props);
  const [preview, setPreview] = useState<Preview | null>(null),
    [restore, setRestore] = useState(false);
  const close = useCallback(() => {
    setPreview(null);
    setRestore(false);
  }, []);
  return (
    <>
      <button
        className="text-button maintenance-danger"
        disabled={actions.busy}
        onClick={() =>
          void actions.run(async () => {
            if (person.deleted_at) setRestore(true);
            else
              setPreview(
                await api<Preview>(
                  `/admin/staff/${person.id}/deletion-preview`,
                ),
              );
          })
        }
      >
        {person.deleted_at ? "Återställ säljare" : "Radera"}
      </button>
      {!preview && !restore && actions.feedback}
      {(preview || restore) && (
        <Dialog
          title={restore ? "Återställ säljare" : "Radera säljare"}
          close={close}
          busy={actions.busy}
          returnFocus={actions.returnFocus}
        >
          {restore ? (
            <p>
              {person.name} återställs som inaktiv. Ingen försäljning återställs
              automatiskt. Aktivera säljaren och återställ vid behov enskilda
              registreringar under Försäljningar.
            </p>
          ) : (
            <>
              <p>
                <strong>{person.name}</strong> har {preview!.count} registrerade
                försäljningar.
              </p>
              <p>
                {preview!.count
                  ? "Säljaren arkiveras och försvinner från namnval och topplistor. Aktiva registreringar makuleras; försäljningshistorik och auditspår bevaras."
                  : "Säljaren saknar försäljningshistorik och raderas permanent. Åtgärden kan inte återställas."}
              </p>
              <p className="muted">
                Historiskt registrerat belopp, inklusive makulerat:{" "}
                {sek(preview!.revenue)}.
              </p>
            </>
          )}
          {actions.feedback}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={actions.busy}
              onClick={close}
            >
              Avbryt
            </button>
            <button
              className="button danger"
              disabled={actions.busy}
              onClick={() =>
                void actions.run(async () => {
                  await api(
                    `/admin/staff/${person.id}${restore ? "/restore" : ""}`,
                    send(
                      restore ? "POST" : "DELETE",
                      restore
                        ? { confirmation: "ÅTERSTÄLL" }
                        : { preview_id: preview!.id, confirmation: "RADERA" },
                    ),
                  );
                  close();
                }, true)
              }
            >
              {actions.busy
                ? "Sparar…"
                : restore
                  ? "Återställ säljare"
                  : preview!.count
                    ? "Radera säljare och nollställ statistik"
                    : "Radera säljare permanent"}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function PeriodFields({
  period,
  setPeriod,
  start,
  setStart,
  end,
  setEnd,
  prefix,
  disabled = false,
}: {
  period: string;
  setPeriod: (s: string) => void;
  start: string;
  setStart: (s: string) => void;
  end: string;
  setEnd: (s: string) => void;
  prefix: string;
  disabled?: boolean;
}) {
  return (
    <>
      <label>
        {prefix}period
        <select
          disabled={disabled}
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="today">Idag</option>
          <option value="week">Denna vecka</option>
          <option value="month">Denna månad</option>
          <option value="custom">Valfri period</option>
          <option value="all">All historik</option>
        </select>
      </label>
      {period === "custom" && (
        <>
          <label>
            {prefix}från datum
            <input
              disabled={disabled}
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </label>
          <label>
            {prefix}till datum
            <input
              disabled={disabled}
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              required
            />
          </label>
        </>
      )}
    </>
  );
}
export function AdminSales(props: Props) {
  const actions = useActions(props);
  const [period, setPeriod] = useState("today"),
    [start, setStart] = useState(day()),
    [end, setEnd] = useState(day());
  const [staffId, setStaffId] = useState(""),
    [programId, setProgramId] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Row | null>(null),
    [mode, setMode] = useState("edit"),
    [draftStaff, setDraftStaff] = useState(""),
    [draftProgram, setDraftProgram] = useState(""),
    [audit, setAudit] = useState<Audit[]>([]);
  const [version, setVersion] = useState(0);
  const close = useCallback(() => setSelected(null), []);
  useEffect(() => {
    setPage(1);
  }, [period, start, end, staffId, programId, status]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    setRows([]);
    const query = new URLSearchParams({
      period,
      start,
      end,
      staff_id: staffId,
      wash_program_id: programId,
      status,
      page: String(page),
    });
    void api<{ rows: Row[]; total: number }>("/admin/sales?" + query, {
      signal: controller.signal,
    })
      .then((data) => {
        setRows(data.rows);
        setTotal(data.total);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setLoadError(e.message);
          if (e instanceof HttpError && e.status === 401)
            props.onUnauthorized();
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    period,
    start,
    end,
    staffId,
    programId,
    status,
    page,
    version,
    props.onUnauthorized,
  ]);
  const price =
    selected && draftProgram === selected.wash_program_id
      ? selected.price_sek
      : props.programs.find((p) => p.id === draftProgram)?.price_sek;
  const open = (row: Row, next: string) => {
    const focused = document.activeElement as HTMLElement | null;
    if (focused && !focused.closest('[role="dialog"]'))
      actions.returnFocus.current = focused;
    actions.setError("");
    setSelected(row);
    setMode(next);
    setDraftStaff(row.staff_id);
    setDraftProgram(row.wash_program_id);
  };
  return (
    <section className="maintenance-section" aria-label="Försäljningshistorik">
      <p className="muted">
        Korrigera felregistreringar med bevarad historik. Makulerade
        registreringar räknas inte i statistiken.
      </p>
      <div className="maintenance-filters">
        <PeriodFields
          {...{ period, setPeriod, start, setStart, end, setEnd }}
          prefix="Historik: "
        />
        <label>
          Säljare
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">Alla säljare</option>
            {props.staff.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.deleted_at ? " (arkiverad)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tvättprogram
          <select
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
          >
            <option value="">Alla program</option>
            {props.programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Alla statusar</option>
            <option value="registered">Registrerad</option>
            <option value="voided">Makulerad</option>
          </select>
        </label>
      </div>
      {loadError && (
        <p role="alert" className="error-text">
          {loadError}
        </p>
      )}
      {!selected && actions.feedback}
      <p className="maintenance-mobile-hint muted small-text">
        Svep tabellen åt sidan för att se status och åtgärder.
      </p>
      <div
        className="table-scroll"
        role="region"
        aria-label="Registreringar, bläddra åt sidan på mindre skärmar"
        tabIndex={0}
      >
        <table className="sales-history">
          <thead>
            <tr>
              {[
                "Datum",
                "Tid",
                "Säljare",
                "Tvättprogram",
                "Pris",
                "Status",
                "Åtgärder",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr>
                <td colSpan={7}>
                  {loading
                    ? "Hämtar registreringar…"
                    : loadError
                      ? "Historiken kunde inte hämtas."
                      : "Inga registreringar för valda filter."}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{date(row.sold_at)}</td>
                <td>{date(row.sold_at, true)}</td>
                <td>
                  {row.staff_name}
                  {row.deleted_at && (
                    <small className="muted"> (arkiverad)</small>
                  )}
                </td>
                <td>{row.program_name}</td>
                <td>{sek(row.price_sek)}</td>
                <td>
                  <span
                    className={`maintenance-status ${row.voided_at ? "voided" : ""}`}
                  >
                    {row.voided_at ? "Makulerad" : "Registrerad"}
                  </span>
                </td>
                <td>
                  <div className="maintenance-row-actions">
                    {!row.voided_at && (
                      <button
                        className="button tiny secondary"
                        disabled={actions.busy}
                        onClick={() => open(row, "edit")}
                      >
                        Redigera
                      </button>
                    )}
                    <button
                      className="text-button"
                      disabled={
                        actions.busy || !!(row.voided_at && row.deleted_at)
                      }
                      onClick={() =>
                        open(row, row.voided_at ? "restore" : "void")
                      }
                    >
                      {row.voided_at ? "Återställ" : "Radera registrering"}
                    </button>
                    <button
                      className="text-button"
                      disabled={actions.busy}
                      onClick={() =>
                        void actions.run(async () => {
                          const data = await api<Audit[]>(
                            `/admin/sales/${row.id}/audit`,
                          );
                          setAudit(data);
                          open(row, "audit");
                        })
                      }
                    >
                      Historik
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="maintenance-pagination">
        <span>
          {loading
            ? "Hämtar…"
            : `${total} registreringar · Sida ${page} av ${Math.max(1, Math.ceil(total / 25))}`}
        </span>
        <div>
          <button
            className="button secondary"
            disabled={loading || actions.busy}
            onClick={() =>
              void actions.run(async () => {
                await props.onChanged();
                setVersion((v) => v + 1);
              })
            }
          >
            Uppdatera
          </button>
          <button
            className="button secondary"
            disabled={loading || page === 1}
            onClick={() => setPage(page - 1)}
          >
            Föregående
          </button>
          <button
            className="button secondary"
            disabled={loading || page * 25 >= total}
            onClick={() => setPage(page + 1)}
          >
            Nästa
          </button>
        </div>
      </div>
      {selected && (
        <Dialog
          title={
            mode === "edit"
              ? "Redigera registrering"
              : mode === "audit"
                ? "Ändringshistorik"
                : mode === "restore"
                  ? "Återställ registrering"
                  : "Radera registrering"
          }
          busy={actions.busy}
          returnFocus={actions.returnFocus}
          close={close}
        >
          <p>
            {selected.staff_name} · {selected.program_name} ·{" "}
            {sek(selected.price_sek)}
            <br />
            <span className="muted">
              {date(selected.sold_at)} kl. {date(selected.sold_at, true)}
            </span>
          </p>
          {mode === "edit" && (
            <div className="maintenance-edit-fields">
              <label>
                Ny säljare
                <select
                  disabled={actions.busy}
                  value={draftStaff}
                  onChange={(e) => setDraftStaff(e.target.value)}
                >
                  {props.staff
                    .filter(
                      (p) =>
                        !p.deleted_at &&
                        (p.active || p.id === selected.staff_id),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Nytt tvättprogram
                <select
                  disabled={actions.busy}
                  value={draftProgram}
                  onChange={(e) => setDraftProgram(e.target.value)}
                >
                  {props.programs
                    .filter(
                      (p) => p.active || p.id === selected.wash_program_id,
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <p className="maintenance-preview">
                Pris efter korrigering: <strong>{sek(price ?? 0)}</strong>
                <br />
                <small>
                  {draftProgram === selected.wash_program_id
                    ? "Historiskt pris bevaras."
                    : "Det nya programmets aktuella pris används."}
                </small>
              </p>
            </div>
          )}
          {mode === "void" && (
            <p>
              Vill du verkligen radera denna registrering? Den makuleras och tas
              bort ur statistiken. Historiken bevaras och registreringen kan
              återställas.
            </p>
          )}
          {mode === "restore" && (
            <p>
              Vill du återställa denna registrering? Den räknas åter i
              statistik, omsättning och topplistor med sitt sparade pris.
            </p>
          )}
          {mode === "audit" && (
            <div className="maintenance-audit">
              {!audit.length && (
                <p>Ingen ändring har gjorts efter registreringen.</p>
              )}
              {audit.map((a) => {
                const before = JSON.parse(a.before_json),
                  after = JSON.parse(a.after_json);
                const staffName = (id: string) =>
                  props.staff.find((p) => p.id === id)?.name ?? id;
                const programName = (id: string) =>
                  props.programs.find((p) => p.id === id)?.name ?? id;
                const labels: Record<string, string> = {
                  ADMIN_CORRECTION: "Korrigerad",
                  ADMIN_VOID: "Makulerad av Admin",
                  ADMIN_RESET: "Nollställd",
                  ADMIN_RESTORE: "Återställd",
                  SELLER_UNDO: "Ångrad av säljare",
                  STAFF_DELETED: "Säljare arkiverad",
                };
                return (
                  <article key={a.id}>
                    <strong>{labels[a.action] ?? a.action}</strong>
                    <p>
                      {date(a.changed_at)} kl. {date(a.changed_at, true)} ·{" "}
                      {a.actor}
                    </p>
                    <small>
                      {staffName(before.staff_id)} /{" "}
                      {programName(before.wash_program_id)} /{" "}
                      {sek(before.price_sek)} → {staffName(after.staff_id)} /{" "}
                      {programName(after.wash_program_id)} /{" "}
                      {sek(after.price_sek)}
                    </small>
                  </article>
                );
              })}
            </div>
          )}
          {actions.feedback}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={actions.busy}
              onClick={close}
            >
              {mode === "audit" ? "Stäng historik" : "Avbryt"}
            </button>
            {mode !== "audit" && (
              <button
                className={`button ${mode === "void" ? "danger" : ""}`}
                disabled={
                  actions.busy ||
                  (mode === "edit" && (price === undefined || !draftStaff))
                }
                onClick={() =>
                  void actions.run(async () => {
                    await api(
                      `/admin/sales/${selected.id}${mode === "edit" ? "" : "/" + mode}`,
                      send(
                        mode === "edit" ? "PATCH" : "POST",
                        mode === "edit"
                          ? {
                              staff_id: draftStaff,
                              wash_program_id: draftProgram,
                              expected_revision: selected.revision,
                              expected_program_price: price,
                            }
                          : {
                              expected_revision: selected.revision,
                              confirmation:
                                mode === "void" ? "RADERA" : "ÅTERSTÄLL",
                            },
                      ),
                    );
                    close();
                    setVersion((v) => v + 1);
                  }, true)
                }
              >
                {actions.busy
                  ? "Sparar…"
                  : mode === "edit"
                    ? "Spara korrigering"
                    : mode === "restore"
                      ? "Återställ registrering"
                      : "Radera registrering"}
              </button>
            )}
          </div>
        </Dialog>
      )}
    </section>
  );
}

export function ResetStatistics(props: Props) {
  const actions = useActions(props);
  const [scope, setScope] = useState("team"),
    [staffId, setStaffId] = useState("");
  const [period, setPeriod] = useState("today"),
    [start, setStart] = useState(day()),
    [end, setEnd] = useState(day());
  const [preview, setPreview] = useState<Preview | null>(null),
    [restoring, setRestoring] = useState(false),
    [confirmation, setConfirmation] = useState("");
  const [highRisk, setHighRisk] = useState(false),
    [batches, setBatches] = useState<Batch[]>([]),
    [historyError, setHistoryError] = useState("");
  const close = useCallback(() => setPreview(null), []);
  const load = useCallback(async () => {
    try {
      setBatches(await api<Batch[]>("/admin/stats/resets"));
      setHistoryError("");
    } catch (e) {
      setHistoryError((e as Error).message);
      if (e instanceof HttpError && e.status === 401) props.onUnauthorized();
    }
  }, [props.onUnauthorized]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="maintenance-section reset-statistics">
      <h2>Nollställ statistik</h2>
      <p className="muted">
        Separat underhållsåtgärd. Registreringar makuleras med auditspår – ingen
        försäljningshistorik raderas permanent.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void actions.run(async () => {
            const data = await api<Preview>(
              "/admin/stats/reset/preview",
              send("POST", {
                scope,
                ...(scope === "staff" ? { staff_id: staffId } : {}),
                period,
                ...(period === "custom" ? { start, end } : {}),
              }),
            );
            setPreview(data);
            setRestoring(false);
            setHighRisk(scope === "team" && period === "all");
            setConfirmation("");
          });
        }}
      >
        <div className="maintenance-filters">
          <label>
            Omfattning
            <select
              value={scope}
              disabled={actions.busy}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="team">Hela laget</option>
              <option value="staff">En säljare</option>
            </select>
          </label>
          {scope === "staff" && (
            <label>
              Säljare att nollställa
              <select
                value={staffId}
                disabled={actions.busy}
                required
                onChange={(e) => setStaffId(e.target.value)}
              >
                <option value="">Välj säljare</option>
                {props.staff
                  .filter((p) => !p.deleted_at)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <PeriodFields
            {...{ period, setPeriod, start, setStart, end, setEnd }}
            prefix="Nollställnings"
            disabled={actions.busy}
          />
        </div>
        <button className="button secondary" disabled={actions.busy}>
          Förhandsgranska nollställning
        </button>
      </form>
      {!preview && actions.feedback}
      <h3>Tidigare nollställningar</h3>
      <p className="muted small-text">
        Visar de 50 senaste. Återställning granskas separat och omfattar endast
        fortfarande makulerade poster från just den nollställningen, vars
        säljare inte är arkiverad.
      </p>
      {historyError && (
        <p className="error-text" role="alert">
          {historyError}
        </p>
      )}
      {!batches.length && !historyError && (
        <p className="muted">Inga nollställningar ännu.</p>
      )}
      {batches.map((b) => (
        <article key={b.id} className="maintenance-batch">
          <div>
            <strong>
              {b.label} · {b.period_label}
            </strong>
            <p>
              {date(b.created_at)} kl. {date(b.created_at, true)} · {b.count}{" "}
              registreringar · {sek(b.revenue)}
            </p>
            <small>{b.restorable_count} registreringar kan återställas</small>
          </div>
          <button
            className="button secondary"
            disabled={actions.busy || !b.restorable_count}
            onClick={() =>
              void actions.run(async () => {
                setPreview(
                  await api<Preview>(
                    "/admin/stats/restore/preview",
                    send("POST", { reset_id: b.id }),
                  ),
                );
                setRestoring(true);
                setHighRisk(false);
                setConfirmation("");
              })
            }
          >
            Granska återställning
          </button>
        </article>
      ))}
      {preview && (
        <Dialog
          title={
            restoring ? "Återställ nollställning" : "Bekräfta nollställning"
          }
          close={close}
          busy={actions.busy}
          returnFocus={actions.returnFocus}
        >
          <div className="maintenance-preview">
            <strong>{preview.label}</strong>
            <p>Period: {preview.period_label}</p>
            <p>
              {preview.count} registreringar · {sek(preview.revenue)}
            </p>
          </div>
          <p>
            {restoring
              ? "Dessa registreringar räknas åter i statistiken med sina bevarade priser. Redan återställda eller ändrade poster berörs inte."
              : "De granskade registreringarna makuleras och räknas inte längre i statistik, mål eller topplistor. Historik och priser bevaras."}
          </p>
          {!restoring && highRisk && (
            <label>
              Skriv NOLLSTÄLL för att bekräfta hela laget och all historik
              <input
                disabled={actions.busy}
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
          )}
          <p className="muted small-text">
            Förhandsgranskningen gäller i 10 minuter. Ändrat underlag kräver en
            ny granskning.
          </p>
          {actions.feedback}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={actions.busy}
              onClick={close}
            >
              Avbryt
            </button>
            <button
              className={`button ${restoring ? "" : "danger"}`}
              disabled={
                actions.busy ||
                !preview.count ||
                (highRisk && confirmation !== "NOLLSTÄLL")
              }
              onClick={() =>
                void actions.run(async () => {
                  await api(
                    `/admin/stats/${restoring ? "restore" : "reset"}`,
                    send("POST", {
                      preview_id: preview.id,
                      confirmation: restoring
                        ? "ÅTERSTÄLL"
                        : highRisk
                          ? confirmation
                          : "NOLLSTÄLL",
                    }),
                  );
                  close();
                  await load();
                }, true)
              }
            >
              {actions.busy
                ? "Sparar…"
                : restoring
                  ? "Återställ granskade registreringar"
                  : "Nollställ granskad statistik"}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
