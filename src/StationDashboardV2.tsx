import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  CarFront,
  Check,
  ChevronRight,
  ClipboardCheck,
  Info,
  Plus,
  Sun,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { api, HttpError, send } from "./api";

type Summary = {
  business_date: string;
  comparison_date: string;
  net_sales_ore: number | null;
  comparison_sales_ore: number | null;
  difference_ore: number | null;
  percent: number | null;
  updated_at: string | null;
  week: { date: string; net_sales_ore: number | null }[];
};
type Shift = {
  id: string;
  first_name: string;
  starts_at: string;
  ends_at: string;
};
type Task = {
  id: string;
  text: string;
  done: number;
  revision: number;
  created_at: string;
};
type Notice = {
  id: string;
  title: string;
  message: string;
  updated_at: string;
};
type Overview = {
  today: string;
  shifts: Shift[];
  tasks: Task[];
  notices: Notice[];
  updated_at: string | null;
};
const kronor = (ore: number) =>
  new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: ore % 100 ? 2 : 0,
  }).format(ore / 100);
const signed = (ore: number) => `${ore > 0 ? "+" : ""}${kronor(ore)}`;
const pct = (value: number) =>
  `${value > 0 ? "+" : ""}${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(value)} %`;
const date = (day: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Stockholm",
  }).format(new Date(`${day}T12:00:00Z`));
const time = (value: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  }).format(new Date(value));
const weekday = (day: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    weekday: "short",
    timeZone: "Europe/Stockholm",
  })
    .format(new Date(`${day}T12:00:00Z`))
    .replace(".", "");

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && dialog.current) {
        const items = [
          ...dialog.current.querySelectorAll<HTMLElement>(
            "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]",
          ),
        ];
        if (!items.length) {
          e.preventDefault();
          return;
        }
        const first = items[0],
          last = items.at(-1)!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("keydown", keys);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="v2-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        className="v2-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button aria-label="Stäng" onClick={onClose}>
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export default function StationDashboardV2() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"shifts" | "tasks" | "notices" | null>(
    null,
  );
  const [newTask, setNewTask] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [sales, other] = await Promise.all([
        api<Summary>("/station/dashboard"),
        api<Overview>("/station/v2"),
      ]);
      setSummary(sales);
      setOverview(other);
      setError("");
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        window.location.replace("/station/login");
        return;
      }
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60000);
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [load]);
  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTask.trim()) return;
    setBusy(true);
    try {
      await api("/station/v2/tasks", send("POST", { text: newTask.trim() }));
      setNewTask("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function updateTask(task: Task, action: "toggle" | "edit" | "delete") {
    let updated = task.text;
    if (action === "edit") {
      const answer = window.prompt("Ändra uppgift", task.text);
      if (answer === null) return;
      updated = answer.trim();
      if (!updated) return;
    }
    if (
      action === "delete" &&
      !window.confirm(`Ta bort uppgiften ”${task.text}”?`)
    )
      return;
    setBusy(true);
    try {
      await api(
        `/station/v2/tasks/${task.id}`,
        send(
          action === "delete" ? "DELETE" : "PUT",
          action === "delete"
            ? { expected_revision: task.revision }
            : {
                text: updated,
                done: action === "toggle" ? !task.done : !!task.done,
                expected_revision: task.revision,
              },
        ),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  const tasks = overview?.tasks ?? [];
  const shifts = overview?.shifts ?? [];
  const notices = overview?.notices ?? [];
  const done = tasks.filter((t) => t.done).length;
  const tone =
    summary?.percent === null || summary?.percent === undefined
      ? "neutral"
      : summary.percent < 0
        ? "negative"
        : "positive";
  const message =
    summary?.net_sales_ore === null || !summary
      ? "Gårdagens resultat väntar på registrering."
      : summary.percent === null
        ? "Tillsammans framåt, team Tingsryd!"
        : summary.percent < 0
          ? "Ny dag, nya möjligheter för team Tingsryd."
          : "Starkt jobbat, team Tingsryd!";
  const last = [summary?.updated_at, overview?.updated_at]
    .filter(Boolean)
    .sort()
    .at(-1);
  const bars = summary?.week ?? [];
  const chart = bars.filter((b) => b.net_sales_ore !== null).length >= 3;
  const maximum = Math.max(1, ...bars.map((b) => b.net_sales_ore ?? 0));
  return (
    <div className="station-v2-shell">
      <header className="v2-header">
        <div className="v2-brand">
          <img className="v2-logo-slot" src="/preem-logo.png" alt="Preem" />
          <div>
            <h1>PREEM TINGSRYD</h1>
            <p>Stationsdashboard</p>
          </div>
        </div>
        <div className="v2-header-right">
          <span>
            <CalendarDays aria-hidden="true" />{" "}
            {last ? `Uppdaterad ${time(last)}` : "Uppdatering saknas"}
          </span>
          <i />
          <span>
            <Sun aria-hidden="true" /> Tillsammans
            <br />
            skapar vi en bättre resa
          </span>
        </div>
      </header>
      <main className="v2-layout">
        <section
          className="v2-sales-card"
          aria-label="Gårdagens butiksförsäljning"
        >
          <div className="v2-sales-copy">
            <p className="v2-eyebrow">
              GÅRDAGENS BUTIKSFÖRSÄLJNING · EXKL. MOMS
            </p>
            <div className="v2-amount" aria-live="polite">
              {summary
                ? summary.net_sales_ore === null
                  ? "—"
                  : kronor(summary.net_sales_ore)
                : "Hämtar…"}
            </div>
            {summary?.net_sales_ore === null && (
              <p className="v2-empty-sale">
                Gårdagens försäljning är ännu inte registrerad.
              </p>
            )}
            <div className={`v2-change ${tone}`}>
              <span className="v2-trend" aria-hidden="true">
                <ArrowUpRight />
              </span>
              <strong>
                {summary?.percent === null || !summary
                  ? "—"
                  : pct(summary.percent)}
              </strong>
            </div>
            <p className="v2-change-caption">
              Mot samma veckodag 52 veckor tidigare
            </p>
            <dl className="v2-comparison">
              <div>
                <dt>Jämförelsedag:</dt>
                <dd>{summary ? date(summary.comparison_date) : "—"}</dd>
              </div>
              <div>
                <dt>Jämförelsevärde:</dt>
                <dd>
                  {summary?.comparison_sales_ore === null || !summary
                    ? "Saknas"
                    : kronor(summary.comparison_sales_ore)}
                </dd>
              </div>
              <div>
                <dt>Skillnad:</dt>
                <dd className={tone}>
                  {summary?.difference_ore === null || !summary
                    ? "—"
                    : signed(summary.difference_ore)}
                </dd>
              </div>
            </dl>
            <p className="v2-message">
              <span className="v2-trophy">
                <Trophy aria-hidden="true" />
              </span>
              <span>{message}</span>
            </p>
          </div>
          <div className="v2-sales-visual">
            <div
              className={`v2-result-ring ${tone}`}
              aria-label="Resultatindikator, bågen är dekorativ och visar ingen skala"
            >
              <div>
                <strong>
                  {summary?.percent === null || !summary
                    ? "—"
                    : pct(summary.percent)}
                </strong>
                <span>
                  {tone === "negative"
                    ? "LÄGRE"
                    : tone === "positive"
                      ? "HÖGRE"
                      : "JÄMFÖRELSE"}
                  <br />
                  ÄN FÖRRA ÅRET
                </span>
              </div>
            </div>
            <div className="v2-chart">
              {chart ? (
                bars.map((bar, i) => (
                  <div key={bar.date} className="v2-bar-column">
                    <div
                      className={`v2-bar ${i === bars.length - 1 ? "current" : ""} ${bar.net_sales_ore === null ? "missing" : ""}`}
                      style={{
                        height:
                          bar.net_sales_ore === null
                            ? 0
                            : `${Math.max(6, Math.round((bar.net_sales_ore / maximum) * 100))}%`,
                      }}
                      title={
                        bar.net_sales_ore === null
                          ? `${bar.date}: saknas`
                          : `${bar.date}: ${kronor(bar.net_sales_ore)}`
                      }
                    />
                    <span>{weekday(bar.date)}</span>
                  </div>
                ))
              ) : (
                <p>Diagram visas när fler dagsvärden finns.</p>
              )}
            </div>
            <small>Framåt tillsammans ♡</small>
          </div>
        </section>
        <div className="v2-side">
          <section className="v2-panel v2-shifts">
            <div className="v2-panel-head">
              <h2>
                <Users /> IDAG JOBBAR
              </h2>
            </div>
            {shifts.length ? (
              shifts.slice(0, 3).map((s) => (
                <div className="v2-shift-row" key={s.id}>
                  <span className="v2-avatar">{s.first_name.charAt(0)}</span>
                  <strong>{s.first_name}</strong>
                  <time>
                    {s.starts_at}–{s.ends_at}
                  </time>
                </div>
              ))
            ) : (
              <p className="v2-panel-empty">
                Inget arbetsschema registrerat för idag.
              </p>
            )}
            {shifts.length > 3 && (
              <button className="v2-more" onClick={() => setModal("shifts")}>
                Visa alla {shifts.length} pass
              </button>
            )}
          </section>
          <section className="v2-panel v2-tasks">
            <div className="v2-panel-head">
              <h2>
                <ClipboardCheck /> DAGENS TO-DO
              </h2>
              <span>
                {done} av {tasks.length} klara
              </span>
            </div>
            <div
              className="v2-progress"
              role="progressbar"
              aria-valuenow={done}
              aria-valuemin={0}
              aria-valuemax={tasks.length || 1}
              aria-label="Färdiga uppgifter"
            >
              <span
                style={{
                  width: `${tasks.length ? (done / tasks.length) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="v2-task-preview">
              {tasks.length ? (
                tasks.slice(0, 4).map((t) => (
                  <button
                    disabled={busy}
                    key={t.id}
                    className={`v2-task-row ${t.done ? "done" : ""}`}
                    onClick={() => void updateTask(t, "toggle")}
                  >
                    <span className="v2-check">
                      {t.done ? <Check /> : null}
                    </span>
                    <span>{t.text}</span>
                  </button>
                ))
              ) : (
                <p className="v2-panel-empty">Inga uppgifter för idag.</p>
              )}
            </div>
            <button
              className="v2-task-manage"
              onClick={() => setModal("tasks")}
            >
              <Plus size={17} />{" "}
              {tasks.length > 4
                ? "Visa alla och hantera"
                : "Lägg till eller hantera"}
            </button>
          </section>
        </div>
        <div className="v2-station-image">
          <span>Illustrationsbild</span>
          <em>
            Mer än
            <br />
            en tankstation
          </em>
        </div>
        <section className="v2-info v2-panel">
          <div className="v2-panel-head">
            <h2>
              <Info /> VIKTIG INFO
            </h2>
            {notices[0] && <span className="v2-new">NYTT</span>}
          </div>
          {notices[0] ? (
            <>
              <h3>{notices[0].title}</h3>
              <p>{notices[0].message}</p>
              {notices.length > 1 && (
                <button onClick={() => setModal("notices")}>
                  Visa alla meddelanden <ChevronRight size={15} />
                </button>
              )}
            </>
          ) : (
            <p className="v2-panel-empty">Inga aktuella meddelanden.</p>
          )}
        </section>
        <a className="v2-wash" href="/">
          <CarFront aria-hidden="true" />
          <span>
            ÖPPNA
            <br />
            TVÄTTLIGAN
          </span>
          <ChevronRight aria-hidden="true" />
        </a>
      </main>
      <footer className="v2-footer">
        <span>RENARE RESOR. LJUSARE MORGONDAGAR.</span>
        <button
          onClick={() =>
            void api("/station/logout", { method: "POST" }).finally(() =>
              window.location.replace("/station/login"),
            )
          }
        >
          Avsluta visning
        </button>
      </footer>
      {error && (
        <div className="v2-error" role="alert">
          {error} <button onClick={() => void load()}>Försök igen</button>
        </div>
      )}
      {modal === "shifts" && (
        <Modal title="Dagens arbetspass" onClose={() => setModal(null)}>
          <p>{overview ? date(overview.today) : ""}</p>
          {shifts.map((s) => (
            <div className="v2-detail-row" key={s.id}>
              <strong>{s.first_name}</strong>
              <span>
                {s.starts_at}–{s.ends_at}
              </span>
            </div>
          ))}
        </Modal>
      )}
      {modal === "tasks" && (
        <Modal title="Dagens to-do" onClose={() => setModal(null)}>
          <form className="v2-add-task" onSubmit={(e) => void addTask(e)}>
            <input
              aria-label="Ny uppgift"
              maxLength={180}
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="Skriv en ny uppgift"
            />
            <button disabled={busy || !newTask.trim()}>Lägg till</button>
          </form>
          {tasks.map((t) => (
            <div className="v2-detail-row" key={t.id}>
              <button
                disabled={busy}
                onClick={() => void updateTask(t, "toggle")}
              >
                {t.done ? "✓" : "○"} {t.text}
              </button>
              <div>
                <button
                  disabled={busy}
                  onClick={() => void updateTask(t, "edit")}
                >
                  Ändra
                </button>
                <button
                  disabled={busy}
                  onClick={() => void updateTask(t, "delete")}
                >
                  Ta bort
                </button>
              </div>
            </div>
          ))}
        </Modal>
      )}
      {modal === "notices" && (
        <Modal title="Viktig info" onClose={() => setModal(null)}>
          {notices.map((n) => (
            <article className="v2-notice-detail" key={n.id}>
              <h3>{n.title}</h3>
              <p>{n.message}</p>
            </article>
          ))}
        </Modal>
      )}
    </div>
  );
}
