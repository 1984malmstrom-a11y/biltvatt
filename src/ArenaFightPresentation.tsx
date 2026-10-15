import {useEffect,useRef,useState} from "react";
import {Crown,Flag,Trophy,ChevronRight,Check} from "lucide-react";
import type {ArenaFightSummary,ArenaFightEvent} from "../shared/arena-fights";
import {fightScore,fightLeaders} from "../shared/arena-fights";
import {arenaMoney} from "../shared/arena-money";
import {arenaNumber} from "../shared/arena";
import ArenaFightClock from "./ArenaFightClock";
import ArenaAvatar from "./ArenaAvatar";
import type {FightFeedback} from "./arena-fight-feedback";
export const formatFightScore=(score:number,metric:ArenaFightSummary["metric"])=>metric==="tb" ? `${arenaMoney(score)} TB`:`${arenaNumber(score)} ${metric==="count" ? "st":"p"}`;
const date=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",day:"numeric",month:"short"});
const time=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",hour:"2-digit",minute:"2-digit"});
export function FightWidget({fight,stationId,onBoundary}:{fight:ArenaFightSummary;stationId:string;onBoundary:()=>void}) {
  const own=fight.standings.find(s=>s.id===stationId),opponent=fight.standings.find(s=>s.id!==stationId),leader=fight.standings[0];
  const leaders=fightLeaders(fight.standings,fight.metric),gap=own && opponent ? fightScore(own,fight.metric)-fightScore(opponent,fight.metric):0;
  const pair=fight.standings.length===2;
  const leaderKey=[...leaders].sort().join(":"),previous=useRef({id:fight.id,leaderKey,version:fight.version});
  const [surge,setSurge]=useState(false),surgeTimer=useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(()=>()=>clearTimeout(surgeTimer.current),[]);
  useEffect(()=>{
    const before=previous.current;previous.current={id:fight.id,leaderKey,version:fight.version};
    if(before.id!==fight.id || before.leaderKey===leaderKey || fight.version<=before.version || fight.phase!=="active")return;
    clearTimeout(surgeTimer.current);setSurge(true);surgeTimer.current=setTimeout(()=>setSurge(false),1600);
  },[fight.id,fight.version,fight.phase,leaderKey]);
  const high=fight.standings[0] ? fightScore(fight.standings[0],fight.metric):0;
  const total=fight.standings.reduce((n,s)=>n+fightScore(s,fight.metric),0);
  const share=total>0 && own ? 100*fightScore(own,fight.metric)/total:50;
  return <a className={`arena-fight-widget${pair ? " is-duel":" is-ranking"}${surge ? " is-surging":""}${leaders.length>1 ? " is-tied":""}`} data-fight-metric={fight.metric} data-fight-phase={fight.phase} href={`/arena/fights/${fight.id}`} aria-label={`Öppna Butiksfight: ${fight.name}`}>
    <span className="arena-fight-perimeter" aria-hidden="true"/><span className="arena-fight-widget-title"><Flag aria-hidden="true" /><strong>{fight.phase==="finished" ? "BUTIKSFIGHT · FINAL":"BUTIKSFIGHT"}</strong><i aria-hidden="true" />{fight.phase==="active" ? "LIVE":fight.phase==="scheduled" ? "SNART":"FINAL"}</span>
    <span className="arena-fight-widget-teams">{pair && own && opponent ? <>{own.name} <em>VS</em> {opponent.name}</>:fight.name}</span>
    <span className="arena-fight-widget-score">{pair && own && opponent ? <><b>{formatFightScore(fightScore(own,fight.metric),fight.metric)}</b><em>–</em><b>{formatFightScore(fightScore(opponent,fight.metric),fight.metric)}</b></>:<><b>#{own?.rank ?? "—"}</b><em>·</em>{own ? formatFightScore(fightScore(own,fight.metric),fight.metric):""}</>}</span>
    <span className="arena-fight-widget-gap">{fight.phase==="finished" ? (fight.winner_ids?.length!==1 ? "OAVGJORT!":`${fight.standings.find(s=>s.id===fight.winner_ids?.[0])?.name ?? "Laget"} vann`):leaders.length>1 ? "DET ÄR LIKA!":`${leader?.name ?? "Laget"} leder`}{pair && gap!==0 ? ` · ${formatFightScore(Math.abs(gap),fight.metric)} skiljer`:""}</span>
    <span className="arena-fight-balance" role="img" aria-label={pair ? `Andel av resultatet: ${Math.round(share)} procent för ${own?.name ?? "laget"}`:`Högsta resultat: ${formatFightScore(high,fight.metric)}`}><i style={{width:`${share}%`}}/></span>
    <ArenaFightClock fight={fight} compact onBoundary={onBoundary} /><span className="arena-fight-pep">{fight.phase==="finished" ? "STARKT JOBBAT, LAGET!":"Tillsammans tar vi nästa poäng."}</span><ChevronRight className="arena-fight-widget-chevron" aria-hidden="true" />
  </a>;
}
export function FightResult({fight}:{fight:ArenaFightSummary}) {
  const winners=fight.standings.filter(s=>fight.winner_ids?.includes(s.id)),tie=winners.length!==1;
  return <section className="arena-fight-winner"><Trophy aria-hidden="true" /><span>{tie ? "OAVGJORT!":"VINNARE!"}</span><h3>{tie ? winners.map(s=>s.name).join(" · "):`${winners[0].name} vinner!`}</h3><strong className="arena-fight-final-score">{fight.standings.map(s=>formatFightScore(fightScore(s,fight.metric),fight.metric)).join(" – ")}</strong><small>BUTIKSFIGHT{fight.start_at && fight.end_at ? ` · ${date.format(new Date(fight.start_at))}–${date.format(new Date(fight.end_at))}`:""}</small><p>Slutställningen är låst vid fightens sluttid.</p></section>;
}
export function FightAnnouncement({event,seller,activity,reward,secondary,className=""}:{event:FightFeedback;seller?:{id:string;name:string;imageUrl?:string|null;avatarIndex?:number|null};activity?:string;reward?:string;secondary?:string[];className?:string}) {
  const {fight,stationId,kind}=event,own=fight.standings.find(s=>s.id===stationId),winners=fight.standings.filter(s=>fight.winner_ids?.includes(s.id));
  const tie=kind==="tie" || (kind==="final" && winners.length!==1),won=kind==="final" && winners.some(s=>s.id===stationId);
  const title=kind==="lead" ? `${own?.name ?? "Stationen"} tar ledningen!`:kind==="tie" ? "DET ÄR LIKA!":tie ? "OAVGJORT!":`${winners[0]?.name ?? "Laget"} VINNER!`;
  return <div className={`arena-celebration arena-fight-celebration ${kind==="tie" ? "level-2":"level-3"} fight-celebration-${kind} ${className}`} role="status" style={{"--reward-life":`${kind==="tie" ? 2600:3600}ms`} as React.CSSProperties}>
    <div className="arena-reward-ring arena-fight-event-hero"><div className="arena-fight-event-emblem" aria-hidden="true"><Crown /><Trophy /><span>{tie ? "=":kind==="final" ? <Check />:"VS"}</span></div><span className="arena-eyebrow">BUTIKSFIGHT · {kind==="final" ? "SLUTRESULTAT":"LAGETS MOMENT"}</span><h2>{title}</h2><strong className="arena-fight-event-score">{fight.standings.slice(0,3).map(s=>formatFightScore(fightScore(s,fight.metric),fight.metric)).join(" – ")}</strong><p>{fight.standings.map(s=>s.name).join(" · ")}</p>
      {seller && <div className="arena-fight-event-sale"><ArenaAvatar {...seller} /><strong>{seller.name}</strong><span>{activity}</span><b>{reward}</b></div>}
      {kind==="lead" && event.previousLeader && <strong className="arena-fight-passed">{event.previousLeader} PASSERAD</strong>}
      {kind==="final" && fight.start_at && fight.end_at && <span className="arena-fight-event-period">{date.format(new Date(fight.start_at))}–{date.format(new Date(fight.end_at))}</span>}
      <strong className="arena-reward-pep">{kind==="final" && !won && !tie ? "STARKT JOBBAT, LAGET. NÄSTA FIGHT VÄNTAR!":tie ? "VARJE FÖRSÄLJNING KAN AVGÖRA!":"DET HÄR ÄR VAD DRIV SER UT SOM!"}</strong>
      {secondary?.length ? <p className="arena-victory-secondary">{secondary.join(" · ")}</p>:null}<Check className="arena-fight-event-check" aria-hidden="true" />
      {Array.from({length:kind==="tie" ? 6:14},(_,i)=><i key={i} className="arena-confetti" style={{"--i":i} as React.CSSProperties} aria-hidden="true" />)}
    </div>
  </div>;
}
export function FightEventFeed({events}:{events:ArenaFightEvent[]}) {
  return <section className="arena-fight-feed arena-panel"><header><h3>SENASTE FIGHT-EVENTS</h3><span>FIGHTENS HÄNDELSER</span></header>{events.length ? <ol>{events.map(event=><li key={event.id} className={`fight-feed-${event.kind}`}>
    {event.kind==="sale" ? <ArenaAvatar id={event.seller_id} name={event.seller_name ?? "Säljare"} imageUrl={event.profile_url} avatarIndex={event.avatar_index} />:event.kind==="tie" ? <span className="arena-fight-tie-icon" aria-hidden="true">=</span>:<Crown aria-hidden="true" />}<div><strong>{event.kind==="lead" ? `${event.station_name} TAR LEDNINGEN`:event.kind==="tie" ? "DET ÄR LIKA!":event.seller_name}</strong><span>{event.station_name}{event.activity_name ? ` · ${event.activity_name}`:""}</span></div>{event.kind==="sale" && <b>{event.display_mode==="tb" && event.tb_ore_awarded!=null ? `+${arenaMoney(event.tb_ore_awarded)} TB`:`+${arenaNumber(event.points_awarded ?? 0)} p`}</b>}<time dateTime={event.created_at}>{time.format(new Date(event.created_at))}</time>
  </li>)}</ol>:<p>Första försäljningen sätter tonen. Kör på!</p>}</section>;
}
