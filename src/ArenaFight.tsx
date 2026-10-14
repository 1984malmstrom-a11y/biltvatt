import { useEffect,useRef,useState } from "react";
import { ArrowLeft,Clock3,Crown,Flag,Trophy } from "lucide-react";
import { api } from "./api";
import type { ArenaFight as Fight } from "../shared/arena-fights";
import { fightScore } from "../shared/arena-fights";
import { arenaMoney } from "../shared/arena-money";
import { arenaNumber } from "../shared/arena";

const periodTime=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",dateStyle:"medium",timeStyle:"short"});
function FightClock({fight,onBoundary}:{fight:Fight;onBoundary:()=>void}) {
  const [now,setNow]=useState(Date.now()),seen=useRef(0);
  useEffect(()=>{const tick=()=>{const current=Date.now();setNow(current);const boundary=fight.phase==="scheduled" ? Date.parse(fight.start_at):fight.phase==="active" ? Date.parse(fight.end_at):0;if(boundary && current>=boundary && seen.current!==boundary){seen.current=boundary;onBoundary();}};tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[fight.phase,fight.start_at,fight.end_at,onBoundary]);
  const total=Date.parse(fight.end_at)-Date.parse(fight.start_at),elapsed=total>0 ? Math.max(0,Math.min(100,100*(now-Date.parse(fight.start_at))/total)):0;
  const remaining=Math.max(0,Date.parse(fight.phase==="scheduled" ? fight.start_at:fight.end_at)-now),days=Math.floor(remaining/86400000),hours=Math.floor(remaining/3600000)%24,minutes=Math.floor(remaining/60000)%60,seconds=Math.floor(remaining/1000)%60;
  return <><div className="arena-fight-clock"><Clock3 />{fight.phase==="finished" ? "Fighten är avgjord":fight.phase==="cancelled" ? "Fighten är avbruten":`${days ? `${days} d `:""}${hours} h ${minutes} min ${seconds} s ${fight.phase==="scheduled" ? "till start":"kvar"}`}<strong>{fight.metric==="tb" ? "TB · UPPSKATTAD MARGINAL":fight.metric==="count" ? "ANTAL REGISTRERINGAR":"POÄNG"}</strong></div><div className="arena-fight-period" role="progressbar" aria-label="Fightperiod" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(elapsed)}><i style={{width:`${elapsed}%`}} /></div></>;
}
export default function ArenaFight() {
  const path=window.location.pathname,id=path.split("/").at(-1)!,superadmin=path.startsWith("/arena/superadmin/");
  const [fight,setFight]=useState<Fight|null>(null),[error,setError]=useState(""),[lead,setLead]=useState("");
  const cursor=useRef<number|null>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const refresh=useRef<(()=>Promise<void>)|null>(null);
  useEffect(()=>{
    let active=true;
    const load=async()=>{if(document.hidden)return;try{const next=await api<Fight>(`/arena/${superadmin ? "superadmin/":""}fights/${id}`);if(!active)return;
      const event=next.latest_lead_change;
      if(cursor.current!==null && event && event.version>cursor.current && event.version===next.version){setLead(`${event.station_name} tar ledningen!`);clearTimeout(timer.current);timer.current=setTimeout(()=>setLead(""),3600);}
      cursor.current=Math.max(cursor.current??0,next.version);setFight(current=>current && current.snapshot_at>next.snapshot_at ? current:next);setError("");
    }catch(e){if(active)setError((e as Error).message);}};
    refresh.current=load;void load();const polling=setInterval(()=>void load(),30000);
    return()=>{active=false;refresh.current=null;clearInterval(polling);clearTimeout(timer.current);};
  },[id,superadmin]);
  const format=(n:number)=>fight?.metric==="tb" ? `${arenaMoney(n)} TB` : `${arenaNumber(n)} ${fight?.metric==="count" ? "st":"p"}`;
  const highest=fight?.standings.length ? fightScore(fight.standings[0],fight.metric):0;
  const winners=fight?.standings.filter(s=>fight.winner_ids.includes(s.id))??[];
  return <div className="arena-page arena-theme arena-fight-page"><header className="arena-page-header"><a href={superadmin ? "/arena/superadmin":"/arena"}><ArrowLeft /> {superadmin ? "Till Superadmin":"Till Arenan"}</a><h1><Flag /> Butiksfight</h1><span className={`arena-status${fight?.phase==="active" && !error ? " status-active":""}`}>{error ? "PAUSAD":fight?.phase==="active" ? "LIVE":fight?.phase==="finished" ? "SLUTRESULTAT":fight?.phase==="scheduled" ? "SNART START":fight?.phase==="cancelled" ? "AVBRUTEN":"BUTIKSFIGHT"}</span></header>
    {error && <p className="arena-error" role="alert">{error}</p>}
    {!fight ? !error && <p role="status">Hämtar Butiksfight…</p> : <main className="arena-fight-main"><section className="arena-fight-heading"><span className="arena-eyebrow">SAMMA MÄNNISKOR. STÖRRE MÖJLIGHETER.</span><h2>{fight.name}</h2><p>{fight.description}</p><small>{periodTime.format(new Date(fight.start_at))} – {periodTime.format(new Date(fight.end_at))} · Stockholm</small>
      <FightClock fight={fight} onBoundary={()=>void refresh.current?.()} />
    </section>
      {fight.phase==="finished" && <section className="arena-fight-winner"><Trophy aria-hidden="true" /><span>{winners.length===1 ? "VINNARE!":"OAVGJORT!"}</span><h3>{winners.map(s=>s.name).join(" · ")}</h3><p>Slutställningen är låst vid fightens sluttid.</p></section>}
      <div className="arena-fight-standings">{fight.standings.map((s,index)=>{
        const score=fightScore(s,fight.metric),gap=highest-score,next=index ? fightScore(fight.standings[index-1],fight.metric)-score:score-(fight.standings[1] ? fightScore(fight.standings[1],fight.metric):0);
        const tied=s.rank===1 && fight.leader_ids.length>1,finished=fight.phase==="finished";
        return <article key={s.id} className={s.rank===1 ? "is-fight-leader":undefined}><div className="arena-fight-rank">{s.rank===1 ? <Crown aria-hidden="true" />:<span>#{s.rank}</span>}<b>{finished ? s.rank===1 ? tied ? "DELAD FÖRSTAPLATS":"VINNARE":"SLUTPLACERING" : s.rank===1 ? tied ? "DELAD LEDNING":"LEDER":"UTMANARE"}</b></div><h3>{s.name}</h3><strong className="arena-fight-score">{format(score)}</strong><div className="arena-fight-relative"><i style={{width:`${highest ? 100*score/highest:0}%`}} /></div><p>{tied ? finished ? "Lika slutresultat.":"Lika resultat. Varje försäljning kan avgöra." : index ? `${format(next)} till nästa placering · ${format(gap)} till ledningen` : `${format(next)} före nästa station`}</p><small>{s.count} registreringar · {arenaNumber(s.points)} poäng · {arenaMoney(s.tb_ore)} TB</small>{s.unknown_tb_count>0 && <small>{s.unknown_tb_count} äldre registreringar saknar historiskt TB.</small>}</article>;
      })}</div>
      <p className="arena-fight-fairness">Totalresultat för den valda perioden. Ingen normalisering per säljare eller arbetstid.</p>
    </main>}
    {lead && <div className="arena-fight-lead-event" role="status"><Crown aria-hidden="true" /><strong>{lead}</strong><span>Vilket driv! Fortsätt tillsammans.</span></div>}
  </div>;
}
