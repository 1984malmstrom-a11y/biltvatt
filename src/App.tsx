import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  CarFront,
  Clock3,
  Download,
  Home,
  LockKeyhole,
  LogOut,
  Plus,
  Settings,
  Sparkles,
  Target,
  Undo2,
  Users,
  X,
  RefreshCw,
  Bell,
} from "lucide-react";
import type { Staff, WashProgram, Sale, Stats } from "./types";
import { api, HttpError, sek, send } from "./api";
import {
  AdminSales,
  ResetStatistics,
  StaffMaintenance,
} from "./AdminMaintenance";
import { leaguePeriodLabel } from "../shared/business";
import { AdminNotifications, PushControls } from "./PushControls";
import {
  Avatar,
  Brand,
  CarArt,
  Dashboard,
  Empty,
  PeriodPicker,
  RestrictedNote,
  StationLogo,
} from "./components";

const descriptions: Record<string, string> = {
  preemium: "Vår mest kompletta tvätt",
  "finast-plus": "Extra ren och extra glans",
  hosttvatt: "Tar hand om bilen i tuffa tider",
  finast: "En riktigt bra tvätt",
  fin: "Ren och fräsch",
  borstlos: "Skonsam och effektiv",
};
const programImages: Record<string, string> = {
  preemium: "/wash-programs/preemium",
  "finast-plus": "/wash-programs/finast-plus",
  hosttvatt: "/wash-programs/hosttvatt",
  finast: "/wash-programs/finast",
  fin: "/wash-programs/fin",
  borstlos: "/wash-programs/borstlos",
};
const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(
    new Date(),
  );
type Page = "home" | "sale" | "stats" | "admin";
type AdminTab =
  | "overview"
  | "staff"
  | "sales"
  | "notifications"
  | "programs"
  | "goals"
  | "statistics"
  | "export"
  | "settings";
const adminTabs = [
  ["overview", "Översikt", Home],
  ["staff", "Personal", Users],
  ["sales", "Försäljningar", Clock3],
  ["notifications", "Notiser", Bell],
  ["programs", "Tvättprogram", CarFront],
  ["goals", "Mål", Target],
  ["statistics", "Statistik", BarChart3],
  ["export", "Exportera", Download],
  ["settings", "Inställningar", Settings],
] as const;

export default function App() {
  const [page, setPage] = useState<Page>(() =>
    new URLSearchParams(window.location.search).get("view") === "stats"
      ? "stats"
      : "home",
  );
  const [staff, setStaff] = useState<Staff[]>([]),
    [programs, setPrograms] = useState<WashProgram[]>([]);
  const [selected, setSelected] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [last, setLast] = useState<(Sale & { program_name: string }) | null>(
    null,
  );
  const [pending, setPending] = useState<{
    staff_id: string;
    wash_program_id: string;
    request_id: string;
  } | null>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState("today"),
    [start, setStart] = useState(today()),
    [end, setEnd] = useState(today());
  const [stats, setStats] = useState<Stats | null>(null),
    [statsError, setStatsError] = useState(""),
    [statsBusy, setStatsBusy] = useState(false),
    [scope, setScope] = useState("team");
  const [admin, setAdmin] = useState(false),
    [adminTab, setAdminTab] = useState<AdminTab>("overview");
  const [pin, setPin] = useState("");
  const [allStaff, setAllStaff] = useState<Staff[]>([]),
    [allPrograms, setAllPrograms] = useState<WashProgram[]>([]);
  const [goals, setGoals] = useState({ daily_goal: 25, monthly_goal: 500 });
  const [staffEdit, setStaffEdit] = useState<Staff | null>(null),
    [addStaff, setAddStaff] = useState(false);
  const [draftName, setDraftName] = useState(""),
    [draftColor, setDraftColor] = useState("#0676ed");
  const modalRef = useRef<HTMLElement>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const statsSequence = useRef(0);
  const periodQuery = new URLSearchParams({
    period,
    ...(period === "custom" ? { start, end } : {}),
  }).toString();

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [people, washes] = await Promise.all([
        api<Staff[]>("/staff"),
        api<WashProgram[]>("/wash-programs"),
      ]);
      setStaff(people);
      setPrograms(washes);
      setSelected((current) =>
        current ? (people.find((p) => p.id === current.id) ?? null) : null,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);
  const loadStats = useCallback(async () => {
    const sequence = ++statsSequence.current;
    setStatsBusy(true);
    setStatsError("");
    try {
      const personal = page === "stats" && scope !== "team";
      const result = await api<Stats>(
        `${personal ? `/stats/staff/${encodeURIComponent(scope)}` : "/stats"}?${periodQuery}`,
      );
      if (sequence === statsSequence.current) setStats(result);
    } catch (e) {
      if (sequence === statsSequence.current) {
        setStats(null);
        setStatsError((e as Error).message);
      }
    } finally {
      if (sequence === statsSequence.current) setStatsBusy(false);
    }
  }, [page, scope, periodQuery]);
  useEffect(() => {
    if (page !== "stats" && !(page === "admin" && admin)) return;
    void loadStats();
    const timer = window.setInterval(() => void loadStats(), 30000);
    return () => {
      clearInterval(timer);
      statsSequence.current++;
    };
  }, [page, admin, loadStats]);
  useEffect(() => {
    if (page !== "admin") return;
    api<{ daily_goal: number; monthly_goal: number }>("/admin/settings")
      .then((value) => {
        setGoals(value);
        setAdmin(true);
      })
      .catch((e) => {
        if (e instanceof HttpError && e.status === 401) setAdmin(false);
        else setError(e.message);
      });
  }, [page]);
  const refreshAdmin = useCallback(async () => {
    const [people, washes, settings] = await Promise.all([
      api<Staff[]>("/staff?all=1"),
      api<WashProgram[]>("/wash-programs?all=1"),
      api<typeof goals>("/admin/settings"),
    ]);
    setAllStaff(people);
    setAllPrograms(washes);
    setGoals(settings);
  }, []);
  const maintenanceChanged = useCallback(async () => {
    await Promise.all([refreshAdmin(), loadCatalog(), loadStats()]);
  }, [refreshAdmin, loadCatalog, loadStats]);
  const maintenanceUnauthorized = useCallback(() => setAdmin(false), []);
  const maintenanceProps = {
    staff: allStaff,
    programs: allPrograms,
    onChanged: maintenanceChanged,
    onUnauthorized: maintenanceUnauthorized,
  };
  useEffect(() => {
    if (admin) refreshAdmin().catch((e) => setError(e.message));
  }, [admin, refreshAdmin]);
  const navigate = (target: Page) => {
    if (busyRef.current || pending) return;
    setError("");
    setNotice("");
    setPage(target);
  };
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const open = (event: MessageEvent) => {
      if (
        event.data?.type !== "TVATTLIGAN_OPEN" ||
        !["stats", "home"].includes(event.data.view)
      )
        return;
      if (busyRef.current || pending) {
        setNotice(
          "Slutför den aktuella registreringen innan du öppnar notisens sida.",
        );
        return;
      }
      setPage(event.data.view);
      setError("");
    };
    navigator.serviceWorker.addEventListener("message", open);
    return () => navigator.serviceWorker.removeEventListener("message", open);
  }, [pending]);
  const chooseStaff = (person: Staff) => {
    setSelected(person);
    setLast(null);
    setError("");
    setNotice("");
    setPage("sale");
  };
  async function register(program: WashProgram, retry = false) {
    if (!selected || busyRef.current || (pending && !retry)) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const payload =
      retry && pending
        ? pending
        : {
            staff_id: selected.id,
            wash_program_id: program.id,
            request_id: crypto.randomUUID(),
          };
    try {
      const sale = await api<Sale>("/sales", send("POST", payload));
      setLast({ ...sale, program_name: program.name });
      setPending(null);
      setNotice(
        sale.voided_at
          ? "Den här registreringen har redan ångrats."
          : "Registrerad",
      );
    } catch (e) {
      if (!(e instanceof HttpError) || e.status >= 500) {
        setPending(payload);
        setError(
          "Svaret kunde inte bekräftas. Tryck på ”Försök igen” för samma registrering – den räknas aldrig dubbelt.",
        );
      } else {
        setPending(null);
        setError(e.message);
        if (e.status === 400) void loadCatalog();
      }
    } finally {
      // Keep the click lock through a double tap, including very fast local responses.
      window.setTimeout(() => {
        busyRef.current = false;
        setBusy(false);
      }, 650);
    }
  }
  async function undo() {
    if (!last || busyRef.current || last.voided_at) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await api(
        "/sales/" + last.id + "/void",
        send("POST", { request_id: last.request_id }),
      );
      setLast({ ...last, voided_at: new Date().toISOString() });
      setNotice("Senaste tvätten har ångrats.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function adminAction(action: () => Promise<unknown>, success: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await refreshAdmin();
      await loadCatalog();
      void loadStats();
      setNotice(success);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof HttpError && e.status === 401) setAdmin(false);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    await adminAction(async () => {
      await api("/admin/login", send("POST", { pin }));
      setPin("");
      setAdmin(true);
    }, "Du är inloggad.");
  }
  async function logout() {
    try {
      await api("/admin/logout", { method: "POST" });
      setAdmin(false);
      setAllStaff([]);
      setAllPrograms([]);
      setNotice("Du är utloggad.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function exportCsv() {
    setExportBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/export?${periodQuery}`);
      if (!response.ok)
        throw new Error(((await response.json()) as { error: string }).error);
      const blob = await response.blob(),
        href = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = href;
      link.download = `tvattligan-${start}-${end}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setNotice("Exporten är hämtad.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExportBusy(false);
    }
  }
  const picker = (
    <PeriodPicker {...{ period, setPeriod, start, end, setStart, setEnd }} />
  );
  const statsView = (
    <>
      {statsError && (
        <div className="alert error" role="alert">
          {statsError}
          <button onClick={() => void loadStats()}>Försök igen</button>
        </div>
      )}
      {statsBusy && !stats && <p className="loading">Hämtar statistik…</p>}
      {stats && (
        <Dashboard
          stats={stats}
          periodLabel={leaguePeriodLabel(
            period,
            stats.range.start,
            stats.range.end,
          )}
          primary={page === "stats"}
          compareTeam={!(page === "stats" && scope !== "team")}
        />
      )}
    </>
  );
  const editPerson = (person?: Staff) => {
    setStaffEdit(person ?? null);
    setAddStaff(!person);
    setDraftName(person?.name ?? "");
    setDraftColor(person?.color ?? "#0676ed");
    setError("");
  };
  useEffect(() => {
    if (!staffEdit && !addStaff) return;
    const previous = document.activeElement as HTMLElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) {
        setStaffEdit(null);
        setAddStaff(false);
      }
      if (e.key !== "Tab") return;
      const elements = [
        ...(modalRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled)",
        ) ?? []),
      ];
      const first = elements[0],
        last = elements.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [staffEdit, addStaff]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          className="brand-button"
          onClick={() => navigate("home")}
          aria-label="Till startsidan"
          disabled={busy || !!pending}
        >
          <Brand />
        </button>
        <div className="header-right">
          {page === "sale" && selected ? (
            <>
              <div className="seller-pill">
                <Avatar person={selected} small />
                <strong>Säljare: {selected.name}</strong>
              </div>
              <button
                className="button secondary"
                onClick={() => navigate("home")}
                disabled={busy || !!pending}
              >
                <Users size={17} /> Byt säljare
              </button>
            </>
          ) : page === "admin" ? (
            <div className="seller-pill">
              <LockKeyhole size={24} />
              <div>
                <strong>Admin</strong>
                <small>Systeminställningar</small>
              </div>
            </div>
          ) : (
            <div className="header-motto">
              Renare bilar
              <br />
              Gladare kunder
              <br />
              Starkare team
            </div>
          )}
          <StationLogo />
        </div>
      </header>
      <nav className="main-nav" aria-label="Huvudmeny">
        <button
          onClick={() => navigate(selected ? "sale" : "home")}
          className={page === "home" || page === "sale" ? "active" : ""}
          disabled={busy || !!pending}
        >
          <CarFront size={18} /> Registrera
        </button>
        <button
          onClick={() => navigate("stats")}
          className={page === "stats" ? "active" : ""}
          disabled={busy || !!pending}
        >
          <BarChart3 size={18} /> Statistik
        </button>
        <button
          onClick={() => navigate("admin")}
          className={`admin-nav ${page === "admin" ? "active" : ""}`}
          disabled={busy || !!pending}
        >
          <LockKeyhole size={16} /> Admin
        </button>
      </nav>
      {error && (
        <div className="alert error" role="alert">
          <span>{error}</span>
          {pending ? (
            <button
              disabled={busy}
              onClick={() => {
                const p = programs.find(
                  (x) => x.id === pending.wash_program_id,
                );
                if (p) void register(p, true);
              }}
            >
              Försök igen
            </button>
          ) : (
            <button
              className="icon-button"
              onClick={() => setError("")}
              aria-label="Stäng felmeddelande"
            >
              <X size={18} />
            </button>
          )}
        </div>
      )}
      {notice && page !== "sale" && (
        <div className="alert success" role="status">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}
      {page === "home" && (
        <main className="panel welcome-panel">
          <div className="welcome-content">
            <span className="eyebrow">
              <Sparkles size={16} /> ETT LAG. EN RENARE VARDAG.
            </span>
            <h1>Välj ditt namn</h1>
            <p className="welcome-subtitle">
              Välj vem du är för att registrera försäljning
              <br className="desktop-break" /> och se din statistik.
            </p>
            {loading ? (
              <p className="loading">Hämtar personal…</p>
            ) : (
              <div className="staff-grid">
                {staff.map((person) => (
                  <button
                    key={person.id}
                    className="staff-card"
                    onClick={() => chooseStaff(person)}
                    style={{ "--accent": person.color } as React.CSSProperties}
                  >
                    <Avatar person={person} />
                    <strong>{person.name}</strong>
                    <span>
                      Välj <ArrowRight size={14} />
                    </span>
                  </button>
                ))}
              </div>
            )}
            {!loading && !staff.length && (
              <Empty>Ingen aktiv personal. Lägg till en säljare i Admin.</Empty>
            )}
            {error && (
              <button
                className="button secondary"
                onClick={() => void loadCatalog()}
              >
                <RefreshCw size={16} /> Hämta igen
              </button>
            )}
            <div className="welcome-footer">
              <Sparkles size={24} />
              <span>Tillsammans skapar vi en renare vardag!</span>
            </div>
          </div>
        </main>
      )}
      {page === "sale" && (
        <main className="panel sales-panel">
          {!selected ? (
            <Empty>
              Välj en aktiv säljare på startsidan.
              <button className="button" onClick={() => navigate("home")}>
                Välj säljare
              </button>
            </Empty>
          ) : (
            <>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">REDO FÖR NÄSTA TVÄTT</span>
                  <h1>Välj tvättprogram</h1>
                </div>
                <p>Ett tryck. Klart.</p>
              </div>
              <div className="wash-grid">
                {programs.map((program) => (
                  <button
                    className={`wash-card ${program.id}`}
                    key={program.id}
                    disabled={busy || !!pending}
                    onClick={() => void register(program)}
                    aria-label={`Registrera ${program.name}, ${sek(program.price_sek)}`}
                  >
                    <span className="wash-image" aria-hidden="true">
                      {programImages[program.id] ? (
                        <img
                          src={`${programImages[program.id]}-600.webp`}
                          srcSet={`${programImages[program.id]}-600.webp 600w, ${programImages[program.id]}-1200.webp 1200w`}
                          sizes="(max-width: 760px) 45vw, (max-width: 1100px) 30vw, 410px"
                          alt=""
                          width={1200}
                          height={529}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <CarArt tone={program.id} />
                      )}
                    </span>
                    <div className="wash-copy">
                      <strong>{program.name}</strong>
                      <span>
                        {descriptions[program.id] ?? "En renare vardag"}
                      </span>
                      <b>{sek(program.price_sek)}</b>
                    </div>
                  </button>
                ))}
              </div>
              {!programs.length && <Empty>Inga aktiva tvättprogram.</Empty>}
              <div className="sale-footer">
                <button
                  className="button secondary undo-button"
                  disabled={!last || !!last.voided_at || busy || !!pending}
                  onClick={() => void undo()}
                >
                  <Undo2 size={19} /> Ångra senaste
                </button>
                <div className="last-sale" role="status" aria-live="polite">
                  {last ? (
                    <>
                      <div>
                        <small>Senast registrerat:</small>
                        <strong>{last.program_name}</strong>
                      </div>
                      <span
                        className={`confirmation ${last.voided_at ? "voided" : ""}`}
                      >
                        <CheckCircle2 size={19} />
                        {last.voided_at ? "Ångrad" : "Registrerad"}
                      </span>
                      <span className="last-time">
                        <Clock3 size={14} />
                        {new Intl.DateTimeFormat("sv-SE", {
                          timeZone: "Europe/Stockholm",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(last.sold_at))}
                      </span>
                    </>
                  ) : (
                    <span className="muted">
                      Din nästa registrering visas här.
                    </span>
                  )}
                </div>
                <span className="handwritten">
                  Bra jobbat!
                  <i />
                </span>
              </div>
              {busy && (
                <p className="sr-only" role="status">
                  Registreringen behandlas…
                </p>
              )}
              {notice && (
                <span className="sr-only" role="status">
                  {notice}
                </span>
              )}
            </>
          )}
        </main>
      )}
      {page === "stats" && (
        <main className="panel statistics-panel">
          <div className="section-heading">
            <div>
              <h1>Statistik</h1>
              <p>Följ resultaten, jämför och gör varje dag lite bättre.</p>
            </div>
            {picker}
          </div>
          <div className="stats-toolbar">
            <label>
              Visa statistik för{" "}
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="team">Hela laget</option>
                {staff.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="text-button"
              disabled={statsBusy}
              onClick={() => void loadStats()}
            >
              <RefreshCw size={15} /> Uppdatera
            </button>
            <span className="muted small-text">
              Europe/Stockholm · {stats?.range.start} – {stats?.range.end}
            </span>
          </div>
          {statsView}
        </main>
      )}
      {page === "admin" && !admin && (
        <main className="panel login-panel">
          <div className="login-icon">
            <LockKeyhole size={32} />
          </div>
          <span className="eyebrow">TVÄTTLIGAN ADMIN</span>
          <h1>Välkommen tillbaka</h1>
          <p>Logga in för att hantera lagets inställningar.</p>
          <form onSubmit={(e) => void login(e)}>
            <label>
              Administratörs-PIN
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]{6,12}"
                minLength={6}
                maxLength={12}
                autoComplete="current-password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
                placeholder="Ange din PIN"
              />
            </label>
            <button className="button" disabled={busy}>
              <LockKeyhole size={17} />
              {busy ? "Loggar in…" : "Logga in"}
            </button>
          </form>
          <RestrictedNote />
        </main>
      )}
      {page === "admin" && admin && (
        <main className="panel admin-panel">
          <aside className="admin-sidebar" aria-label="Administrationsmeny">
            {adminTabs.map(([key, label, Icon]) => (
              <button
                key={key}
                className={adminTab === key ? "selected" : ""}
                onClick={() => {
                  setAdminTab(key);
                  setNotice("");
                  setError("");
                }}
              >
                <Icon size={19} />
                {label}
              </button>
            ))}
            <div className="sidebar-bottom">
              <button onClick={() => void logout()}>
                <LogOut size={17} /> Logga ut
              </button>
              <small>Version 1.0.0</small>
            </div>
          </aside>
          <div className="admin-content">
            <div className="section-heading">
              <div>
                <h1>{adminTabs.find(([key]) => key === adminTab)?.[1]}</h1>
                <p>
                  {adminTab === "staff"
                    ? "Hantera personal som kan sälja biltvättar i systemet."
                    : adminTab === "programs"
                      ? "Aktuella priser, ordning och tillgänglighet."
                      : "Ett starkare team gör skillnad."}
                </p>
              </div>
              {adminTab === "staff" && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => editPerson()}
                >
                  <Plus size={18} /> Lägg till personal
                </button>
              )}
            </div>
            {(adminTab === "overview" || adminTab === "statistics") && (
              <>
                <div className="admin-period">{picker}</div>
                {statsView}
              </>
            )}
            {adminTab === "sales" && <AdminSales {...maintenanceProps} />}
            {adminTab === "notifications" && (
              <AdminNotifications
                staff={allStaff}
                dailyGoal={goals.daily_goal}
                onUnauthorized={maintenanceUnauthorized}
              />
            )}
            {adminTab === "statistics" && (
              <ResetStatistics {...maintenanceProps} />
            )}
            {adminTab === "staff" && (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Namn</th>
                        <th>Aktiv</th>
                        <th>Totalt sålda*</th>
                        <th>Omsättning*</th>
                        <th>Snittköp*</th>
                        <th>Åtgärder</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allStaff.map((p) => {
                        const s = stats?.staff.find((s) => s.id === p.id);
                        return (
                          <tr key={p.id}>
                            <td>
                              <div className="person-cell">
                                <Avatar person={p} small />
                                {p.name}
                              </div>
                            </td>
                            <td>
                              <span
                                className={`status-dot ${p.active ? "" : "inactive"}`}
                              />
                              {p.deleted_at
                                ? "Arkiverad"
                                : p.active
                                  ? "Ja"
                                  : "Nej"}
                            </td>
                            <td>{s?.count ?? 0}</td>
                            <td>{sek(s?.revenue ?? 0)}</td>
                            <td>{sek(s?.average ?? 0)}</td>
                            <td>
                              <button
                                className="button tiny secondary"
                                disabled={busy || !!p.deleted_at}
                                onClick={() => editPerson(p)}
                              >
                                Redigera
                              </button>
                              <button
                                className="text-button"
                                disabled={busy || !!p.deleted_at}
                                onClick={() =>
                                  void adminAction(
                                    () =>
                                      api(
                                        "/admin/staff/" + p.id,
                                        send("PATCH", {
                                          active: p.active ? 0 : 1,
                                        }),
                                      ),
                                    p.active
                                      ? "Säljaren är inaktiverad. Historik bevaras."
                                      : "Säljaren är aktiverad.",
                                  )
                                }
                              >
                                {p.active ? "Inaktivera" : "Aktivera"}
                              </button>
                              <StaffMaintenance
                                person={p}
                                onChanged={maintenanceChanged}
                                onUnauthorized={maintenanceUnauthorized}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="muted small-text">
                  * Statistik för vald period: {stats?.range.start} –{" "}
                  {stats?.range.end}. Ändra perioden under Statistik. Historiken
                  bevaras för inaktiv personal.
                </p>
                {statsError && (
                  <p role="alert" className="error-text">
                    {statsError}
                  </p>
                )}
              </>
            )}
            {adminTab === "programs" && (
              <div className="program-admin-grid">
                {allPrograms.map((p) => (
                  <form
                    className={`program-editor ${p.id}`}
                    key={`${p.id}-${p.price_sek}-${p.sort_order}-${p.active}`}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      void adminAction(
                        () =>
                          api(
                            "/admin/wash-programs/" + p.id,
                            send("PATCH", {
                              price_sek: Number(data.get("price")),
                              sort_order: Number(data.get("order")),
                              active: data.get("active") ? 1 : 0,
                            }),
                          ),
                        "Tvättprogrammet är uppdaterat. Tidigare försäljningspriser bevaras.",
                      );
                    }}
                  >
                    <h3>{p.name}</h3>
                    <div className="form-row">
                      <label>
                        Pris (kr)
                        <input
                          name="price"
                          type="number"
                          min="0"
                          max="10000"
                          step="1"
                          defaultValue={p.price_sek}
                          required
                        />
                      </label>
                      <label>
                        Ordning
                        <input
                          name="order"
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          defaultValue={p.sort_order}
                          required
                        />
                      </label>
                    </div>
                    <label className="checkbox-label">
                      <input
                        name="active"
                        type="checkbox"
                        defaultChecked={!!p.active}
                      />{" "}
                      Aktivt tvättprogram
                    </label>
                    <button className="button secondary" disabled={busy}>
                      <Check size={16} /> Spara
                    </button>
                  </form>
                ))}
              </div>
            )}
            {adminTab === "goals" && (
              <form
                className="settings-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void adminAction(
                    () => api("/admin/settings", send("PUT", goals)),
                    "Lagets mål är sparade.",
                  );
                }}
              >
                <div className="info-box">
                  <Target size={24} />
                  <p>
                    Ge laget något att sikta på. Målen gäller hela laget och
                    räknar endast registrerade, ej ångrade tvättar.
                  </p>
                </div>
                <label>
                  Dagligt tvättmål
                  <input
                    type="number"
                    min="0"
                    max="1000000"
                    step="1"
                    required
                    value={goals.daily_goal}
                    onChange={(e) =>
                      setGoals({ ...goals, daily_goal: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Månatligt tvättmål
                  <input
                    type="number"
                    min="0"
                    max="1000000"
                    step="1"
                    required
                    value={goals.monthly_goal}
                    onChange={(e) =>
                      setGoals({
                        ...goals,
                        monthly_goal: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <button className="button" disabled={busy}>
                  <Check size={17} /> Spara mål
                </button>
              </form>
            )}
            {adminTab === "export" && (
              <div className="export-panel">
                <div className="info-box">
                  <Download size={26} />
                  <p>
                    Hämta försäljningar som CSV för svensk Excel. Exporten
                    innehåller datum, tid, säljare, tvättprogram, pris och
                    status, även för makulerade tvättar.
                  </p>
                </div>
                {picker}
                <button
                  className="button"
                  disabled={
                    exportBusy ||
                    (period === "custom" && (!start || !end || start > end))
                  }
                  onClick={() => void exportCsv()}
                >
                  <Download size={18} />
                  {exportBusy ? "Hämtar…" : "Hämta CSV"}
                </button>
                <p className="muted">
                  UTF-8 med BOM · Semikolon · Europe/Stockholm
                </p>
              </div>
            )}
            {adminTab === "settings" && (
              <div className="settings-details">
                <h3>Tryggt. Enkelt. Effektivt.</h3>
                <dl>
                  <dt>Applikation</dt>
                  <dd>Tvättligan 1.0.0</dd>
                  <dt>Station</dt>
                  <dd>Preem Tingsryd</dd>
                  <dt>Tidszon</dt>
                  <dd>Europe/Stockholm</dd>
                  <dt>Administratörsåtkomst</dt>
                  <dd>PIN skyddas på servern. Sessionen gäller i 8 timmar.</dd>
                  <dt>Byta PIN</dt>
                  <dd>
                    Ändra Worker-hemligheten ADMIN_PIN i Cloudflare eller
                    .dev.vars lokalt. Använd 6–12 siffror.
                  </dd>
                  <dt>Datakvalitet</dt>
                  <dd>
                    Ångrade tvättar bevaras i historiken. Tidigare priser ändras
                    aldrig.
                  </dd>
                </dl>
                <button
                  className="button secondary"
                  onClick={() => void logout()}
                >
                  <LogOut size={17} /> Logga ut
                </button>
              </div>
            )}
            <div className="admin-footer">
              <RestrictedNote />
              <span className="handwritten">
                Ett starkare team
                <br />
                gör skillnad!
                <i />
              </span>
            </div>
          </div>
        </main>
      )}
      {(staffEdit || addStaff) && (
        <div className="modal-backdrop">
          <section
            ref={modalRef}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-dialog-title"
          >
            <div className="section-heading">
              <h2 id="staff-dialog-title">
                {addStaff ? "Lägg till personal" : "Ändra personal"}
              </h2>
              <button
                className="icon-button"
                disabled={busy}
                onClick={() => {
                  setStaffEdit(null);
                  setAddStaff(false);
                }}
                aria-label="Stäng"
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void adminAction(async () => {
                  await api(
                    addStaff ? "/admin/staff" : "/admin/staff/" + staffEdit!.id,
                    send(addStaff ? "POST" : "PATCH", {
                      name: draftName,
                      color: draftColor,
                    }),
                  );
                  setStaffEdit(null);
                  setAddStaff(false);
                }, "Personalen är sparad.");
              }}
            >
              <label>
                Namn
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  maxLength={40}
                  required
                />
              </label>
              <label>
                Avatarfärg
                <input
                  className="color-input"
                  type="color"
                  value={draftColor}
                  onChange={(e) => setDraftColor(e.target.value)}
                />
              </label>
              {error && (
                <p className="error-text" role="alert">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setStaffEdit(null);
                    setAddStaff(false);
                  }}
                >
                  Avbryt
                </button>
                <button className="button" disabled={busy}>
                  <Check size={17} /> Spara
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      <PushControls staff={staff} disabled={busy || !!pending} />
      <footer className="app-footer">
        <span>Tvättligan · Preem Tingsryd</span>
        <span>
          Renare resor varje dag <Sparkles size={14} />
        </span>
      </footer>
    </div>
  );
}
