import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BarChart3, Check, ChevronRight, Clock3, Crown, Home, RotateCcw, Settings, ShoppingBag, Star, Target, Trophy, UserRound, Users, X } from "lucide-react";
import { api, HttpError, send } from "./api";
import type { ArenaAchievement, ArenaActivity, ArenaBootstrap, ArenaGoal, ArenaPerson, ArenaRegistration, ArenaStats } from "../shared/arena";
import { arenaAchievement, arenaNumber as num, roundedPoints } from "../shared/arena";
import ArenaDialog from "./ArenaDialog";
import ArenaAdmin from "./ArenaAdmin";
import { arenaPeriodLabel } from "./arena-dates";
import { arenaProductImage } from "./arena-product-images";
import { arenaStartActivities } from "./arena-start";
import type { EvaluatedAchievement } from "../shared/arena-achievements";
import { arenaMoney, arenaReward } from "../shared/arena-money";
import "./arena.css";

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
function ActivityImage({ activity, imageUrl, loading = "eager" }: { activity: ArenaActivity; imageUrl?: string; loading?: "eager" | "lazy" }) {
  const src = arenaProductImage(activity, imageUrl);
  return src ? <img src={src} alt="" loading={loading} decoding="sync" draggable={false} /> : <ShoppingBag aria-hidden="true" />;
}

export function ArenaActivityButton({ activity, focus = false, campaignName, onClick, imageUrl, unavailable = false }: {
  activity: ArenaActivity; focus?: boolean; campaignName?: string; onClick?: () => void; imageUrl?: string; unavailable?: boolean;
}) {
  return <button type="button" className={`arena-orb${focus ? " arena-orb-focus" : ""}`} data-display-mode={activity.display_mode??"points"} onClick={onClick} disabled={unavailable}
    aria-label={unavailable ? `${activity.name}, ej upplagd` : `${activity.name}, ${arenaReward(activity).replace("POÄNG","poäng")}`}>
    {focus && <span className="arena-focus-cap"><Crown className="arena-crown" aria-hidden="true" /><span className="arena-focus-title">{campaignName || "LAGETS FOKUS"}</span><strong className="arena-focus-name">{activity.name}</strong></span>}
    <span className="arena-product">
      <ActivityImage activity={activity} imageUrl={imageUrl} loading="eager" />
    </span>
    <span className="arena-product-copy">{activity.offer_text && <span className="arena-offer">{activity.offer_text}</span>}<strong>{activity.name}</strong>{activity.price_text && <span className="arena-price">{activity.price_text}</span>}</span>
    <span className="arena-points">{unavailable ? "EJ UPPLAGD" : arenaReward(activity)}</span>
  </button>;
}
function Progress({ points, target, label, suffix = "poäng", hud = false }: { points: number; target: number; label: string; suffix?: string; hud?: boolean }) {
  const percent = Math.min(100, Math.round(100 * points / target));
  const previous = useRef({ points, target, label });
  const [gain, setGain] = useState(0);
  useEffect(() => {
    if (hud && target === previous.current.target && label === previous.current.label && points > previous.current.points) setGain(value => value + 1);
    previous.current = { points, target, label };
  }, [hud, points, target, label]);
  return <div className={`arena-progress${hud ? " arena-hud" : ""}`}><span><Star aria-hidden="true" />{label}</span><div className="arena-progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(points, target)}>
    <i style={{ "--fill": percent / 100 } as React.CSSProperties} /><strong>{num(points)} / {num(target)} {suffix}</strong><b>{percent}%</b>
    {hud && gain > 0 && <em key={gain} className="arena-progress-gain" aria-hidden="true" />}
  </div></div>;
}
function GoalProgress({ goal, label, hud = false }: { goal: ArenaGoal; label?: string; hud?: boolean }) {
  return <><Progress points={goal.points} target={goal.target_points} label={label ?? (goal.period_type === "week" ? "VECKOMÅLET" : goal.period_type === "month" ? "MÅNADENS MÅL" : "LAGETS MÅL")} hud={hud} /><small>{arenaPeriodLabel(goal.start_date, goal.end_date, goal.period_type)}</small></>;
}
function SellerAvatar({ name, imageUrl }: { name: string; imageUrl?: string }) {
  return <span className="arena-leader-avatar" aria-hidden="true" title={name}>{imageUrl ? <img src={imageUrl} alt="" /> : <UserRound />}</span>;
}
function People({ stats, onPerson, highlightId, newLeaderId, limit }: { stats: ArenaStats | null; onPerson: (p: ArenaPerson) => void; highlightId?: string; newLeaderId?: string; limit?: number }) {
  const value=(p:ArenaPerson)=>stats?.metric === "tb" ? arenaMoney(p.tb_ore??0) : num(stats?.metric === "count" ? p.count : p.points);
  const unit=stats?.metric === "tb" ? "TB" : stats?.metric === "count" ? "st" : "p";
  return <ol className="arena-leader-list">{stats?.leaderboard.slice(0, limit).map(p => <li key={p.id} className={[highlightId === p.id ? "is-celebrating" : "", newLeaderId === p.id ? "is-new-leader" : ""].filter(Boolean).join(" ") || undefined}>
    <button onClick={() => onPerson(p)} aria-label={`${p.name} ${value(p)} ${unit}`}><span className={`arena-rank rank-${p.rank}`} aria-hidden="true">
      {p.rank}</span><span className="arena-seller-cell"><SellerAvatar name={p.name} /><span>{p.name}{newLeaderId === p.id && <small className="arena-new-leader"><Crown aria-hidden="true" /> Ny etta!</small>}{!p.active && <small>Historik</small>}</span></span><strong>{value(p)} <small>{unit}</small></strong>
    </button></li>)}{stats && !stats.leaderboard.length && <li className="arena-empty">Lägg till personal i stationens personalregister.</li>}</ol>;
}
const feedTime = new Intl.DateTimeFormat("sv-SE", { timeZone:"Europe/Stockholm", hour:"2-digit", minute:"2-digit" });
function FeedStatus({ stats, error }: { stats: ArenaStats | null; error: boolean }) {
  return <span className={`arena-live${error ? " is-paused" : stats?.recent === undefined ? " is-loading" : ""}`}><i aria-hidden="true" />{error ? "PAUSAD" : !stats ? "HÄMTAR" : stats.recent ? "LIVE" : "SAKNAS"}</span>;
}
function RecentActivities({ stats, limit }: { stats: ArenaStats | null; limit?: number }) {
  const rows = stats?.recent?.slice(0, limit) ?? [];
  return rows.length ? <ol className="arena-recent-list">{rows.map(row => <li key={row.id}>
    <span className="arena-feed-seller"><SellerAvatar name={row.seller_name} /><span><strong>{row.seller_name}</strong><small>{row.activity_name}</small></span></span>
    <b>+{num(row.points_awarded)} p</b><time dateTime={row.registered_at}>{feedTime.format(new Date(row.registered_at))}</time>
  </li>)}</ol> : <p className="arena-recent-empty">{!stats ? "Hämtar dagens aktiviteter…" : stats.recent ? "Dagens första försäljning väntar. Kör på!" : "Aktivitetsflödet är inte tillgängligt."}</p>;
}
type Attempt = { activity: ArenaActivity; requestId: string; sellerId?: string };
type Receipt = { registration: ArenaRegistration; requestId: string; name: string };
type Celebration = ArenaAchievement & { key: string; points: number; tbOre?:number | null; sellerId: string; name: string; activity: ArenaActivity; secondary?: string[]; heroUrl?: string };
const rewardDuration = (special: boolean) => special ? 3600 : 2600;

function PersonDetails({ person, stats, onClose }: { person: ArenaPerson; stats: ArenaStats; onClose: () => void }) {
  const goals = stats.personal_goals.filter(g => g.seller_id === person.id);
  const goal = goals[0], next = stats.leaderboard[person.rank - 2];
  const percent = goal ? Math.min(100, Math.round(100 * goal.points / goal.target_points)) : 0;
  return <>
    <div className="arena-person-heading"><span className="arena-person-avatar" style={{ "--seller-color": person.color } as React.CSSProperties} aria-hidden="true">{initials(person.name)}<Crown /></span><div><h3>{person.name}</h3><p>Din utveckling. Dina resultat.</p></div><div className="arena-person-rank"><strong>#{person.rank}</strong><small>PLACERING</small></div></div>
    <div className="arena-person-metrics"><div><Star /><small>POÄNG</small><strong>{num(person.points)}</strong></div><div><BarChart3 /><small>REGISTRERINGAR</small><strong>{num(person.count)}</strong></div><div className={`arena-person-goal${goal ? "" : " is-empty"}`}><Target /><small>{goal ? goal.period_type === "week" ? "VECKOMÅL" : goal.period_type === "month" ? "MÅNADSMÅL" : "PERSONLIGT MÅL" : "PERSONLIGT MÅL"}</small><strong>{goal ? `${num(goal.target_points)} p` : "Inte satt ännu"}</strong></div></div>
    <div className="arena-person-tb"><strong>{arenaMoney(person.tb_ore??0)} TB</strong><span>Genererad uppskattad marginal · {arenaPeriodLabel(stats.range.start,stats.range.end)}</span>{!!person.unknown_tb_count && <small>{person.unknown_tb_count} äldre registreringar saknar historiskt TB.</small>}</div>
    <section className="arena-person-progress"><div className="arena-progress-ring" style={{ "--progress": `${percent}%` } as React.CSSProperties} role={goal ? "progressbar" : undefined} aria-label={goal ? "Personligt mål" : undefined} aria-valuemin={goal ? 0 : undefined} aria-valuemax={goal?.target_points} aria-valuenow={goal ? Math.min(goal.points, goal.target_points) : undefined}><span>{goal ? `${percent}%` : <Target />}<small>{goal ? "AV MÅLET" : "NÄSTA MÅL"}</small></span></div><div>{goal ? <><strong>{goal.points >= goal.target_points ? "Målet uppnått!" : `${num(roundedPoints(goal.target_points - goal.points))} poäng kvar`}</strong><p>{arenaPeriodLabel(goal.start_date, goal.end_date, goal.period_type)}</p></> : <><strong>Inget personligt mål satt ännu</strong><p>Stationsadmin kan sätta ett mål för dig. Dina försäljningar räknas redan!</p></>}{next ? <strong className="arena-next-rank">{stats.metric==="tb" ? `${arenaMoney((next.tb_ore??0)-(person.tb_ore??0))} TB` : stats.metric==="count" ? `${next.count-person.count} registreringar` : `${num(roundedPoints(next.points - person.points))} poäng`} till nästa placering</strong> : <strong className="arena-next-rank">{person.points > 0 ? "Du leder. Fortsätt på samma spår!" : "Varje registrering tar dig framåt."}</strong>}</div></section>
    {goals.slice(1).map(g => <section className="arena-extra-goal" key={g.id}><GoalProgress goal={g} /><p>{g.points >= g.target_points ? "Målet uppnått!" : `${num(roundedPoints(g.target_points - g.points))} poäng kvar till målet`}</p></section>)}
    <div className="arena-breakdown-heading"><h3>Mina aktiviteter</h3><small>{arenaPeriodLabel(stats.range.start, stats.range.end)}</small></div><ul className="arena-breakdown">{person.activities.map(a => <li key={a.id}><ShoppingBag aria-hidden="true" /><div><span>{a.name}</span><strong>{num(a.points)} poäng <small>· {a.count} st · {arenaMoney(a.tb_ore??0)} TB</small></strong><i style={{ "--activity-share": `${person.points ? 100 * a.points / person.points : 0}%` } as React.CSSProperties} /></div></li>)}</ul>{!person.activities.length && <p className="arena-breakdown-empty">Din nästa försäljning är början på nästa resultat.</p>}
    <footer className="arena-person-footer"><Trophy /><span><strong>DU GÖR SKILLNAD!</strong><small>Varje registrering räknas.</small></span><button className="arena-gold-action" onClick={onClose}>Fortsätt sälja <ArrowRight /></button></footer>
  </>;
}
function CelebrationCard({ event }: { event: Celebration }) {
  const isGoal = event.kind === "personal-goal" || event.kind === "station-goal" || event.kind === "focus-goal";
  const heading = event.kind === "leader" ? "NY ETTA!" : event.kind === "focus-goal" ? "FOKUSMÅL UPPNÅTT!" : isGoal ? event.goal?.period_type === "week" ? "VECKOMÅL UPPNÅTT!" : "MÅL UPPNÅTT!" : event.kind === "milestone" ? "VILKET DRIV!" : null;
  const encouragement = event.kind === "leader" ? event.previousLeader ? `${event.name} går om ${event.previousLeader}` : `${event.name} tar förstaplatsen!` : event.kind === "personal-goal" ? `${event.name} · ${event.text}` : event.kind === "station-goal" ? "Hela laget nådde målet!" : event.text;
  const level=event.level ?? (event.special ? 3 : 1);
  const reward=arenaReward(event.activity,event.points,event.tbOre);
  if (level === 3) return <div className={`arena-celebration is-special level-3 celebration-${event.kind}`} role="status" style={{"--reward-life":`${rewardDuration(true)}ms`} as React.CSSProperties}>
    <div className="arena-reward-ring arena-victory-hero">
      <div className="arena-victory-art" aria-hidden="true">{event.heroUrl ? <img src={event.heroUrl} alt="" /> : <><Crown /><Trophy /><b>{event.kind === "leader" ? "1" : <Check />}</b></>}</div>
      <div className="arena-victory-copy"><span className="arena-eyebrow">{event.scope || "DITT RESULTAT GÖR SKILLNAD"}</span><h2>{heading}</h2><span className="arena-milestone-subtitle">{encouragement}</span>
        <strong className="arena-reward-seller">{event.name}</strong>
        <div className="arena-victory-sale"><strong className="arena-reward-points">{reward}!</strong><div className="arena-reward-activity">{event.activity.name}</div></div>
        {isGoal && event.goal && <div className="arena-reward-goal"><Check aria-hidden="true" />{num(event.goal.points)} / {num(event.goal.target_points)} {event.goalMetric === "count" ? "försäljningar" : "poäng"}</div>}
        {event.secondary?.length ? <p className="arena-victory-secondary">{event.secondary.join(" · ")}</p> : null}
        <span className="arena-reward-confirmation">SÄLJNINGEN REGISTRERAD</span><strong className="arena-reward-pep">SNYGGT JOBBAT!</strong>
      </div>
      {Array.from({length:16},(_,i)=><i key={i} className="arena-confetti" style={{"--i":i} as React.CSSProperties} aria-hidden="true" />)}
    </div>
  </div>;
  return <div className={`arena-celebration${event.special ? " is-special" : ""}${event.activity.display_mode === "tb" ? " reward-tb" : ""} level-${level} celebration-${event.kind}`} role="status" style={{ "--reward-life": `${rewardDuration(event.special)}ms` } as React.CSSProperties}>
    <div className="arena-reward-ring" key={event.kind}>
      {event.special && <div className="arena-reward-crown" aria-hidden="true">{isGoal ? <Trophy /> : <><Crown /><b>1</b></>}</div>}
      <div className="arena-reward-product" aria-hidden="true"><ActivityImage activity={event.activity} /></div>
      <div className="arena-reward-activity">{event.activity.name}</div>
      {event.activity.offer_text && <small className="arena-reward-offer">{event.activity.offer_text}</small>}
      {heading && <><h2>{heading}</h2><span className="arena-milestone-subtitle">{encouragement}</span></>}
      <strong className="arena-reward-points">{reward}!</strong>
      <strong className="arena-reward-seller">{event.name}</strong>
      <span className="arena-reward-confirmation">SÄLJNINGEN REGISTRERAD</span>
      <div className="arena-reward-check" aria-hidden="true"><Check /></div>
      <strong className="arena-reward-pep">BRA JOBBAT!</strong>
      {!event.special && <span className="arena-reward-encouragement">{encouragement}</span>}
      {isGoal && event.goal && <div className="arena-reward-goal"><Trophy aria-hidden="true" /><span>{num(event.goal.points)} / {num(event.goal.target_points)} poäng</span></div>}
      {Array.from({ length: event.special ? 12 : 6 }, (_, i) => <i key={i} className="arena-confetti" style={{ "--i": i } as React.CSSProperties} aria-hidden="true" />)}
    </div>
  </div>;
}
export default function ArenaApp() {
  return window.location.pathname.startsWith("/arena/admin") ? <ArenaAdmin /> : <ArenaHome />;
}
function ArenaHome() {
  const [data, setData] = useState<ArenaBootstrap | null>(null);
  const [stats, setStats] = useState<ArenaStats | null>(null);
  const [statsUnavailable, setStatsUnavailable] = useState(false);
  const [period, setPeriod] = useState("today"), [start, setStart] = useState(""), [end, setEnd] = useState("");
  const [activityFilter, setActivityFilter] = useState(""), [category, setCategory] = useState("");
  const [metric,setMetric]=useState("points");
  const [attempt, setAttempt] = useState<Attempt | null>(null), [busy, setBusy] = useState(false), [saleError, setSaleError] = useState("");
  const [error, setError] = useState(""), [personId, setPersonId] = useState<string | null>(null), [panel, setPanel] = useState<"leaders" | "recent" | "campaign" | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const lock = useRef(false), statsRef = useRef(stats), attemptRef = useRef<Attempt | null>(null), statsVersion = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastCelebrated = useRef("");
  // A late statistics response may upgrade a burst, but never revive a dismissed/undone sale or interrupt the next selection.
  const celebrationAllowed = useRef("");
  const query = new URLSearchParams({ period, metric,...(period === "custom" ? { start, end } : {}), ...(activityFilter ? { activity_id: activityFilter } : {}), ...(category ? { category } : {}) }).toString();
  const queryRef = useRef(query); queryRef.current = query;
  const refresh = useCallback(async () => {
    const version = ++statsVersion.current;
    try {
      const next = await api<ArenaStats>(`/arena/stats?${queryRef.current}`);
      if (version === statsVersion.current) { statsRef.current = next; setStats(next); setStatsUnavailable(false); setError(""); }
      return next;
    } catch (e) { if (version === statsVersion.current) { setStatsUnavailable(true); setError((e as Error).message); } return null; }
  }, []);
  const bootstrap = useCallback(async () => {
    try { setData(await api<ArenaBootstrap>("/arena/bootstrap")); setError(""); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => {
    document.documentElement.classList.add("arena-view");
    void bootstrap();
    const timer = setInterval(() => { if (!document.hidden && !lock.current && !attemptRef.current) { void bootstrap(); void refresh(); } }, 30000);
    return () => { document.documentElement.classList.remove("arena-view"); celebrationAllowed.current = ""; clearInterval(timer); clearTimeout(refreshTimer.current); clearTimeout(celebrationTimer.current); };
  }, [bootstrap, refresh]);
  useEffect(() => { if (period !== "custom" || (start && end)) { setStats(null); void refresh(); } }, [query, period, start, end, refresh]);
  const setSelection = (next: Attempt | null) => { attemptRef.current = next; setAttempt(next); };
  const [focus, ...other] = arenaStartActivities(data?.activities ?? []);
  const begin = (activity: ArenaActivity) => {
    if (lock.current || attemptRef.current) return;
    celebrationAllowed.current = "";
    setSaleError(""); setSelection({ activity, requestId: crypto.randomUUID() });
  };
  async function register(sellerId: string) {
    const selected = attemptRef.current;
    if (!selected || lock.current || (selected.sellerId && selected.sellerId !== sellerId)) return;
    lock.current = true; setBusy(true); setSaleError("");
    const pending = { ...selected, sellerId }; setSelection(pending);
    const before = statsRef.current;
    try {
      const { registration, achievements } = await api<{ registration: ArenaRegistration; achievements?:EvaluatedAchievement[] }>("/arena/registrations", send("POST", {
        request_id: pending.requestId, activity_id: pending.activity.id, seller_id: sellerId,
        achievement_context:{period:period === "custom" && (!start || !end) ? "today" : period,metric,...(period === "custom" && start && end ? {start,end} : {})},
      }));
      if (registration.voided_at) throw new HttpError("Registreringen har redan ångrats. Välj aktiviteten på nytt.", 409);
      const name = data?.sellers.find(s => s.id === sellerId)?.name ?? "Säljaren";
      const primary=achievements?.[0];
      const burst: Celebration = { key: registration.id, points: registration.points_awarded,tbOre:registration.tb_ore_awarded??null, text: `${name}, snyggt jobbat!`, special: false, kind: "points", sellerId, name, activity: pending.activity,...primary,secondary:achievements?.slice(1).map(e=>`${e.text} ${e.scope}`) };
      setReceipt({ registration, requestId: pending.requestId, name }); setSelection(null);
      if (lastCelebrated.current !== registration.id) {
        lastCelebrated.current = registration.id;
        celebrationAllowed.current = registration.id;
        setCelebration(burst);
        clearTimeout(celebrationTimer.current); celebrationTimer.current = setTimeout(() => setCelebration(null), rewardDuration(burst.special));
      }
      // One small, debounced statistics refresh, independent of the animation and next sale.
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void refresh().then(after => {
          if (!after || before?.range.start !== after.range.start || before?.range.end !== after.range.end) return;
          const event = achievements !== undefined ? primary ?? {text:burst.text,special:false,kind:"points" as const} : arenaAchievement(before, after, sellerId);
          if (celebrationAllowed.current !== registration.id) return;
          setCelebration(current => current?.key === registration.id ? { ...current, ...event } : event.special && celebrationAllowed.current === registration.id ? { ...burst, ...event } : current);
          if (event.special && lastCelebrated.current === registration.id) {
            clearTimeout(celebrationTimer.current);
            celebrationTimer.current = setTimeout(() => setCelebration(current => current?.key === registration.id ? null : current), rewardDuration(true));
          }
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
      celebrationAllowed.current = ""; setReceipt(null); setCelebration(null); await refresh();
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
      <div className="arena-team-goal">{goal ? <GoalProgress goal={goal} label="MÅNADENS MÅL" hud /> : campaign?.target_points ? <Progress points={campaign.points} target={campaign.target_points} label="MÅNADENS MÅL" hud /> : campaign?.target_count ? <Progress points={campaign.count} target={campaign.target_count} label="MÅNADENS MÅL" suffix="försäljningar" hud /> : <div className="arena-no-goal"><Star /><span>VARJE FÖRSÄLJNING RÄKNAS<strong>Tillsammans mot nästa mål</strong></span></div>}</div>
      <p className="arena-handwritten">Tillsammans<br />säljer vi mer! ♡</p>
    </header>
    {(error || statsUnavailable) && <div className="arena-error" role="alert">{error || "Statistiken är tillfälligt otillgänglig."}<button onClick={() => { void bootstrap(); void refresh(); }}>Försök igen</button></div>}
    <main className="arena-main">
      <div className="arena-left-column">
        <aside className="arena-leaderboard arena-panel"><span className="arena-eyebrow">VARJE POÄNG RÄKNAS</span><h2>TOPPLISTA <span>– {({ today:"Idag", week:"Vecka", month:"Månad", custom:"Period" } as Record<string,string>)[period]}</span></h2>{controls}<People stats={stats} limit={period === "custom" ? 2 : 5} onPerson={p => setPersonId(p.id)} highlightId={celebration?.sellerId} newLeaderId={celebration?.kind === "leader" ? celebration.sellerId : undefined} /><button className="arena-more" onClick={() => setPanel("leaders")}>SE FLER TOPPLISTOR <ChevronRight aria-hidden="true" /></button></aside>
        <aside className="arena-recent arena-panel"><header><button aria-label="Öppna senaste aktiviteter" onClick={() => setPanel("recent")}><h2>Senaste aktiviteter</h2><ChevronRight aria-hidden="true" /></button><FeedStatus stats={stats} error={statsUnavailable} /></header><RecentActivities stats={stats} limit={4} /></aside>
      </div>
      <section className="arena-stage arena-stage-start" aria-label="Försäljningsaktiviteter">
        <div className="arena-stage-label"><span className="arena-eyebrow">SMÅ AFFÄRER. STORA RESULTAT.</span><small>Tryck på en aktivitet för att registrera</small></div>
        <div className="arena-mobile-panels"><button aria-label="Öppna topplistan" onClick={() => setPanel("leaders")}><BarChart3 aria-hidden="true" /> Topplista</button><button aria-label="Öppna senaste aktiviteter" onClick={() => setPanel("recent")}><Clock3 aria-hidden="true" /> Senaste aktiviteter<span className={`arena-live-dot${statsUnavailable ? " is-paused" : stats?.recent === undefined ? " is-loading" : ""}`} aria-hidden="true" /></button></div>
        {data ? <>
          <div className="arena-focus-slot"><ArenaActivityButton activity={focus.view} focus campaignName="MÅNADENS FOKUS" unavailable={!focus.activity} onClick={focus.activity ? () => begin(focus.activity!) : undefined} /></div>
          <div className="arena-satellites">{other.map(({ key, activity, view }, index) => <div key={key} className={`arena-satellite satellite-${index}`}><ArenaActivityButton activity={view} unavailable={!activity} onClick={activity ? () => begin(activity) : undefined} /></div>)}</div>
        </> : <div className="arena-empty-stage"><Crown /><h1>{data ? "Redo att skapa er Arena?" : "Laddar Arenan…"}</h1>{data && <><p>Lägg till aktiviteter och en fokus-kampanj för laget.</p><a href="/arena/admin">Öppna Arena-admin <ChevronRight /></a></>}</div>}
      </section>
    </main>
    <div className="arena-utility"><a href="/station"><ArrowLeft /> Stationsdashboard</a><div className="arena-utility-actions">{receipt && <button onClick={() => void undo()} disabled={busy}><RotateCcw /><span>Ångra senaste · {receipt.name}</span></button>}{celebration && <button aria-label="Stäng belöning" onClick={() => { celebrationAllowed.current = ""; setCelebration(null); }}><X /></button>}</div></div>
    <section className="arena-stats-bar" aria-label="Dagens stats"><h2>DAGENS STATS</h2>
      <div><BarChart3 aria-hidden="true" /><strong>{stats ? num(stats.today.count) : "—"}</strong><span>Registreringar</span></div>
      <div><Star aria-hidden="true" /><strong>{stats ? num(stats.today.points) : "—"}</strong><span>Poäng idag</span></div>
      <div><Users aria-hidden="true" /><strong>{stats?.today.sellers ?? "—"}</strong><span>Aktiva säljare</span></div>
      <p>Små merförsäljningar skapar stora resultat!</p>
    </section>
    <nav className="arena-nav" aria-label="Arena"><button aria-current="page" onClick={() => { setPanel(null); setPersonId(null); }}><Home /> START</button><button onClick={() => setPanel("leaders")}><BarChart3 /> TOPPLISTOR</button><button onClick={() => setPanel("campaign")}><Trophy /> KAMPANJER</button><a href="/arena/admin"><Settings /> ADMIN</a></nav>
    {attempt && <ArenaDialog title="Vem gjorde försäljningen?" className="arena-dialog-sellers" eyebrow="EN FÖRSÄLJNING. TVÅ TRYCK." locked={busy || Boolean(attempt.sellerId)} onClose={() => { setSelection(null); setSaleError(""); }}>
      <div className="arena-modal-summary"><span className="arena-selected-product" aria-hidden="true"><ActivityImage activity={attempt.activity} /></span><span>{attempt.activity.name}<small>VALD AKTIVITET</small></span><strong>{arenaReward(attempt.activity)}</strong></div>
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
      <label>Mått<select aria-label="Mått" value={metric} onChange={e=>setMetric(e.target.value)}><option value="points">Poäng</option><option value="tb">TB</option><option value="count">Antal registreringar</option></select></label>
      <div className="arena-filters"><label>Aktivitet<select value={activityFilter} onChange={e => setActivityFilter(e.target.value)}><option value="">Alla aktiviteter</option>{data?.activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Kategori<select value={category} onChange={e => setCategory(e.target.value)}><option value="">Alla kategorier</option>{[...new Set(data?.activities.map(a => a.category).filter(Boolean))].map(c => <option key={c}>{c}</option>)}</select></label></div>
      <p>{stats ? `${num(stats.points)} poäng · ${num(stats.count)} merförsäljningar · ${arenaMoney(stats.tb_ore??0)} TB` : "Hämtar statistik…"}</p>{!!stats?.unknown_tb_count && <p>{stats.unknown_tb_count} äldre registreringar saknar historiskt TB.</p>}<People stats={stats} onPerson={p => { setPanel(null); setPersonId(p.id); }} />
    </ArenaDialog>}
    {panel === "recent" && <ArenaDialog title="Senaste aktiviteter" className="arena-dialog-recent" eyebrow="DAGENS FÖRSÄLJNINGAR" onClose={() => setPanel(null)}><FeedStatus stats={stats} error={statsUnavailable} /><RecentActivities stats={stats} /></ArenaDialog>}
    {panel === "campaign" && <ArenaDialog title="Lagets kampanj & mål" className="arena-dialog-campaign" eyebrow="TILLSAMMANS MOT NÄSTA MÅL" onClose={() => setPanel(null)}>{campaign ? <>
      <h3>{campaign.name}</h3><p>{data?.activities.find(a => a.id === campaign.activity_id)?.name}</p><p>{new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "medium" }).format(new Date(campaign.start_at))} – {new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "medium" }).format(new Date(Date.parse(campaign.end_at) - 1))}</p>
      {campaign.target_points && <Progress points={campaign.points} target={campaign.target_points} label="KAMPANJMÅL" />}{campaign.target_count && <Progress points={campaign.count} target={campaign.target_count} label="MERFÖRSÄLJNINGAR" suffix="st" />}
    </> : <p>Ingen aktiv kampanj just nu.</p>}{stats?.station_goals.map(g => <section key={g.id}><GoalProgress goal={g} /></section>)}</ArenaDialog>}
    {celebration && <CelebrationCard key={`${celebration.key}-${celebration.kind}`} event={celebration} />}
  </div>;
}
