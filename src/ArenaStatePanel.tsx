import {memo,useEffect,useState,lazy,Suspense} from "react";
import {Activity,Target} from "lucide-react";
import type {ArenaStats,ArenaSeller} from "../shared/arena";
import {arenaNumber} from "../shared/arena";
import {FightWidget} from "./ArenaFightPresentation";
import {arenaPulse} from './arena-pulse';

const QuickAction=lazy(()=>import('./ArenaFightQuickAction'));

/* Presentation only: a finished result gets a short curtain call, then the
   station pulse returns. No standings, finalisation or sync decisions live here. */
export default memo(function ArenaStatePanel({stats,stationId,stationName,onBoundary,sellers}:{stats:ArenaStats|null;stationId:string;stationName:string;onBoundary:()=>void;sellers?:ArenaSeller[]}) {
 const fight=stats?.fight;
 const [dismissed,setDismissed]=useState<string|null>(null);
 useEffect(()=>{if(fight?.phase!=="finished")return;const timer=setTimeout(()=>setDismissed(fight.id),4200);return()=>clearTimeout(timer);},[fight?.id,fight?.phase]);
 const visibleFight=fight && (fight.phase==="active" || fight.phase==="scheduled" || (fight.phase==="finished" && dismissed!==fight.id));
 const {pace,strongest,lastActivity,goal,remaining}=arenaPulse(stats);
 return <aside className={`arena-state-panel${visibleFight ? " is-fight":" is-pulse"}`} aria-label={visibleFight ? "Butiksfight":"Stationspuls"} data-mode={visibleFight ? "fight":"pulse"}>
  <div className="arena-state-content" key={visibleFight ? `fight-${fight.id}`:"pulse"}>
   {visibleFight ? <><FightWidget fight={fight} stationId={stationId} onBoundary={onBoundary}/>{fight.phase==='active'&&!!stats?.fight_activities?.length&&<Suspense fallback={null}><QuickAction activities={stats.fight_activities} sellers={sellers} onRegistered={onBoundary}/></Suspense>}</> : <section className="arena-pulse-card">
    <header><Activity aria-hidden="true"/><h2>STATIONSPULS</h2><span title={stationName}>IDAG</span></header>
    <div className="arena-pulse-primary"><small className="arena-pulse-label">{pace ? "MÅLTEMPO" : strongest ? "STARKASTE AKTIVITET" : "SENASTE STEGET"}</small><strong>{pace ? `${arenaNumber(pace.percent)}%`:strongest ? strongest.name:lastActivity?.activity_name??'Redo för första steget'}</strong><span>{pace ? 'av planens måltempo':strongest ? 'starkaste aktivitet idag':lastActivity ? 'senast registrerat':'Dagens första aktivitet väntar'}</span></div>
    {pace && <div className="arena-pulse-pace"><span>{arenaNumber(Math.abs(pace.difference))} poäng {pace.difference>=0?'före':'efter'} dagsplanen</span><div role="img" aria-label={`Måltempo: ${pace.percent} procent av planen`}><i style={{width:`${Math.min(100,Math.max(0,pace.percent)/2)}%`}}/></div><small>100 % = dagsplan · {pace.elapsed}/{pace.days} dagar</small></div>}
    {pace && <div className="arena-pulse-next"><small>{strongest?'STARKASTE AKTIVITET IDAG':'SENAST REGISTRERAT'}</small><strong>{strongest?.name??lastActivity?.activity_name??'Första försäljningen väntar'}</strong>{strongest&&<span>{arenaNumber(strongest.count)} registreringar av aktiviteten</span>}</div>}
    {goal && remaining!==null && <div className="arena-pulse-goal"><small>{remaining===0 ? "MÅLET UPPNÅTT" : "NÄSTA STEG"}</small><strong>{remaining===0 ? "Tillsammans i mål" : `${arenaNumber(remaining)} poäng kvar`}</strong><span>{goal.period_type==="week" ? "Till veckomålet" : goal.period_type==="month" ? "Till månadsmålet" : "Till lagets mål"}</span></div>}
    <footer><Target aria-hidden="true"/><span>{goal&&goal.points>=goal.target_points?'Lagets mål är uppnått!':pace?'Varje försäljning flyttar lagets måltempo.':'Laget bygger nästa resultat tillsammans.'}</span></footer>
   </section>}
  </div>
 </aside>;
});
