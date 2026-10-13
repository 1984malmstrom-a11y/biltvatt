import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BarChart3, Check, ChevronLeft, ChevronRight, Crown, Home, RotateCcw, Settings, ShoppingBag, Star, Target, Trophy, Users, X } from "lucide-react";
import { api, HttpError, send } from "./api";
import type { ArenaAchievement, ArenaActivity, ArenaBootstrap, ArenaGoal, ArenaPerson, ArenaRegistration, ArenaStats } from "../shared/arena";
import { arenaAchievement, arenaNumber as num, roundedPoints } from "../shared/arena";
import ArenaDialog from "./ArenaDialog";
import ArenaAdmin from "./ArenaAdmin";
import "./arena.css";

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
function ActivityImage({ activity }: { activity: ArenaActivity }) {
  return activity.image_key ? <img src={`/api/arena/activity-images/${activity.image_key}`} alt="" /> : <ShoppingBag aria-hidden="true" />;
}

export function ArenaActivityButton({ activity, focus = false, campaignName, onClick, imageUrl }: {
  activity: ArenaActivity; focus?: boolean; campaignName?: string; onClick?: () => void; imageUrl?: string;
}) {
  return <button type="button" className={`arena-orb${focus ? " arena-orb-focus" : ""}`} onClick={onClick}
    aria-label={`${activity.name}, +${num(activity.points)} poäng`}>
    {focus && <span className="arena-focus-cap"><Crown className="arena-crown" aria-hidden="true" /><span className="arena-focus-title">{campaignName || "LAGETS FOKUS"}</span></span>}
    <span className="arena-product">
      {(imageUrl || activity.image_key) ? <img src={imageUrl || `/api/arena/activity-images/${activity.image_key}`} alt="" loading={focus ? "eager" : "lazy"} draggable={false} /> : <ShoppingBag aria-hidden="true" />}
    </span>
    <span className="arena-product-copy">{activity.offer_text && <span className="arena-offer">{activity.offer_text}</span>}<strong>{activity.name}</strong>{activity.price_text && <span className="arena-price">{activity.price_text}</span>}</span>
    <span className="arena-points">+{num(activity.points)} POÄNG</span>
  </button>;
}
function Progress({ points, target, label, suffix = "poäng" }: { points: number; target: number; label: string; suffix?: string }) {
  const percent = Math.min(100, Math.round(100 * points / target));
  return <div className="arena-progress"><span><Star aria-hidden="true" />{label}</span><div className="arena-progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(points, target)}>
    <i style={{ "--fill": percent / 100 } as React.CSSProperties} /><strong>{num(points)} / {num(target)} {suffix}</strong><b>{percent}%</b>
  </div></div>;
}
function GoalProgress({ goal }: { goal: ArenaGoal }) {
  return <><Progress points={goal.points} target={goal.target_points} label={goal.period_type === "week" ? "VECKOMÅLET" : goal.period_type === "month" ? "MÅNADENS MÅL" : "LAGETS MÅL"} /><small>{goal.start_date} – {goal.end_date}</small></>;
}
function People({ stats, onPerson, highlightId }: { stats: ArenaStats | null; onPerson: (p: ArenaPerson) => void; highlightId?: string }) {
  return <ol className="arena-leader-list">{stats?.leaderboard.map(p => <li key={p.id} className={highlightId === p.id ? "is-celebrating" : undefined}>
    <button onClick={() => onPerson(p)} aria-label={`${p.name} ${num(p.points)} p`}><span className={`arena-rank rank-${p.rank}`} aria-hidden="true">
      {p.rank <= 3 ? <><Trophy /><b>{p.rank}</b></> : p.rank}</span><span className="arena-leader-avatar" style={{ "--seller-color": p.color } as React.CSSProperties} aria-hidden="true">{initials(p.name)}</span><span>{p.name}{!p.active && <small>Historik</small>}</span><strong>{num(p.points)} <small>p</small></strong>
    </button></li>)}{stats && !stats.leaderboard.length && <li className="arena-empty">Lägg till personal i stationens personalregister.</li>}</ol>;
}
type Attempt = { activity: ArenaActivity; requestId: string; sellerId?: string };
type Receipt = { registration: ArenaRegistration; requestId: string; name: string };
type Celebration = ArenaAchievement & { key: string; points: number; sellerId: string; name: string; activity: ArenaActivity };

function PersonDetails({ person, stats, onClose }: { person: ArenaPerson; stats: ArenaStats; onClose: () => void }) {
  const goals = stats.personal_goals.filter(g => g.seller_id === person.id);
  const goal = goals[0], next = stats.leaderboard[person.rank - 2];
  const percent = goal ? Math.min(100, Math.round(100 * goal.points / goal.target_points)) : 0;
  return <>
    <div className="arena-person-heading"><span className="arena-person-avatar" style={{ "--seller-color": person.color } as React.CSSProperties} aria-hidden="true">{initials(person.name)}<Crown /></span><div><h3>{person.name}</h3><p>Din utveckling. Dina resultat.</p></div><div className="arena-person-rank"><strong>#{person.rank}</strong><small>PLACERING</small></div></div>
    <div className="arena-person-metrics"><div><Star /><small>POÄNG</small><strong>{num(person.points)}</strong></div><div><BarChart3 /><small>REGISTRERINGAR</small><strong>{num(person.count)}</strong></div><div className="arena-person-goal"><Target /><small>{goal ? goal.period_type === "week" ? "VECKOMÅL" : goal.period_type === "month" ? "MÅNADSMÅL" : "PERSONLIGT MÅL" : "PERSONLIGT MÅL"}</small><strong>{goal ? `${num(goal.target_points)} p` : "—"}</strong></div></div>
    <section className="arena-person-progress"><div className="arena-progress-ring" style={{ "--progress": `${percent}%` } as React.CSSProperties} role={goal ? "progressbar" : undefined} aria-label={goal ? "Personligt mål" : undefined} aria-valuemin={goal ? 0 : undefined} aria-valuemax={goal?.target_points} aria-valuenow={goal ? Math.min(goal.points, goal.target_points) : undefined}><span>{goal ? `${percent}%` : <Target />}<small>{goal ? "AV MÅLET" : "NÄSTA MÅL"}</small></span></div><div>{goal ? <><strong>{goal.points >= goal.target_points ? "Målet uppnått!" : `${num(roundedPoints(goal.target_points - goal.points))} poäng kvar`}</strong><p>till {goal.period_type === "week" ? "veckomålet" : goal.period_type === "month" ? "månadsmålet" : "ditt mål"} · {goal.start_date} – {goal.end_date}</p></> : <p>Inget personligt mål för den aktuella dagen.</p>}{next ? <strong className="arena-next-rank">{num(roundedPoints(next.points - person.points))} poäng till nästa placering</strong> : <strong className="arena-next-rank">{person.points > 0 ? "Du leder. Fortsätt på samma spår!" : "Varje registrering tar dig framåt."}</strong>}</div></section>
    {goals.slice(1).map(g => <section className="arena-extra-goal" key={g.id}><GoalProgress goal={g} /><p>{g.points >= g.target_points ? "Målet uppnått!" : `${num(roundedPoints(g.target_points - g.points))} poäng kvar till målet`}</p></section>)}
    <div className="arena-breakdown-heading"><h3>Mina aktiviteter</h3><small>{stats.range.start} – {stats.range.end}</small></div><ul className="arena-breakdown">{person.activities.map(a => <li key={a.id}><ShoppingBag aria-hidden="true" /><div><span>{a.name}</span><strong>{num(a.points)} poäng <small>· {a.count} st</small></strong><i style={{ "--activity-share": `${person.points ? 100 * a.points / person.points : 0}%` } as React.CSSProperties} /></div></li>)}</ul>{!person.activities.length && <p className="arena-breakdown-empty">Din nästa försäljning är början på nästa resultat.</p>}
    <footer className="arena-person-footer"><Trophy /><span><strong>DU GÖR SKILLNAD!</strong><small>Varje registrering räknas.</small></span><button className="arena-gold-action" onClick={onClose}>Fortsätt sälja <ArrowRight /></button></footer>
  </>;
}
function CelebrationCard({ event }: { event: Celebration }) {
  const isGoal = event.kind === "personal-goal" || event.kind === "station-goal";
  const heading = event.kind === "leader" ? "NY ETTA!" : isGoal ? event.goal?.period_type === "week" ? "VECKOMÅL UPPNÅTT!" : "MÅL UPPNÅTT!" : null;
  const encouragement = event.kind === "leader" ? `${event.name} tar förstaplatsen!` : event.kind === "personal-goal" ? `${event.name} · ${event.text}` : event.kind === "station-goal" ? "Hela laget nådde målet!" : event.text;
  return <div className={`arena-celebration${event.special ? " is-special" : ""} celebration-${event.kind}`} role="status">
    <div className="arena-reward-emblem" aria-hidden="true">{isGoal ? <Trophy /> : event.kind === "leader" ? <Crown /> : <Check />}</div>
    <div className="arena-reward-product" aria-hidden="true"><ActivityImage activity={event.activity} /></div>
    <div className="arena-reward-copy"><small className="arena-eyebrow">{event.special ? "STARKARE TILLSAMMANS" : `${event.name} · FÖRSÄLJNING REGISTRERAD`}</small>{heading && <h2>{heading}</h2>}<strong>+{num(event.points)} POÄNG!</strong><span>{encouragement}</span><small className="arena-reward-activity">{event.activity.name}</small></div>
    {isGoal && event.goal && <div className="arena-reward-goal"><Check /><span>{num(event.goal.points)} / {num(event.goal.target_points)} poäng</span></div>}
    {Array.from({ length: event.special ? 12 : 5 }, (_, i) => <i key={i} className="arena-confetti" style={{ "--i": i } as React.CSSProperties} aria-hidden="true" />)}
  </div>;
}
export default function ArenaApp() {
  return window.location.pathname.startsWith("/arena/admin") ? <ArenaAdmin /> : <ArenaHome />;
}
function ArenaHome() {
  const [data, setData] = useState<ArenaBootstrap | null>(null);
  const [stats, setStats] = useState<ArenaStats | null>(null);
  const [period, setPeriod] = useState("today"), [start, setStart] = useState(""), [end, setEnd] = useState("");
  const [activityFilter, setActivityFilter] = useState(""), [category, setCategory] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(null), [busy, setBusy] = useState(false), [saleError, setSaleError] = useState("");
  const [error, setError] = useState(""), [personId, setPersonId] = useState<string | null>(null), [panel, setPanel] = useState<"leaders" | "campaign" | null>(null);
  const [page, setPage] = useState(0), [receipt, setReceipt] = useState<Receipt | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const lock = useRef(false), statsRef = useRef(stats), attemptRef = useRef<Attempt | null>(null), statsVersion = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastCelebrated = useRef("");
  const query = new URLSearchParams({ period, ...(period === "custom" ? { start, end } : {}), ...(activityFilter ? { activity_id: activityFilter } : {}), ...(category ? { category } : {}) }).toString();
  const queryRef = useRef(query); queryRef.current = query;
  const refresh = useCallback(async () => {
    const version = ++statsVersion.current;
    try {
      const next = await api<ArenaStats>(`/arena/stats?${queryRef.current}`);
      if (version === statsVersion.current) { statsRef.current = next; setStats(next); setError(""); }
      return next;
    } catch (e) { if (version === statsVersion.current) setError((e as Error).message); return null; }
  }, []);
  const bootstrap = useCallback(async () => {
    try { setData(await api<ArenaBootstrap>("/arena/bootstrap")); setError(""); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => {
    document.documentElement.classList.add("arena-view");
    void bootstrap();
    const timer = setInterval(() => { if (!document.hidden && !lock.current && !attemptRef.current) { void bootstrap(); void refresh(); } }, 30000);
    return () => { document.documentElement.classList.remove("arena-view"); clearInterval(timer); clearTimeout(refreshTimer.current); clearTimeout(celebrationTimer.current); };
  }, [bootstrap, refresh]);
  useEffect(() => { if (period !== "custom" || (start && end)) { setStats(null); void refresh(); } }, [query, period, start, end, refresh]);
  const setSelection = (next: Attempt | null) => { attemptRef.current = next; setAttempt(next); };
  const focus = data?.activities.find(a => a.id === data.campaign?.activity_id) ?? data?.activities[0];
  const other = data?.activities.filter(a => a.id !== focus?.id) ?? [];
  const pages = Math.max(1, Math.ceil(other.length / 6));
  useEffect(() => { setPage(p => Math.min(p, pages - 1)); }, [pages]);
  const begin = (activity: ArenaActivity) => {
    if (lock.current || attemptRef.current) return;
    setSaleError(""); setSelection({ activity, requestId: crypto.randomUUID() });
  };
  async function register(sellerId: string) {
    const selected = attemptRef.current;
    if (!selected || lock.current || (selected.sellerId && selected.sellerId !== sellerId)) return;
    lock.current = true; setBusy(true); setSaleError("");
    const pending = { ...selected, sellerId }; setSelection(pending);
    const before = statsRef.current;
    try {
      const { registration } = await api<{ registration: ArenaRegistration }>("/arena/registrations", send("POST", {
        request_id: pending.requestId, activity_id: pending.activity.id, seller_id: sellerId,
      }));
      if (registration.voided_at) throw new HttpError("Registreringen har redan ångrats. Välj aktiviteten på nytt.", 409);
      const name = data?.sellers.find(s => s.id === sellerId)?.name ?? "Säljaren";
      setReceipt({ registration, requestId: pending.requestId, name }); setSelection(null);
      if (lastCelebrated.current !== registration.id) {
        lastCelebrated.current = registration.id;
        setCelebration({ key: registration.id, points: registration.points_awarded, text: `${name}, snyggt jobbat!`, special: false, kind: "points", sellerId, name, activity: pending.activity });
        clearTimeout(celebrationTimer.current); celebrationTimer.current = setTimeout(() => setCelebration(null), 3000);
      }
      // One small, debounced statistics refresh, independent of the animation and next sale.
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void refresh().then(after => {
          if (!after || before?.range.start !== after.range.start || before?.range.end !== after.range.end) return;
          const event = arenaAchievement(before, after, sellerId);
          setCelebration(current => current?.key === registration.id ? { ...current, ...event } : current);
        });
      }, 180);
    } catch (e) {
      const definitive = e instanceof HttpError && e.status >= 400 && e.status < 500;
      setSaleError(definitive ? (e as Error).message : "Svaret kunde inte bekräftas. Försök igen med samma registrering så räknas den bara en gång.");
      if (definitive) { setSelection({ ...pending, requestId: crypto.randomUUID(), sellerId: undefined }); void bootstrap(); }
    } finally { lock.current = false; setBusy(false); }
  }
  async function undo() {
    if (!receipt || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      await api(`/arena/registrations/${receipt.registration.id}/void`, send("POST", { request_id: receipt.requestId }));
      setReceipt(null); setCelebration(null); await refresh();
    } catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  const person = stats?.leaderboard.find(p => p.id === personId);
  const campaign = stats?.campaign;
  const goal = stats?.station_goals[0];
  const controls = <>
    <div className="arena-tabs" aria-label="Statistikperiod">{[["today", "IDAG"], ["week", "VECKA"], ["month", "MÅNAD"], ["custom", "PERIOD"]].map(([value, label]) => <button key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}</div>
    {period === "custom" && <div className="arena-dates"><label>Från<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label><label>Till<input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label></div>}
  </>;
  return <div className={`arena-shell arena-theme${celebration?.special ? " has-achievement" : ""}`}>
    <header className="arena-header">
      <a href="/station" className="arena-brand" aria-label="Till stationsdashboarden"><svg className="arena-brand-mark" viewBox="0 0 44 44" aria-hidden="true"><path d="M3 38 21 4l19 34h-9L21 19 12 38Z" /><path d="m17 29 14 9h-9l-9-6Z" /></svg><span><strong>ARENAN</strong><small>{data?.station.name || "STATIONEN"}</small></span></a>
      <div className="arena-team-goal">{goal ? <GoalProgress goal={goal} /> : campaign?.target_points ? <Progress points={campaign.points} target={campaign.target_points} label={campaign.name} /> : campaign?.target_count ? <Progress points={campaign.count} target={campaign.target_count} label={campaign.name} suffix="försäljningar" /> : <div className="arena-no-goal"><Star /><span>VARJE FÖRSÄLJNING RÄKNAS<strong>Tillsammans mot nästa mål</strong></span></div>}</div>
      <p className="arena-handwritten">Tillsammans<br />säljer vi mer! ♡</p>
    </header>
    {error && <div className="arena-error" role="alert">{error}<button onClick={() => { void bootstrap(); void refresh(); }}>Försök igen</button></div>}
    <main className="arena-main">
      <aside className="arena-leaderboard arena-panel"><span className="arena-eyebrow">VARJE POÄNG RÄKNAS</span><h2>TOPPLISTA</h2>{controls}<People stats={stats} onPerson={p => setPersonId(p.id)} highlightId={celebration?.sellerId} /><button className="arena-more" onClick={() => setPanel("leaders")}><Trophy /> SE FLER TOPPLISTOR <ChevronRight /></button></aside>
      <section className="arena-stage" aria-label="Försäljningsaktiviteter" onTouchStart={e => { e.currentTarget.dataset.touch = String(e.touches[0].clientX); }} onTouchEnd={e => {
        const delta = e.changedTouches[0].clientX - Number(e.currentTarget.dataset.touch);
        if (Math.abs(delta) > 60) setPage(p => Math.max(0, Math.min(pages - 1, p + (delta < 0 ? 1 : -1))));
      }}>
        <div className="arena-stage-label"><span className="arena-eyebrow">SMÅ AFFÄRER. STORA RESULTAT.</span><small>Tryck på en aktivitet för att registrera</small></div>
        <div className="arena-mobile-stats" aria-label="Dagens resultat"><span><BarChart3 /> {stats?.today.count ?? "—"} registreringar</span><span><Star /> {stats ? num(stats.today.points) : "—"} p</span><span><Users /> {stats?.today.sellers ?? "—"} säljare</span></div>
        {focus ? <>
          <div className="arena-focus-slot"><ArenaActivityButton activity={focus} focus campaignName={data?.campaign?.name} onClick={() => begin(focus)} /></div>
          <div className="arena-satellites">{other.slice(page * 6, page * 6 + 6).map((activity, index) => <div key={activity.id} className={`arena-satellite satellite-${index}`}><ArenaActivityButton activity={activity} onClick={() => begin(activity)} /></div>)}</div>
          {pages > 1 && <div className="arena-pagination"><button aria-label="Föregående aktiviteter" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft /></button><span>{page + 1} / {pages}</span><button aria-label="Nästa aktiviteter" disabled={page === pages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight /></button></div>}
        </> : <div className="arena-empty-stage"><Crown /><h1>{data ? "Redo att skapa er Arena?" : "Laddar Arenan…"}</h1>{data && <><p>Lägg till aktiviteter och en fokus-kampanj för laget.</p><a href="/arena/admin">Öppna Arena-admin <ChevronRight /></a></>}</div>}
      </section>
      <aside className="arena-stats arena-panel"><span className="arena-eyebrow">STARKARE TILLSAMMANS</span><h2>DAGENS STATS</h2>
        <div className="arena-stat"><BarChart3 /><div><strong>{stats ? num(stats.today.count) : "—"}</strong><span>Registreringar</span></div></div>
        <div className="arena-stat"><Star /><div><strong>{stats ? num(stats.today.points) : "—"}</strong><span>Poäng idag</span></div></div>
        <div className="arena-stat"><Users /><div><strong>{stats?.today.sellers ?? "—"}</strong><span>Aktiva säljare idag</span></div></div>
        <blockquote>”Små merförsäljningar<br />skapar stora resultat!”<span>♡</span></blockquote><p className="arena-handwritten">Du gör skillnad! ♡</p>
      </aside>
    </main>
    <div className="arena-utility"><a href="/station"><ArrowLeft /> Stationsdashboard</a><div className="arena-utility-actions">{receipt && <button onClick={() => void undo()} disabled={busy}><RotateCcw /><span>Ångra senaste · {receipt.name}</span></button>}{celebration && <button aria-label="Stäng belöning" onClick={() => setCelebration(null)}><X /></button>}</div></div>
    <nav className="arena-nav" aria-label="Arena"><button aria-current="page" onClick={() => { setPanel(null); setPersonId(null); }}><Home /> START</button><button onClick={() => setPanel("leaders")}><BarChart3 /> TOPPLISTOR</button><button onClick={() => setPanel("campaign")}><Trophy /> KAMPANJER</button><a href="/arena/admin"><Settings /> ADMIN</a></nav>
    {attempt && <ArenaDialog title="Vem gjorde försäljningen?" className="arena-dialog-sellers" eyebrow="EN FÖRSÄLJNING. TVÅ TRYCK." locked={busy || Boolean(attempt.sellerId)} onClose={() => { setSelection(null); setSaleError(""); }}>
      <div className="arena-modal-summary"><span className="arena-selected-product" aria-hidden="true"><ActivityImage activity={attempt.activity} /></span><span>{attempt.activity.name}<small>VALD AKTIVITET</small></span><strong>+{num(attempt.activity.points)} <small>POÄNG</small></strong></div>
      <div className="arena-sellers">{data?.sellers.map(seller => <button key={seller.id} aria-label={seller.name} onClick={() => void register(seller.id)} disabled={busy || Boolean(attempt.sellerId)} style={{ "--seller-color": seller.color } as React.CSSProperties}><span className="arena-seller-initial" aria-hidden="true">{initials(seller.name)}</span><span className="arena-seller-name">{seller.name}</span></button>)}</div>
      <p className="arena-seller-hint"><Check aria-hidden="true" /> Tryck på ditt namn – sedan är det klart.</p>
      {!data?.sellers.length && <p>Lägg till aktiva säljare i stationens personalregister.</p>}
      {busy && <p role="status">Sparar…</p>}{saleError && <p className="arena-error" role="alert">{saleError}</p>}
      {saleError && attempt.sellerId && <button className="arena-action" onClick={() => void register(attempt.sellerId!)} disabled={busy}>Försök igen</button>}
    </ArenaDialog>}
    {person && <ArenaDialog title={`${person.name} · Min Arena`} heading="MIN ARENA" eyebrow="MIN UTVECKLING. MINA RESULTAT." className="arena-dialog-person" onClose={() => setPersonId(null)}>
      <PersonDetails person={person} stats={stats!} onClose={() => setPersonId(null)} />
    </ArenaDialog>}
    {panel === "leaders" && <ArenaDialog title="Topplistor & statistik" className="arena-dialog-leaders" eyebrow="LAGETS RESULTAT" onClose={() => setPanel(null)}>{controls}
      <div className="arena-filters"><label>Aktivitet<select value={activityFilter} onChange={e => setActivityFilter(e.target.value)}><option value="">Alla aktiviteter</option>{data?.activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Kategori<select value={category} onChange={e => setCategory(e.target.value)}><option value="">Alla kategorier</option>{[...new Set(data?.activities.map(a => a.category).filter(Boolean))].map(c => <option key={c}>{c}</option>)}</select></label></div>
      <p>{stats ? `${num(stats.points)} poäng · ${num(stats.count)} merförsäljningar` : "Hämtar statistik…"}</p><People stats={stats} onPerson={p => { setPanel(null); setPersonId(p.id); }} />
    </ArenaDialog>}
    {panel === "campaign" && <ArenaDialog title="Lagets kampanj & mål" className="arena-dialog-campaign" eyebrow="TILLSAMMANS MOT NÄSTA MÅL" onClose={() => setPanel(null)}>{campaign ? <>
      <h3>{campaign.name}</h3><p>{data?.activities.find(a => a.id === campaign.activity_id)?.name}</p><p>{new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "medium" }).format(new Date(campaign.start_at))} – {new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "medium" }).format(new Date(Date.parse(campaign.end_at) - 1))}</p>
      {campaign.target_points && <Progress points={campaign.points} target={campaign.target_points} label="KAMPANJMÅL" />}{campaign.target_count && <Progress points={campaign.count} target={campaign.target_count} label="MERFÖRSÄLJNINGAR" suffix="st" />}
    </> : <p>Ingen aktiv kampanj just nu.</p>}{stats?.station_goals.map(g => <section key={g.id}><GoalProgress goal={g} /></section>)}</ArenaDialog>}
    {celebration && <CelebrationCard key={celebration.key} event={celebration} />}
  </div>;
}
