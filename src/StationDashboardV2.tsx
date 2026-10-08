import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  CarFront,
  Check,
  ChevronRight,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
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
type Monthly = {
  month: string;
  metrics: { label: string; value: string; unit: string; order: number }[];
  updated_at: string | null;
};
type WeatherPeriod = { time: string; temperature: number; symbol: number };
type Weather = {
  source: "SMHI SNOW1gv1";
  kind: "forecast";
  now: WeatherPeriod | null;
  tomorrow: WeatherPeriod | null;
};
function weatherDisplay(symbol: number) {
  if (symbol === 1) return { label: "Klart", Icon: Sun };
  if (symbol <= 4) return { label: "Växlande molnighet", Icon: CloudSun };
  if (symbol <= 6) return { label: "Molnigt", Icon: Cloud };
  if (symbol === 7) return { label: "Dimma", Icon: CloudFog };
  if ([11, 21].includes(symbol)) return { label: "Åska", Icon: CloudLightning };
  if (symbol >= 15 && symbol <= 17 || symbol >= 25 && symbol <= 27)
    return { label: "Snö", Icon: CloudSnow };
  if (symbol >= 8 && symbol <= 10 || symbol >= 18 && symbol <= 20)
    return { label: "Regn", Icon: CloudRain };
  if (symbol >= 12 && symbol <= 14 || symbol >= 22 && symbol <= 24)
    return { label: "Snöblandat regn", Icon: CloudDrizzle };
  return { label: "Väderläge", Icon: Cloud };
}
function WeatherItem({ label, period }: { label: string; period: WeatherPeriod | null }) {
  const display = period ? weatherDisplay(period.symbol) : null;
  return (
    <div className="v2-weather-item">
      <span className="v2-weather-label">{label}</span>
      <span className="v2-weather-value">
        {display && <display.Icon aria-hidden="true" />}
        {period ? `${Math.round(period.temperature)}°` : "—"}
        <small>{display?.label ?? "Prognos saknas"}</small>
      </span>
    </div>
  );
}
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
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    month: "long", year: "numeric", timeZone: "Europe/Stockholm",
  }).format(new Date(`${month}-01T12:00:00Z`));

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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
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
        if (document.activeElement === dialog.current) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && document.activeElement === first) {
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
  }, []);
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
  const [weather, setWeather] = useState<Weather | null>(null);
  const [modal, setModal] = useState<
    "shifts" | "tasks" | "notices" | "monthly" | null
  >(null);
  const [monthly, setMonthly] = useState<Monthly | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyError, setMonthlyError] = useState(false);
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
      setError("Kunde inte hämta stationsuppgifterna. Försök igen.");
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
  const loadWeather = useCallback(async () => {
    try {
      const result = await api<Weather>("/station/weather");
      setWeather(result.kind === "forecast" ? result : null);
    } catch {
      setWeather(null);
    }
  }, []);
  useEffect(() => {
    void loadWeather();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadWeather();
    }, 30 * 60_000);
    const visible = () => {
      if (document.visibilityState === "visible") void loadWeather();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [loadWeather]);
  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTask.trim()) return;
    setBusy(true);
    try {
      await api("/station/v2/tasks", send("POST", { text: newTask.trim() }));
      setNewTask("");
      await load();
    } catch (e) {
      setError("Uppgiften kunde inte sparas. Försök igen.");
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
      setError("Ändringen kunde inte sparas. Listan har uppdaterats.");
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function openMonthly() {
    setModal("monthly");
    setMonthlyLoading(true);
    setMonthlyError(false);
    try {
      setMonthly(await api<Monthly>("/station/v2/monthly"));
    } catch {
      setMonthlyError(true);
    } finally {
      setMonthlyLoading(false);
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
          <span className="v2-updated">
            <CalendarDays aria-hidden="true" />{" "}
            {last ? `Uppdaterad ${time(last)}` : "Uppdatering saknas"}
          </span>
          <i />
          <div className="v2-weather" aria-label="SMHI väderprognos för Tingsryd">
            <WeatherItem label="PROGNOS JUST NU" period={weather?.now ?? null} />
            <WeatherItem label="IMORGON CA 12" period={weather?.tomorrow ?? null} />
            <span className="v2-weather-source">SMHI · prognos</span>
          </div>
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
            <p className="v2-business-date">
              {summary ? `Igår · ${date(summary.business_date)}` : ""}
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
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle className="v2-ring-track" cx="60" cy="60" r="51" />
                <circle className="v2-ring-fill" cx="60" cy="60" r="51" />
              </svg>
              <div>
                <strong>
                  {summary?.percent === null || !summary
                    ? "—"
                    : pct(summary.percent)}
                </strong>
                <span>MOT 52 VECKOR TIDIGARE</span>
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
                    aria-pressed={!!t.done}
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
          <button className="v2-monthly-cta" onClick={() => void openMonthly()}>
            Förra månadens siffror <ChevronRight size={17} aria-hidden="true" />
          </button>
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
              <button onClick={() => setModal("notices")}>
                {notices.length > 1
                  ? "Visa alla meddelanden"
                  : "Läs hela meddelandet"}{" "}
                <ChevronRight size={15} />
              </button>
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
                aria-pressed={!!t.done}
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
      {modal === "monthly" && (
        <Modal title="Förra månadens siffror" onClose={() => setModal(null)}>
          {monthlyLoading ? (
            <p>Hämtar månadens siffror…</p>
          ) : monthlyError ? (
            <p role="alert">
              Kunde inte hämta månadens siffror.{" "}
              <button onClick={() => void openMonthly()}>Försök igen</button>
            </p>
          ) : monthly ? (
            <>
              <p className="v2-monthly-month">{monthLabel(monthly.month)}</p>
              {monthly.metrics.length ? (
                <dl className="v2-monthly-metrics">
                  {monthly.metrics.map((item, index) => (
                    <div key={index}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}{item.unit ? ` ${item.unit}` : ""}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>Inga månadssiffror har registrerats ännu.</p>
              )}
            </>
          ) : null}
        </Modal>
      )}
    </div>
  );
}
