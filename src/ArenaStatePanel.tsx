import {memo,useEffect,useState} from "react";
import {Activity,ArrowUpRight,Star,Target,Users} from "lucide-react";
import type {ArenaStats} from "../shared/arena";
import {arenaNumber} from "../shared/arena";
import {FightWidget} from "./ArenaFightPresentation";

/* Presentation only: a finished result gets a short curtain call, then the
   station pulse returns. No standings, finalisation or sync decisions live here. */
export default memo(function ArenaStatePanel({stats,stationId,stationName,onBoundary}:{stats:ArenaStats|null;stationId:string;stationName:string;onBoundary:()=>void}) {
 const fight=stats?.fight;
 const [dismissed,setDismissed]=useState<string|null>(null);
 useEffect(()=>{if(fight?.phase!=="finished")return;const timer=setTimeout(()=>setDismissed(fight.id),4200);return()=>clearTimeout(timer);},[fight?.id,fight?.phase]);
 const visibleFight=fight && (fight.phase==="active" || fight.phase==="scheduled" || (fight.phase==="finished" && dismissed!==fight.id));
 const goal=stats?.station_goals[0],remaining=goal ? Math.max(0,goal.target_points-goal.points):null;
 return <aside className={`arena-state-panel${visibleFight ? " is-fight":" is-pulse"}`} aria-label={visibleFight ? "Butiksfight":"Stationspuls"} data-mode={visibleFight ? "fight":"pulse"}>
  <div className="arena-pulse-quote"><span>“Små insatser<br/>skapar stora resultat.”</span><small>— ARENAN</small><i aria-hidden="true"/></div>
  <div className="arena-state-content" key={visibleFight ? `fight-${fight.id}`:"pulse"}>
   {visibleFight ? <FightWidget fight={fight} stationId={stationId} onBoundary={onBoundary}/> : <section className="arena-pulse-card">
    <header><Activity aria-hidden="true"/><h2>STATIONSPULS</h2><span>IDAG</span></header>
    <p className="arena-pulse-station">{stationName}<ArrowUpRight aria-hidden="true"/></p>
    <div className="arena-pulse-primary"><Star aria-hidden="true"/><strong>{stats ? arenaNumber(stats.today.points):"—"}</strong><span>poäng idag</span></div>
    <div className="arena-pulse-pair"><div><strong>{stats ? arenaNumber(stats.today.count):"—"}</strong><span>registreringar</span></div><div><Users aria-hidden="true"/><strong>{stats?.today.sellers ?? "—"}</strong><span>aktiva säljare</span></div></div>
    <footer><Target aria-hidden="true"/><span>{remaining===null ? "Varje försäljning räknas":remaining===0 ? "Lagets mål är uppnått!":`${arenaNumber(remaining)} poäng kvar till lagets mål`}</span></footer>
   </section>}
  </div>
 </aside>;
});
