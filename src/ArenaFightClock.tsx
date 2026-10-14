import {useEffect,useRef,useState} from "react";
import {Clock3} from "lucide-react";
import type {ArenaFightSummary} from "../shared/arena-fights";
import {fightTime,fightUrgency} from "./arena-fight-feedback";
export default function ArenaFightClock({fight,onBoundary,compact=false}:{fight:ArenaFightSummary;onBoundary?:()=>void;compact?:boolean}) {
  const [now,setNow]=useState(Date.now),boundarySeen=useRef(""),callback=useRef(onBoundary);callback.current=onBoundary;
  const boundary=fight.phase==="scheduled" ? fight.start_at:fight.phase==="active" ? fight.end_at:undefined;
  useEffect(()=>{const tick=()=>{const current=Date.now();setNow(current);if(boundary && current>=Date.parse(boundary) && boundarySeen.current!==boundary){boundarySeen.current=boundary;callback.current?.();}};tick();if(!boundary)return;const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[boundary]);
  const duration=fight.start_at && fight.end_at ? Date.parse(fight.end_at)-Date.parse(fight.start_at):0;
  const elapsed=fight.phase==="finished" ? 100:duration>0 ? Math.max(0,Math.min(100,100*(now-Date.parse(fight.start_at!))/duration)):0;
  return <div className={`arena-fight-timer urgency-${fight.phase==="active" ? fightUrgency(fight.end_at,now):"calm"}${compact ? " is-compact":""}`}>
    <div className="arena-fight-clock"><Clock3 aria-hidden="true" /><span role="timer" aria-live="off">{fight.phase==="finished" ? "SLUTRESULTAT":fight.phase==="cancelled" ? "AVBRUTEN":`${fightTime(boundary,now)} ${fight.phase==="scheduled" ? "till start":"kvar"}`}</span>{!compact && <strong>{fight.metric==="tb" ? "TB · UPPSKATTAD MARGINAL":fight.metric==="count" ? "ANTAL REGISTRERINGAR":"POÄNG"}</strong>}</div>
    {!compact && <div className="arena-fight-period" role="progressbar" aria-label="Fightperiod" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(elapsed)}><i style={{width:`${elapsed}%`}} /></div>}
  </div>;
}
