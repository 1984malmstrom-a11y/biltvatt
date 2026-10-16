import {BattleSwords} from './ArenaBattle';
import {battleSlots} from './arena-battle-mode';
import {battlePreference} from '../shared/arena-battle';
import './arena-battle-mode.css';
import {arenaRequests} from './arena-requests';
import ArenaSellerSelector,{type ArenaSellerSelectorHandle} from "./ArenaSellerSelector";
import {visibleArenaPolling,ARENA_SYNC_MS,ARENA_FIGHT_SYNC_MS} from "./arena-polling";
import {arenaLocalSale} from "./arena-local-sale";

import { lazy, memo, startTransition, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BarChart3, Check, ChevronRight, Clock3, Crown, Flag, Home, RotateCcw, Settings, ShoppingBag, Star, Target, Trophy, UserRound, Users, X } from "lucide-react";
import { api, HttpError, send } from "./api";
import type { ArenaAchievement, ArenaActivity, ArenaBootstrap, ArenaGoal, ArenaPerson, ArenaRegistration, ArenaStats } from "../shared/arena";
import { arenaAchievement, arenaNumber as num, roundedPoints } from "../shared/arena";
import ArenaDialog from "./ArenaDialog";
import {FightAnnouncement} from "./ArenaFightPresentation";
import {fightTransition,type FightFeedback} from "./arena-fight-feedback";
import { arenaPeriodLabel } from "./arena-dates";
import { arenaProductImage } from "./arena-product-images";
import { arenaStartActivities } from "./arena-start";
import type { EvaluatedAchievement } from "../shared/arena-achievements";
import { arenaMoney, arenaReward } from "../shared/arena-money";
import ArenaAvatar, {ArenaShowcaseProvider,useArenaShowcase} from "./ArenaAvatar";
import ArenaFocusTitle from './ArenaFocusTitle';
import ArenaStatePanel from "./ArenaStatePanel";
import {arenaFightQualifies} from './arena-fight-objective';
import ArenaChampion from "./ArenaChampion";
import {ArenaPersonName,ArenaPersonContext} from "./ArenaPersonContext";
import {ArenaEmblem} from "./ArenaBrand";
import {useArenaEntryStatus} from './ArenaEntry';
import "./arena-theme.css";
import "./arena.css";
import "./arena-showroom.css";
import "./arena-brand.css";
import "./arena-premium.css";
import "./arena-identity.css";
import "./arena-fight-nav.css";
import "./arena-stage-v2.css";
import "./arena-victory.css";
import "./arena-mini-polish.css";
import "./arena-fight-objective.css";
import './arena-war-fight.css';

const ArenaAdmin=lazy(()=>import("./ArenaAdmin")),ArenaAccount=lazy(()=>import("./ArenaAccount")),ArenaRecovery=lazy(()=>import("./ArenaRecovery")),ArenaFight=lazy(()=>import("./ArenaFight"));
const ArenaContestHub=lazy(()=>import("./ArenaContestHub"));
const ArenaCompetition=lazy(()=>import("./ArenaCompetition"));
const ArenaCompetitions=lazy(()=>import("./ArenaCompetitions")),ArenaLeague=lazy(()=>import("./ArenaLeague"));
const ArenaGroups=lazy(()=>import("./ArenaNetwork").then(m=>({default:m.ArenaGroups}))),ArenaSuperadmin=lazy(()=>import("./ArenaNetwork").then(m=>({default:m.ArenaSuperadmin})));

function ActivityImage({ activity, imageUrl, loading = "eager" }: { activity: ArenaActivity; imageUrl?: string; loading?: "eager" | "lazy" }) {
  const src = arenaProductImage(activity, imageUrl);
  return src ? <img src={src} alt="" loading={loading} decoding="sync" draggable={false} /> : <ShoppingBag aria-hidden="true" />;
}

export const ArenaActivityButton = memo(function ArenaActivityButton({ activity, focus = false, campaignName, onClick, imageUrl, unavailable = false, fightQualifying=false,battleInfo,battleReward,unavailableLabel }: {
  activity: ArenaActivity; focus?: boolean; campaignName?: string; onClick?: () => void; imageUrl?: string; unavailable?: boolean;fightQualifying?:boolean;battleInfo?:string;battleReward?:string;unavailableLabel?:string;
}) {
  return <button type="button" className={`arena-orb${focus ? " arena-orb-focus" : ""}${fightQualifying?' is-fight-objective':''}`} data-display-mode={activity.display_mode??"points"} onClick={onClick} disabled={unavailable}
    aria-label={unavailable ? `${activity.name}, ej upplagd` : `${activity.name}, ${battleReward??arenaReward(activity).replace("POÄNG","poäng")}${fightQualifying?', räknas i Butiksfight':''}`}>
    <span className="arena-objective-edge" aria-hidden="true"/>
    {fightQualifying&&<span className="arena-objective-badge" aria-hidden="true"><Flag/> FIGHT</span>}
    {focus && <span className="arena-focus-cap"><ArenaFocusTitle label={campaignName || "LAGETS FOKUS"}/><strong className="arena-focus-name">{activity.name}</strong></span>}
    <span className="arena-product">
      <ActivityImage activity={activity} imageUrl={imageUrl} loading="eager" />
    </span>
    {!focus && !battleInfo && <span className="arena-product-copy">{activity.offer_text && <span className="arena-offer">{activity.offer_text}</span>}<strong>{activity.name}</strong>{activity.price_text && <span className="arena-price">{activity.price_text}</span>}</span>}
    <>{battleInfo&&!focus?<span className="arena-battle-copy"><span className="arena-product-copy"><strong>{activity.name}</strong></span><span className="arena-battle-score">{battleInfo}</span><span className="arena-points">{battleReward??`+${new Intl.NumberFormat("sv-SE",{maximumFractionDigits:3}).format(activity.points)} POÄNG`}</span></span>:<>{battleInfo&&<span className="arena-battle-score">{battleInfo}</span>}<span className="arena-points">{unavailable ? unavailableLabel??"EJ UPPLAGD" : battleInfo?battleReward??`+${new Intl.NumberFormat("sv-SE",{maximumFractionDigits:3}).format(activity.points)} POÄNG`:arenaReward(activity)}</span></>}</>
  </button>;
});
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
const People=memo(function People({ stats, onPerson, highlightId, newLeaderId, limit,emptyMessage }: { stats: ArenaStats | null; onPerson?: (p: ArenaPerson) => void; highlightId?: string; newLeaderId?: string; limit?: number;emptyMessage?:string }) {
  const value=(p:ArenaPerson)=>stats?.metric === "tb" ? arenaMoney(p.tb_ore??0) : num(stats?.metric === "count" ? p.count : p.points);
  const unit=stats?.metric === "tb" ? "TB" : stats?.metric === "count" ? "st" : "p";
  return <ol className="arena-leader-list">{stats?.leaderboard.slice(0, limit).map(p => <li key={p.id} className={[highlightId === p.id ? "is-celebrating" : "", newLeaderId === p.id ? "is-new-leader" : ""].filter(Boolean).join(" ") || undefined}>
    <button onClick={onPerson?() => onPerson(p):undefined} disabled={!onPerson} aria-label={`${p.name} ${value(p)} ${unit}`}><span className={`arena-rank rank-${p.rank}`} aria-hidden="true">
      {p.rank}</span><span className="arena-seller-cell"><ArenaAvatar id={p.id} name={p.name} imageUrl={p.profile_url} avatarIndex={p.avatar_index} /><span><ArenaPersonName name={p.name} stationName={p.station_name}/>{newLeaderId === p.id && <small className="arena-new-leader"><Crown aria-hidden="true" /> Ny etta!</small>}{!p.active && <small>Historik</small>}</span></span><strong>{value(p)} <small>{unit}</small></strong>
    </button></li>)}{stats && !stats.leaderboard.length && <li className="arena-empty">{emptyMessage??"Lägg till personal i stationens personalregister."}</li>}</ol>;
});
const feedTime = new Intl.DateTimeFormat("sv-SE", { timeZone:"Europe/Stockholm", hour:"2-digit", minute:"2-digit" });
function FeedStatus({ stats, error }: { stats: ArenaStats | null; error: boolean }) {
  return <span className={`arena-live${error ? " is-paused" : stats?.recent === undefined ? " is-loading" : ""}`}><i aria-hidden="true" />{error ? "PAUSAD" : !stats ? "HÄMTAR" : stats.recent ? "Live" : "SAKNAS"}</span>;
}
const RecentActivities=memo(function RecentActivities({ stats, limit,fightMode=false }: { stats: ArenaStats | null; limit?: number;fightMode?:boolean }) {
  const rows = stats?.recent?.slice(0, limit) ?? [];
  return rows.length ? <ol className="arena-recent-list">{rows.map(row => <li key={row.id} className={row.display_mode === "tb" && row.tb_ore_awarded != null ? "is-tb" : undefined}>
    <span className="arena-feed-seller"><ArenaAvatar id={row.seller_id || stats?.leaderboard.find(p=>p.name===row.seller_name)?.id} name={row.seller_name} imageUrl={row.profile_url} avatarIndex={row.avatar_index} /><span><ArenaPersonName name={row.seller_name} stationName={row.station_name}/><small>{row.activity_name}</small></span></span>
    <b>{row.display_mode === "tb" && row.tb_ore_awarded != null ? `+${arenaMoney(row.tb_ore_awarded)} TB` : `+${num(row.points_awarded)} p`}</b><time dateTime={row.registered_at}>{feedTime.format(new Date(row.registered_at))}</time>
  </li>)}</ol> : <p className="arena-recent-empty">{!stats ? "Hämtar dagens aktiviteter…" : stats.recent ? fightMode?"Fightens första kvalificerande försäljning väntar. Kör på!":"Dagens första försäljning väntar. Kör på!" : "Aktivitetsflödet är inte tillgängligt."}</p>;
});
type Attempt = { activity: ArenaActivity; requestId: string; sellerId?: string };
type Receipt = { registration: ArenaRegistration; requestId: string; name: string };
type Celebration = ArenaAchievement & { key: string; points: number; tbOre?:number | null; sellerId: string; name: string; activity: ArenaActivity; secondary?: string[]; profileUrl?:string | null; avatarIndex?:number|null; fightEvent?:FightFeedback };
const rewardDuration = (special: boolean) => special ? 3600 : 1300;

function PersonDetails({ person, stats, onClose }: { person: ArenaPerson; stats: ArenaStats; onClose: () => void }) {
  const goals = stats.personal_goals.filter(g => g.seller_id === person.id);
  const goal = goals[0], next = stats.leaderboard[person.rank - 2];
  const percent = goal ? Math.min(100, Math.round(100 * goal.points / goal.target_points)) : 0;
  return <>
    <div className="arena-person-heading"><ArenaAvatar id={person.id} name={person.name} imageUrl={person.profile_url} avatarIndex={person.avatar_index} className="arena-person-avatar" /><div><h3>{person.name}</h3><p>Din utveckling. Dina resultat.</p></div><div className="arena-person-rank"><strong>#{person.rank}</strong><small>PLACERING</small></div></div>
    <div className="arena-person-metrics"><div><Star /><small>POÄNG</small><strong>{num(person.points)}</strong></div><div><BarChart3 /><small>REGISTRERINGAR</small><strong>{num(person.count)}</strong></div><div className={`arena-person-goal${goal ? "" : " is-empty"}`}><Target /><small>{goal ? goal.period_type === "week" ? "VECKOMÅL" : goal.period_type === "month" ? "MÅNADSMÅL" : "PERSONLIGT MÅL" : "PERSONLIGT MÅL"}</small><strong>{goal ? `${num(goal.target_points)} p` : "Inte satt ännu"}</strong></div></div>
    <div className="arena-person-tb"><strong>{arenaMoney(person.tb_ore??0)} TB</strong><span>Genererad uppskattad marginal · {arenaPeriodLabel(stats.range.start,stats.range.end)}</span>{!!person.unknown_tb_count && <small>{person.unknown_tb_count} äldre registreringar saknar historiskt TB.</small>}</div>
    <section className="arena-person-progress"><div className="arena-progress-ring" style={{ "--progress": `${percent}%` } as React.CSSProperties} role={goal ? "progressbar" : undefined} aria-label={goal ? "Personligt mål" : undefined} aria-valuemin={goal ? 0 : undefined} aria-valuemax={goal?.target_points} aria-valuenow={goal ? Math.min(goal.points, goal.target_points) : undefined}><span>{goal ? `${percent}%` : <Target />}<small>{goal ? "AV MÅLET" : "NÄSTA MÅL"}</small></span></div><div>{goal ? <><strong>{goal.points >= goal.target_points ? "Målet uppnått!" : `${num(roundedPoints(goal.target_points - goal.points))} poäng kvar`}</strong><p>{arenaPeriodLabel(goal.start_date, goal.end_date, goal.period_type)}</p></> : <><strong>Inget personligt mål satt ännu</strong><p>Stationsadmin kan sätta ett mål för dig. Dina försäljningar räknas redan!</p></>}{next ? <strong className="arena-next-rank">{stats.metric==="tb" ? `${arenaMoney((next.tb_ore??0)-(person.tb_ore??0))} TB` : stats.metric==="count" ? `${next.count-person.count} registreringar` : `${num(roundedPoints(next.points - person.points))} poäng`} till nästa placering</strong> : <strong className="arena-next-rank">{person.points > 0 ? "Du leder. Fortsätt på samma spår!" : "Varje registrering tar dig framåt."}</strong>}</div></section>
    {goals.slice(1).map(g => <section className="arena-extra-goal" key={g.id}><GoalProgress goal={g} /><p>{g.points >= g.target_points ? "Målet uppnått!" : `${num(roundedPoints(g.target_points - g.points))} poäng kvar till målet`}</p></section>)}
    <div className="arena-breakdown-heading"><h3>Mina aktiviteter</h3><small>{arenaPeriodLabel(stats.range.start, stats.range.end)}</small></div><ul className="arena-breakdown">{person.activities.map(a => <li key={a.id}><ShoppingBag aria-hidden="true" /><div><span>{a.name}</span><strong>{num(a.points)} poäng <small>· {a.count} st · {arenaMoney(a.tb_ore??0)} TB</small></strong><i style={{ "--activity-share": `${person.points ? 100 * a.points / person.points : 0}%` } as React.CSSProperties} /></div></li>)}</ul>{!person.activities.length && <p className="arena-breakdown-empty">Din nästa försäljning är början på nästa resultat.</p>}
    <footer className="arena-person-footer"><Trophy /><span><strong>DU GÖR SKILLNAD!</strong><small>Varje registrering räknas.</small></span><button className="arena-gold-action" onClick={onClose}>Fortsätt sälja <ArrowRight /></button></footer>
  </>;
}
const CelebrationCard=memo(function CelebrationCard({ event }: { event: Celebration }) {
  const isGoal = event.kind === "personal-goal" || event.kind === "station-goal" || event.kind === "focus-goal";
  const heading = event.kind === "leader" ? "NY ETTA!" : isGoal ? "MÅL UPPNÅTT!" : event.kind === "milestone" ? "VILKET DRIV!" : null;
  const encouragement = event.kind === "leader" ? event.previousLeader ? `${event.name} går om ${event.previousLeader}` : `${event.name} tar förstaplatsen!` : event.kind === "personal-goal" ? `${event.name} · ${event.text}` : event.kind === "station-goal" ? "Hela laget nådde målet!" : event.text;
  const level=event.level ?? (event.special ? 3 : 1);
  const reward=arenaReward(event.activity,event.points,event.tbOre);
  if(event.fightEvent)return <FightAnnouncement event={event.fightEvent} seller={{id:event.sellerId,name:event.name,imageUrl:event.profileUrl,avatarIndex:event.avatarIndex}} activity={event.activity.name} reward={reward} secondary={event.secondary} />;
  if (level === 3) return <div className={`arena-celebration is-special level-3${event.kind === "leader" || isGoal ? " is-champion-scene" : ""} celebration-${event.kind}`} role="status" style={{"--reward-life":`${rewardDuration(true)}ms`} as React.CSSProperties}>
    <div className="arena-reward-ring arena-victory-hero">
      <div className="arena-victory-art" aria-hidden="true"><b className="arena-champion-number">{event.kind === "leader" ? "#1":<Trophy />}</b>{event.kind === "leader" || isGoal ? <ArenaChampion eventKey={event.key} identity={{id:event.sellerId,name:event.name,imageUrl:event.profileUrl,avatarIndex:event.avatarIndex}}/> : <ArenaAvatar id={event.sellerId} name={event.name} imageUrl={event.profileUrl} avatarIndex={event.avatarIndex} champion className="arena-champion-portrait" />}<Crown className="arena-champion-crown" />{event.kind !== "leader" && !isGoal && <Trophy className="arena-champion-trophy" />}</div>
      <div className="arena-victory-copy"><span className="arena-eyebrow">{isGoal ? `${event.kind === "focus-goal" ? "FOKUSMÅL" : event.kind === "personal-goal" ? "PERSONLIGT MÅL" : "LAGETS MÅL"}${event.goal?.period_type === "week" ? " · VECKA" : event.goal?.period_type === "month" ? " · MÅNAD" : ""}` : event.scope || "DITT RESULTAT GÖR SKILLNAD"}</span><h2>{heading}</h2><span className="arena-milestone-subtitle">{encouragement}</span>
        {event.kind!=="leader" && <strong className="arena-reward-seller">{event.name}</strong>}
        <div className="arena-victory-sale"><strong className="arena-reward-points">{reward}!</strong><div className="arena-reward-activity">{event.activity.name}</div></div>
        {isGoal && event.goal && <div className="arena-reward-goal"><Check aria-hidden="true" />{num(event.goal.points)} / {num(event.goal.target_points)} {event.goalMetric === "count" ? "försäljningar" : "poäng"}</div>}
        {event.secondary?.length ? <p className="arena-victory-secondary">{event.secondary.join(" · ")}</p> : null}
        <span className="arena-reward-confirmation">FÖRSÄLJNINGEN REGISTRERAD</span><strong className="arena-reward-pep">SNYGGT JOBBAT!</strong>
      </div>
      {Array.from({length:16},(_,i)=><i key={i} className="arena-confetti" style={{"--i":i} as React.CSSProperties} aria-hidden="true" />)}
    </div>
  </div>;
  return <div className={`arena-celebration${event.special ? " is-special" : ""}${event.activity.display_mode === "tb" ? " reward-tb" : ""} level-${level} celebration-${event.kind}`} role="status" style={{ "--reward-life": `${rewardDuration(event.special)}ms` } as React.CSSProperties}>
    <div className="arena-reward-ring" key={event.kind}>
      {event.special && <div className="arena-reward-crown" aria-hidden="true">{event.kind==="milestone" ? <Target /> : isGoal ? <Trophy /> : <><Crown /><b>1</b></>}</div>}
      {level===2 && <ArenaAvatar id={event.sellerId} name={event.name} imageUrl={event.profileUrl} avatarIndex={event.avatarIndex} className="arena-milestone-avatar" />}
      <div className="arena-reward-product" aria-hidden="true"><ActivityImage activity={event.activity} /></div>
      <div className="arena-reward-activity">{event.activity.name}</div>
      {event.activity.offer_text && <small className="arena-reward-offer">{event.activity.offer_text}</small>}
      {heading && <><h2>{heading}</h2><span className="arena-milestone-subtitle">{encouragement}</span></>}
      <strong className="arena-reward-points">{reward}!</strong>
      <strong className="arena-reward-seller">{event.name}</strong>
      <span className="arena-reward-confirmation">FÖRSÄLJNINGEN REGISTRERAD</span>
      <div className="arena-reward-check" aria-hidden="true"><Check /></div>
      <strong className="arena-reward-pep">BRA JOBBAT!</strong>
      {!event.special && <span className="arena-reward-encouragement">{encouragement}</span>}
      {isGoal && event.goal && <div className="arena-reward-goal"><Trophy aria-hidden="true" /><span>{num(event.goal.points)} / {num(event.goal.target_points)} poäng</span></div>}
      {Array.from({ length: event.special ? 12 : 6 }, (_, i) => <i key={i} className="arena-confetti" style={{ "--i": i } as React.CSSProperties} aria-hidden="true" />)}
    </div>
  </div>;
});
export default function ArenaApp() { return <ArenaShowcaseProvider><Suspense fallback={<p role="status">Laddar Arenan…</p>}><ArenaRoutes /></Suspense></ArenaShowcaseProvider>; }
function ArenaRoutes() {
  useArenaEntryStatus(!['/arena','/arena/'].includes(window.location.pathname));
  if(window.location.pathname==="/arena/recovery")return <ArenaRecovery/>;
  if(window.location.pathname==="/arena/competitions")return <ArenaContestHub/>;
  if(window.location.pathname==="/arena/superadmin/contests")return <ArenaContestHub admin/>;
  if(window.location.pathname==="/arena/admin/competitions")return <ArenaContestHub local/>;
  if(/^\/arena\/(?:superadmin\/)?competitions\//.test(window.location.pathname))return <ArenaCompetition/>;
  if(window.location.pathname==="/arena/fights")return <ArenaCompetitions/>;
  if(window.location.pathname.startsWith("/arena/leagues/") || window.location.pathname.startsWith("/arena/superadmin/leagues/"))return <ArenaLeague/>;
  if(window.location.pathname.startsWith("/arena/fights/") || window.location.pathname.startsWith("/arena/superadmin/fights/"))return <ArenaFight />;
  if(window.location.pathname.startsWith("/arena/superadmin"))return <ArenaSuperadmin />;
  if(window.location.pathname.startsWith("/arena/groups"))return <ArenaGroups />;
  if(["/arena/account","/arena/join","/arena/login"].includes(window.location.pathname))return <ArenaAccount />;
  return window.location.pathname.startsWith("/arena/admin") ? <ArenaAdmin /> : <ArenaHome />;
}
function ArenaHome() {
  const showcase=useArenaShowcase();
  const [fightPerson,setFightPerson]=useState<ArenaPerson|null>(null);
  const [data, setData] = useState<ArenaBootstrap | null>(null);
  const [bootstrapError,setBootstrapError]=useState('');
  const [stats, setStats] = useState<ArenaStats | null>(null);
  const [todayStats, setTodayStats] = useState<ArenaStats | null>(null);
  const todayRef=useRef<ArenaStats|null>(null),fightSeen=useRef(new Set<string>()),finalTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const previousFight=useRef<ArenaStats["fight"]>(undefined);
  const [fightFinal,setFightFinal]=useState<FightFeedback|null>(null);
  const [personScope, setPersonScope] = useState<"today" | "selected">("today");
  const [statsUnavailable, setStatsUnavailable] = useState(false);
  const [period, setPeriod] = useState("today"), [start, setStart] = useState(""), [end, setEnd] = useState("");
  const [activityFilter, setActivityFilter] = useState(""), [category, setCategory] = useState("");
  const [metric,setMetric]=useState("points");
  const [attempt, setAttempt] = useState<Attempt | null>(null), [busy, setBusy] = useState(false), [saleError, setSaleError] = useState("");
  const [error, setError] = useState(""), [personId, setPersonId] = useState<string | null>(null), [panel, setPanel] = useState<"leaders" | "recent" | "campaign" | "fight" | null>(new URLSearchParams(location.search).get("panel")==="campaign"?"campaign":null);
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
  const statsRequests=useMemo(()=>arenaRequests<ArenaStats>((key,signal)=>api(`/arena/stats?${key}`,{signal})),[]);
  const refresh = useCallback(async () => {
    const version = ++statsVersion.current;
    try {
      const todayRequest = statsRequests.request("period=today&metric=points");
      const selectedRequest = queryRef.current === "period=today&metric=points" ? todayRequest : statsRequests.request(queryRef.current);
      const [next, today] = await Promise.all([selectedRequest, todayRequest]);
      if (version === statsVersion.current) { statsRef.current = next; todayRef.current=today; startTransition(()=>{setStats(next);setTodayStats(today);setStatsUnavailable(false);setError("");}); }
      return next;
    } catch (e) { if (version === statsVersion.current) { setStatsUnavailable(true); setError((e as Error).message); } return null; }
  }, [statsRequests]);
  const onFightBoundary=useCallback(()=>{void refresh();},[refresh]);
  const bootstrap = useCallback(async () => {
    setBootstrapError('');
    try { setData(await api<ArenaBootstrap>("/arena/bootstrap")); setError(""); } catch (e) { if(e instanceof HttpError && e.status===401)window.location.assign("/arena/account");else {setBootstrapError((e as Error).message);setError((e as Error).message);} }
  }, []);
  const retryEntry=useCallback(()=>{setError('');void bootstrap();void refresh();},[bootstrap,refresh]);
  useArenaEntryStatus(!!data&&!!todayStats,(!data||!todayStats)?bootstrapError||error||(!todayStats&&statsUnavailable?'Statistiken kunde inte laddas. Försök igen.':undefined):undefined,retryEntry);
  useEffect(() => {
    document.documentElement.classList.add("arena-view");
    void bootstrap();
    return () => { document.documentElement.classList.remove("arena-view"); celebrationAllowed.current = ""; ++statsVersion.current;statsRequests.invalidate(); clearTimeout(refreshTimer.current); clearTimeout(celebrationTimer.current); clearTimeout(finalTimer.current); };
  }, [bootstrap,statsRequests]);
  const activeFight=todayStats?.fight?.phase==="active";
  const modeKey=`${data?.station.id??''}:${todayStats?.fight?.id??''}`;
  const [modeChoice,setModeChoice]=useState<{key:string;mode:'station'|'battle'}|null>(null);
  const [battleChoices,setBattleChoices]=useState<ArenaActivity[]|null>(null),[battleIntro,setBattleIntro]=useState(false);
  const preferred=modeChoice?.key===modeKey?modeChoice.mode:(()=>{try{return battlePreference(data?.station.id??'',todayStats?.fight?.id??'',localStorage);}catch{return 'battle';}})();
  const battleUnavailable=!!todayStats?.battle?.unavailable_reason;
  const fullBattle=!!(activeFight&&preferred==='battle'&&todayStats?.battle?.categories.length&&!todayStats.battle.unavailable_reason);
  const chooseMode=(mode:'station'|'battle')=>{setModeChoice({key:modeKey,mode});try{localStorage.setItem(`arena:battle-mode:${data?.station.id}:${todayStats?.fight?.id}`,mode);}catch{/* memory fallback */}};
  useEffect(()=>{if(!fullBattle||!todayStats?.fight)return;const key=`arena:battle-intro:${modeKey}`;try{if(localStorage.getItem(key))return;localStorage.setItem(key,'1');}catch{if(fightSeen.current.has(key))return;fightSeen.current.add(key);}setBattleIntro(true);const timer=setTimeout(()=>setBattleIntro(false),1500);return()=>{clearTimeout(timer);setBattleIntro(false);};},[fullBattle,modeKey]);
  const fightContext=activeFight&&!battleUnavailable&&preferred==='battle'?todayStats?.fight_dashboard:undefined;
  const dashboardStats=useMemo(()=>fightContext&&todayStats?{...todayStats,metric:fightContext.metric,leaderboard:fightContext.leaderboard,recent:fightContext.recent}:todayStats,[fightContext,todayStats]);
  useEffect(()=>{
    let lastBootstrap=Date.now();
    const stopPolling=visibleArenaPolling(async()=>{
      if(lock.current)return;
      const reloadPeople=Date.now()-lastBootstrap>=60000;
      if(reloadPeople){lastBootstrap=Date.now();await Promise.all([bootstrap(),refresh()]);}else await refresh();
    },()=>todayRef.current?.fight?.phase==="active"?ARENA_FIGHT_SYNC_MS:ARENA_SYNC_MS);
    return stopPolling;
  }, [bootstrap,refresh,activeFight]);
  useEffect(() => { if (period !== "custom" || (start && end)) { setStats(null); void refresh(); } }, [query, period, start, end, refresh]);
  const selectorRef=useRef<ArenaSellerSelectorHandle|null>(null);
  const setSelection = useCallback((next: Attempt | null) => { attemptRef.current = next; selectorRef.current?.select(next);startTransition(()=>setAttempt(next)); },[]);
  const [focus, ...other] = useMemo(()=>fullBattle?battleSlots(todayStats!.battle!,data?.activities??[]):arenaStartActivities(data?.activities ?? []),[data?.activities,fullBattle,todayStats?.battle]);
  const begin = useCallback((activity: ArenaActivity) => {
    if (lock.current || attemptRef.current) return;
    celebrationAllowed.current = "";
    setSelection({ activity, requestId: crypto.randomUUID() });
    startTransition(()=>{setFightFinal(null);setSaleError("");});
  },[setSelection]);
  const activityActions=useMemo(()=>new Map((data?.activities??[]).map(activity=>[activity.id,()=>begin(activity)])),[data?.activities,begin]);
  const battleAction=(key:string)=>{const cat=todayStats?.battle?.categories.find(c=>c.id===key);const activities=(cat?.activities??[]).flatMap(a=>data?.activities.find(l=>l.id===a.id&&l.active===1)??[]);if(activities.length===1)begin(activities[0]);else if(activities.length)setBattleChoices(activities);};
  const battleInfo=(index:number)=>{const c=todayStats?.battle?.categories[index];return fullBattle&&c?todayStats?.fight?.metric==='count'?`${c.count} sålda i matchen`:todayStats?.fight?.metric==='tb'?`${c.count} sålda · ${arenaMoney(c.tb_ore??0)} TB`:`${c.count} sålda · ${new Intl.NumberFormat('sv-SE',{maximumFractionDigits:3}).format(c.points_milli/1000)} p`:undefined;};
  const battleReward=todayStats?.fight?.metric==='count'?'+1 ST':todayStats?.fight?.metric==='tb'?'RÄKNAR TB':undefined;
  const battleImage=(index:number)=>{const a=todayStats?.battle?.categories[index]?.activities[0];return fullBattle&&a?arenaProductImage(a)??undefined:undefined;};
  async function register(sellerId: string) {
    const selected = attemptRef.current;
    if (!selected || lock.current || (selected.sellerId && selected.sellerId !== sellerId)) return;
    lock.current = true; setBusy(true); setSaleError("");
    const pending = { ...selected, sellerId }; setSelection(pending);
    const before = statsRef.current,beforeToday=todayRef.current,beforeFight=beforeToday?.fight;
    const seller=data?.sellers.find(s=>s.id===sellerId);
    const localSale=(registration:ArenaRegistration)=>{
      // An uncertain retry may already be in the server snapshot. Reconcile it
      // via the idempotent receipt + refresh rather than showing a second gain.
      if(!seller || selected.sellerId)return;
      const query=new URLSearchParams(queryRef.current);
      const next=arenaLocalSale(before,seller,pending.activity,registration,{activityId:query.get("activity_id")??"",category:query.get("category")??""});
      const today=arenaLocalSale(beforeToday,seller,pending.activity,registration);
      statsRef.current=next;todayRef.current=today;setStats(next);setTodayStats(today);
    };
    ++statsVersion.current; // Reject a poll started before this optimistic transaction.
    statsRequests.invalidate();
    localSale({id:pending.requestId,seller_id:sellerId,activity_id:pending.activity.id,points_awarded:pending.activity.points,tb_ore_awarded:pending.activity.tb_ore,registered_at:new Date().toISOString(),voided_at:null});
    try {
      const { registration, achievements } = await api<{ registration: ArenaRegistration; achievements?:EvaluatedAchievement[] }>("/arena/registrations", send("POST", {
        request_id: pending.requestId, activity_id: pending.activity.id, seller_id: sellerId,
        achievement_context:{period:period === "custom" && (!start || !end) ? "today" : period,metric,...(period === "custom" && start && end ? {start,end} : {})},
      }));
      localSale({...registration,registered_at:registration.registered_at??new Date().toISOString()});
      if (registration.voided_at) throw new HttpError("Registreringen har redan ångrats. Välj aktiviteten på nytt.", 409);
      const name = data?.sellers.find(s => s.id === sellerId)?.name ?? "Säljaren";
      const primary=achievements?.[0];
      const burst: Celebration = { key: registration.id, points: registration.points_awarded,tbOre:registration.tb_ore_awarded??null, text: `${name}, snyggt jobbat!`, special: false, kind: "points", sellerId, name, profileUrl:data?.sellers.find(s=>s.id===sellerId)?.profile_url, avatarIndex:data?.sellers.find(s=>s.id===sellerId)?.avatar_index, activity: pending.activity,...primary,secondary:achievements ? [...new Set(achievements.slice(1).map(e=>`${e.text} ${e.scope}`))] : undefined };
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
          const fightEvent=data?.station.id ? fightTransition(beforeFight,todayRef.current?.fight,data.station.id):null;
          const fresh=fightEvent && !fightSeen.current.has(fightEvent.key) ? fightEvent:null;
          if(fresh)fightSeen.current.add(fresh.key);
          const hero=event.level===3 || (event.special && event.level!==2);
          const next={...burst,...event,...(fresh && !hero ? {fightEvent:fresh}:{}),secondary:[...(burst.secondary??[]),...(fresh && hero ? [fresh.kind==="lead" ? "Laget tar ledningen i Butiksfight!":"Laget kvitterar i Butiksfight!"]:[])]};
          setCelebration(current => current?.key === registration.id ? {...current,...next} : event.special || fresh ? next:current);
          if ((event.special || fresh) && lastCelebrated.current === registration.id) {
            clearTimeout(celebrationTimer.current);
            celebrationTimer.current = setTimeout(() => setCelebration(current => current?.key === registration.id ? null : current), fresh?.kind === "tie" && !hero ? rewardDuration(false):rewardDuration(true));
          }
        });
      }, 180);
    } catch (e) {
      statsRef.current=before;todayRef.current=beforeToday;setStats(before);setTodayStats(beforeToday);
      const definitive = e instanceof HttpError && e.status >= 400 && e.status < 500;
      setSaleError(definitive ? (e as Error).message : "Svaret kunde inte bekräftas. Försök igen med samma registrering så räknas den bara en gång.");
      if (definitive) { setSelection({ ...pending, requestId: crypto.randomUUID(), sellerId: undefined }); void bootstrap(); }
    } finally { lock.current = false; setBusy(false); }
  }
  async function undo() {
    if (!receipt || lock.current) return;
    lock.current = true; setBusy(true);
    ++statsVersion.current;statsRequests.invalidate();
    try {
      await api(`/arena/registrations/${receipt.registration.id}/void`, send("POST", { request_id: receipt.requestId }));
      celebrationAllowed.current = ""; setReceipt(null); setCelebration(null); setFightFinal(null); await refresh();
    } catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  useEffect(()=>{
    const fight=todayStats?.fight,stationId=data?.station.id;
    if(!fight || fight.phase!=="finished" || !fight.winner_ids?.length || !stationId || celebration || attempt || attemptRef.current || fightFinal)return;
    const key=`arena:fight-final:${stationId}:${fight.id}`;
    if(fightSeen.current.has(key))return;
    try{if(localStorage.getItem(key))return;localStorage.setItem(key,"1");}catch{/* In-memory dedupe remains available. */}
    fightSeen.current.add(key);setFightFinal({kind:"final",key,fight,stationId});
    clearTimeout(finalTimer.current);finalTimer.current=setTimeout(()=>setFightFinal(null),3600);
  },[todayStats?.fight,data?.station.id,celebration,attempt,fightFinal]);
  useEffect(()=>{
    const after=todayStats?.fight,before=previousFight.current;previousFight.current=after;
    // Own sales already include the seller portrait and contribution in their
    // receipt. Also present a real crossing received from another terminal.
    if(!data?.station.id || busy || celebration || attempt || attemptRef.current || fightFinal)return;
    const event=fightTransition(before,after,data.station.id);
    if(!event || fightSeen.current.has(event.key))return;
    fightSeen.current.add(event.key);setFightFinal(event);clearTimeout(finalTimer.current);
    finalTimer.current=setTimeout(()=>setFightFinal(null),event.kind==="tie" ? 2600:3600);
  },[todayStats?.fight,data?.station.id,busy,celebration,attempt,fightFinal]);
  const personStats = personScope === "today" ? todayStats : stats;
  useEffect(()=>{setFightPerson(null);},[fightContext?.fight_id]);
  const person = personStats?.leaderboard.find(p => p.id === personId);
  const onTodayPerson=useCallback((p:ArenaPerson)=>{setPersonScope("today");setPersonId(p.id);},[]);
  const onSelectedPerson=useCallback((p:ArenaPerson)=>{setPanel(null);setPersonScope("selected");setPersonId(p.id);},[]);
  const campaign = todayStats?.campaign;
  const goal = todayStats?.station_goals[0];
  const controls = <>
    <div className="arena-tabs" aria-label="Statistikperiod">{[["today", "IDAG"], ["week", "VECKA"], ["month", "MÅNAD"], ["custom", "PERIOD"]].map(([value, label]) => <button key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}</div>
    {period === "custom" && <div className="arena-dates"><label>Från<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label><label>Till<input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label></div>}
  </>;
  return <div className={`arena-shell arena-theme${celebration?.special ? " has-achievement" : ""}`}>
    <header className="arena-header">
      <a href={data?.station.kind==="arena" ? "/arena":"/station"} className="arena-brand" aria-label={data?.station.kind==="arena" ? "Till Arenan":"Till stationsdashboarden"}><ArenaEmblem/><span><strong>ARENAN</strong><small>SÄLJ MER. TILLSAMMANS.</small></span></a>
      <div className="arena-team-goal">{goal ? <GoalProgress goal={goal} label="MÅNADENS MÅL" hud /> : campaign?.target_points ? <Progress points={campaign.points} target={campaign.target_points} label="MÅNADENS MÅL" hud /> : campaign?.target_count ? <Progress points={campaign.count} target={campaign.target_count} label="MÅNADENS MÅL" suffix="försäljningar" hud /> : <div className="arena-no-goal"><Star /><span>VARJE FÖRSÄLJNING RÄKNAS<strong>Tillsammans mot nästa mål</strong></span></div>}</div>
      <p className="arena-header-station"><span>DIN ARENA</span><strong>{data?.station.name??"LAGETS ARENA"}</strong></p>
    </header>
    {(error || statsUnavailable) && <div className="arena-error" role="alert">{error || "Statistiken är tillfälligt otillgänglig."}<button onClick={() => { void bootstrap(); void refresh(); }}>Försök igen</button></div>}
    <main className="arena-main">
      <ArenaPersonContext stationIds={fightContext?.station_ids??[data?.station.id??'']}><div className="arena-left-column" data-context={fightContext?'fight':'local'} key={fightContext?.fight_id??'local'}>
        <aside className="arena-leaderboard arena-panel" aria-label={fightContext?"Butiksfight live":"Topplista idag"}><header><h2>{fightContext?"BUTIKSFIGHT – LIVE":"TOPPLISTA – IDAG"}</h2><button className="arena-panel-more" onClick={()=>setPanel(fightContext?"fight":"leaders")}>Visa alla</button></header><People stats={dashboardStats} limit={5} emptyMessage={fightContext?"Fightens första kvalificerande försäljning väntar.":undefined} onPerson={fightContext?p=>{setPanel(null);setFightPerson(p);}:onTodayPerson} highlightId={celebration?.sellerId} newLeaderId={celebration?.kind === "leader" ? celebration.sellerId : undefined} /></aside>
        <aside className="arena-recent arena-panel"><header><button aria-label="Öppna senaste aktiviteter" onClick={() => setPanel("recent")}><h2>SENASTE AKTIVITETER</h2></button><FeedStatus stats={todayStats} error={statsUnavailable} /></header><RecentActivities stats={dashboardStats} fightMode={!!fightContext} limit={5} /></aside>
      </div></ArenaPersonContext>
      <section className={`arena-stage arena-stage-start${fullBattle?" is-battle":""}`} aria-label="Försäljningsaktiviteter">
        {fullBattle&&<BattleSwords/>}
        <nav className="arena-mode-switch" aria-label="Visningsläge"><button aria-pressed={!activeFight||battleUnavailable||preferred==='station'} onClick={()=>chooseMode('station')}>STATION</button><a href="/arena/competitions">TÄVLINGAR</a><button disabled={!activeFight||battleUnavailable} title={todayStats?.battle?.unavailable_reason} aria-pressed={!!activeFight&&!battleUnavailable&&preferred==='battle'} onClick={()=>chooseMode('battle')}>BUTIKSFIGHT</button></nav>
        <div className="arena-stage-atmosphere" aria-hidden="true"><i className="arena-stage-architecture"/><i className="arena-stage-beams"/><i className="arena-stage-floor"/><i className="arena-stage-sparks"/></div>
        <div className="arena-stage-label"><span className="arena-eyebrow">SMÅ AFFÄRER. STORA RESULTAT.</span><small>Tryck på en aktivitet för att registrera</small></div>
        <div className="arena-mobile-panels"><button aria-label="Öppna topplistan" onClick={() => setPanel(fightContext?"fight":"leaders")}><BarChart3 aria-hidden="true" /> Topplista</button><button aria-label="Öppna senaste aktiviteter" onClick={() => setPanel("recent")}><Clock3 aria-hidden="true" /> Senaste aktiviteter<span className={`arena-live-dot${statsUnavailable ? " is-paused" : todayStats?.recent === undefined ? " is-loading" : ""}`} aria-hidden="true" /></button></div>
        {data ? <div className="arena-cluster">
          <div className="arena-focus-slot"><ArenaActivityButton activity={focus.view} focus campaignName={fullBattle?"BATTLE MODE":"MÅNADENS FOKUS"} battleInfo={battleInfo(0)} battleReward={battleReward} imageUrl={battleImage(0)} unavailableLabel={fullBattle?"INAKTIV":undefined} unavailable={!focus.activity} fightQualifying={arenaFightQualifies(todayStats,focus.activity)} onClick={focus.activity ? fullBattle?()=>battleAction(focus.key):activityActions.get(focus.activity.id) : undefined} /></div>
          <div className="arena-satellites">{other.map(({ key, activity, view }, index) => <div key={key} className={`arena-satellite satellite-${index}`}><ArenaActivityButton activity={view} battleInfo={battleInfo(index+1)} battleReward={battleReward} imageUrl={battleImage(index+1)} unavailableLabel={fullBattle?"INAKTIV":undefined} unavailable={!activity} fightQualifying={arenaFightQualifies(todayStats,activity)} onClick={activity ? fullBattle?()=>battleAction(key):activityActions.get(activity.id) : undefined} /></div>)}</div>
        </div> : <div className="arena-empty-stage"><Crown /><h1>{data ? "Redo att skapa er Arena?" : "Laddar Arenan…"}</h1>{data && <><p>Lägg till aktiviteter och en fokus-kampanj för laget.</p><a href="/arena/admin">Öppna Arena-admin <ChevronRight /></a></>}</div>}
      </section>
      <ArenaStatePanel sellers={data?.sellers} activities={data?.activities} stats={todayStats} stationId={data?.station.id ?? ""} stationName={data?.station.name ?? "Laget"} onBoundary={onFightBoundary} />
    </main>
    <div className="arena-utility"><div className="arena-utility-links">{data?.station.kind!=="arena" && <a href="/station"><ArrowLeft /> Stationsdashboard</a>}<a href="/arena/account" aria-label="Stationskonto"><Users /></a></div><div className="arena-utility-actions">{receipt && <button onClick={() => void undo()} disabled={busy}><RotateCcw /><span>Ångra senaste · {receipt.name}</span></button>}{celebration && <button aria-label="Stäng belöning" onClick={() => { celebrationAllowed.current = ""; setCelebration(null); }}><X /></button>}</div></div>
    <section className="arena-stats-bar" aria-label="Dagens stats"><h2>DAGENS STATS</h2>
      <div><BarChart3 aria-hidden="true" /><strong>{todayStats ? num(todayStats.today.count) : "—"}</strong><span>Registreringar</span></div>
      <div><Star aria-hidden="true" /><strong>{todayStats ? num(todayStats.today.points) : "—"}</strong><span>Poäng idag</span></div>
      <div><Users aria-hidden="true" /><strong>{todayStats?.today.sellers ?? "—"}</strong><span>Aktiva säljare</span></div>
    </section>
    <nav className="arena-nav" aria-label="Arena"><button onClick={() => setPanel("leaders")}><BarChart3 /> TOPPLISTOR</button><button onClick={() => setPanel("campaign")}><Trophy /> KAMPANJER</button><button className="arena-nav-home" aria-current="page" onClick={() => { setPanel(null); setPersonId(null); }}><span className="arena-nav-core" aria-hidden="true"><ArenaEmblem className="arena-nav-emblem"/></span><span>START</span></button><a href="/arena/fights" className={todayStats?.fight_notices?.incoming?"has-fight-notice":todayStats?.fight?.phase==="active"?"has-live-fight":todayStats?.fight_notices?.outgoing?"has-pending-fight":todayStats?.fight_notices?.scheduled?"has-upcoming-fight":undefined}><Flag /> BUTIKSFIGHT{!!todayStats?.fight_notices?.incoming&&<span className="arena-fight-nav-badge" aria-label={`${todayStats.fight_notices.incoming} inkommande utmaningar`}>{todayStats.fight_notices.incoming}</span>}{!todayStats?.fight_notices?.incoming&&!!todayStats?.fight_notices?.outgoing&&<span className="arena-fight-nav-pending" aria-label="Utmaning väntar på svar"><Clock3/></span>}{!todayStats?.fight_notices?.incoming&&!todayStats?.fight_notices?.outgoing&&!!todayStats?.fight_notices?.unread&&<span className="arena-fight-nav-dot" aria-label="Nytt fightbesked"/>}</a><a href="/arena/admin"><Settings /> ADMIN</a></nav>
    {battleIntro&&fullBattle&&<div className="arena-battle-intro" aria-hidden="true"><strong>BATTLE MODE</strong><span>{todayStats?.fight?.standings.map(s=>s.name).join(' VS ')}</span></div>}
    {battleChoices&&<ArenaDialog title="Välj aktivitet i matchkategorin" onClose={()=>setBattleChoices(null)}>{battleChoices.map(a=><button className="arena-action" key={a.id} onClick={()=>{setBattleChoices(null);begin(a);}}>{a.name}</button>)}</ArenaDialog>}
    <ArenaSellerSelector ref={selectorRef} sellers={data?.sellers} busy={busy} error={saleError} onRegister={sellerId=>void register(sellerId)} onClose={()=>{setSelection(null);setSaleError("");}} Product={ActivityImage} />
    {person && <ArenaDialog title={`${person.name} · Min Arena`} heading="MIN ARENA" eyebrow="MIN UTVECKLING. MINA RESULTAT." className="arena-dialog-person" onClose={() => setPersonId(null)}>
      <PersonDetails person={person} stats={personStats!} onClose={() => setPersonId(null)} />
    </ArenaDialog>}
    {fightPerson&&<ArenaDialog title={`${fightPerson.name} · Butiksfight`} heading="MIN FIGHT" eyebrow="FIGHTENS PERSONPRESTATIONER" onClose={()=>setFightPerson(null)}><ArenaPersonContext stationIds={fightContext?.station_ids??[]}><div className="arena-person-heading"><ArenaAvatar id={fightPerson.id} name={fightPerson.name} imageUrl={fightPerson.profile_url} avatarIndex={fightPerson.avatar_index} className="arena-person-avatar"/><h3><ArenaPersonName name={fightPerson.name} stationName={fightPerson.station_name}/></h3></div></ArenaPersonContext><p>#{fightPerson.rank} i den aktuella fighten · {num(fightPerson.points)} poäng · {arenaMoney(fightPerson.tb_ore??0)} TB · {fightPerson.count} registreringar</p><p>Endast försäljningar som räknas i denna fight.</p></ArenaDialog>}
    {panel==='fight'&&<ArenaDialog title="Butiksfight – Live" eyebrow="FIGHTENS PERSONPRESTATIONER" onClose={()=>setPanel(null)}><ArenaPersonContext stationIds={fightContext?.station_ids??[]}><People stats={dashboardStats} emptyMessage="Fightens första kvalificerande försäljning väntar." onPerson={p=>{setPanel(null);setFightPerson(p);}}/></ArenaPersonContext><p>Stationens interna tävling fortsätter som vanligt. Öppna TOPPLISTOR för lokala resultat.</p></ArenaDialog>}
    {panel === "leaders" && <ArenaDialog title="Topplistor & statistik" className="arena-dialog-leaders" eyebrow="LAGETS RESULTAT" onClose={() => setPanel(null)}>{controls}
      <a className="arena-network-link" href="/arena/groups"><Users /> Gemensamma topplistor</a>
      <label>Mått<select aria-label="Mått" value={metric} onChange={e=>setMetric(e.target.value)}><option value="points">Poäng</option><option value="tb">TB</option><option value="count">Antal registreringar</option></select></label>
      <div className="arena-filters"><label>Aktivitet<select value={activityFilter} onChange={e => setActivityFilter(e.target.value)}><option value="">Alla aktiviteter</option>{data?.activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Kategori<select value={category} onChange={e => setCategory(e.target.value)}><option value="">Alla kategorier</option>{[...new Set(data?.activities.map(a => a.category).filter(Boolean))].map(c => <option key={c}>{c}</option>)}</select></label></div>
      <p>{stats ? `${num(stats.points)} poäng · ${num(stats.count)} merförsäljningar · ${arenaMoney(stats.tb_ore??0)} TB` : "Hämtar statistik…"}</p>{!!stats?.unknown_tb_count && <p>{stats.unknown_tb_count} äldre registreringar saknar historiskt TB.</p>}<People stats={stats} onPerson={onSelectedPerson} />
    </ArenaDialog>}
    {panel === "recent" && <ArenaDialog title="Senaste aktiviteter" className="arena-dialog-recent" eyebrow="DAGENS FÖRSÄLJNINGAR" onClose={() => setPanel(null)}><ArenaPersonContext stationIds={fightContext?.station_ids??[data?.station.id??'']}><FeedStatus stats={dashboardStats} error={statsUnavailable} /><RecentActivities stats={dashboardStats} fightMode={!!fightContext} /></ArenaPersonContext></ArenaDialog>}
    {panel === "campaign" && <ArenaDialog title="Lagets kampanj & mål" className="arena-dialog-campaign" eyebrow="TILLSAMMANS MOT NÄSTA MÅL" onClose={() => setPanel(null)}>{campaign ? <>
      <h3>{campaign.name}</h3><p>{data?.activities.find(a => a.id === campaign.activity_id)?.name}</p><p>{new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "medium" }).format(new Date(campaign.start_at))} – {new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "medium" }).format(new Date(Date.parse(campaign.end_at) - 1))}</p>
      {campaign.target_points && <Progress points={campaign.points} target={campaign.target_points} label="KAMPANJMÅL" />}{campaign.target_count && <Progress points={campaign.count} target={campaign.target_count} label="MERFÖRSÄLJNINGAR" suffix="st" />}
    </> : <p>Ingen aktiv kampanj just nu.</p>}{stats?.station_goals.map(g => <section key={g.id}><GoalProgress goal={g} /></section>)}</ArenaDialog>}
    {celebration && <CelebrationCard key={`${celebration.key}-${celebration.kind}`} event={celebration} />}
    {fightFinal && !celebration && !attempt && <FightAnnouncement event={fightFinal} />}
  </div>;
}
