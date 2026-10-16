import {useEffect,useRef,useState} from "react";
import {Clock3} from "lucide-react";
import type {ArenaFightSummary} from "../shared/arena-fights";
import {fightTime,fightUrgency} from "./arena-fight-feedback";
import {useArenaRuntime} from "./arena-runtime";
export default function ArenaFightClock({fight,onBoundary,compact=false,war=false}:{fight:ArenaFightSummary;onBoundary?:()=>void;compact?:boolean;war?:boolean}) {
  const runtime=useArenaRuntime();
  const [now,setNow]=useState(runtime.now),boundarySeen=useRef(""),callback=useRef(onBoundary);callback.current=onBoundary;
  const boundary=fight.phase==="scheduled" ? fight.start_at:fight.phase==="active" ? fight.end_at:undefined;
  const [hidden,setHidden]=useState(()=>document.hidden);
  useEffect(()=>{
    let timer:ReturnType<typeof setInterval>|undefined;
    const tick=()=>{const current=runtime.now();setNow(current);const key=`${fight.id}:${boundary}`;if(boundary&&current>=Date.parse(boundary)&&boundarySeen.current!==key){boundarySeen.current=key;callback.current?.();}};
    const resume=()=>{clearInterval(timer);setHidden(document.hidden);if(document.hidden)return;tick();if(boundary&&runtime.now()<Date.parse(boundary))timer=setInterval(()=>{tick();if(runtime.now()>=Date.parse(boundary))clearInterval(timer);},1000);};
    resume();document.addEventListener('visibilitychange',resume);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',resume);};
  },[boundary,fight.id,runtime]);
  const duration=fight.start_at && fight.end_at ? Date.parse(fight.end_at)-Date.parse(fight.start_at):0;
  const elapsed=fight.phase==="finished" ? 100:duration>0 ? Math.max(0,Math.min(100,100*(now-Date.parse(fight.start_at!))/duration)):0;
  const urgency=fight.phase==="active" ? fightUrgency(fight.end_at,now):"calm";
  const awaiting=fight.phase==='active'&&!fight.sudden_death&&!!boundary&&now>=Date.parse(boundary);
  if(war)return <span className={`arena-war-clock arena-fight-timer urgency-${urgency}${hidden?' is-clock-hidden':''}`}>
    <small>{fight.phase==='finished'?'FRYST SLUTRESULTAT':fight.phase==='cancelled'?'AVBRUTEN':awaiting?'INVÄNTAR SLUTRESULTAT':fight.phase==='scheduled'?'TILL START':'TID KVAR'}</small>
    <strong role="timer" aria-live="off">{fight.phase==='finished'?'FINAL':fight.phase==='cancelled'?'—':fightTime(boundary,now,true)}</strong>
    {(urgency==='quarter'||urgency==='final')&&<span className="arena-fight-sprint">{urgency==='final'?'SISTA MINUTERNA':'SLUTSPURT'}</span>}
    {awaiting&&<span className="arena-war-awaiting">Servern bekräftar resultatet</span>}
  </span>;
  return <div className={`arena-fight-timer urgency-${urgency}${compact ? " is-compact":""}${hidden?' is-clock-hidden':''}`}>
    {(urgency==="quarter" || urgency==="final") && <strong className="arena-fight-sprint">SLUTSPURT{urgency==="final" ? " · SISTA MINUTERNA":""}</strong>}
    <div className="arena-fight-clock"><Clock3 aria-hidden="true" /><span role="timer" aria-live="off">{fight.phase==="finished" ? "SLUTRESULTAT":fight.phase==="cancelled" ? "AVBRUTEN":`${fightTime(boundary,now)} ${fight.phase==="scheduled" ? "till start":"kvar"}`}</span>{!compact && <strong>{fight.scoring_mode==="daily" ? "DAGSPOÄNG · MATCHPOÄNG":fight.metric==="tb" ? "TB · UPPSKATTAD MARGINAL":fight.metric==="count" ? "ANTAL REGISTRERINGAR":"POÄNG"}</strong>}</div>
    {!compact && <div className="arena-fight-period" role="progressbar" aria-label="Fightperiod" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(elapsed)}><i style={{width:`${elapsed}%`}} /></div>}
  </div>;
}
