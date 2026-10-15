import {visibleArenaPolling,ARENA_SYNC_MS,ARENA_FIGHT_SYNC_MS} from "./arena-polling";
import {useEffect,useRef,useState} from "react";
import {ArrowLeft,Crown,Flag} from "lucide-react";
import {api} from "./api";
import type {ArenaFight as Fight} from "../shared/arena-fights";
import {fightScore} from "../shared/arena-fights";
import {arenaMoney} from "../shared/arena-money";
import {arenaNumber} from "../shared/arena";
import ArenaFightClock from "./ArenaFightClock";
import {FightAnnouncement,FightEventFeed,FightResult,formatFightScore} from "./ArenaFightPresentation";
import type {FightFeedback} from "./arena-fight-feedback";

const periodTime=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",dateStyle:"medium",timeStyle:"short"});
export default function ArenaFight() {
  const path=window.location.pathname,id=path.split("/").at(-1)!,superadmin=path.startsWith("/arena/superadmin/");
  const [fight,setFight]=useState<Fight|null>(null),[error,setError]=useState(""),[announcement,setAnnouncement]=useState<FightFeedback|null>(null);
  const cursor=useRef<Fight|null>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),refresh=useRef<(()=>Promise<void>)|null>(null);
  useEffect(()=>{
    let active=true;
    const load=async()=>{if(document.hidden)return;try{
      const next=await api<Fight>(`/arena/${superadmin ? "superadmin/":""}fights/${id}`);if(!active)return;
      const previous=cursor.current;if(previous && previous.snapshot_at>next.snapshot_at)return;
      const event=next.latest_lead_change;
      if(previous && next.phase==="active" && next.version>previous.version){
        const lead=event && event.version===next.version;
        if(lead || (next.leader_ids.length>1 && previous.leader_ids.length===1)){
          setAnnouncement({kind:lead ? "lead":"tie",key:`${next.id}:${next.version}`,fight:next,stationId:lead ? event.station_id:next.leader_ids[0],previousLeader:previous.standings.find(s=>s.id===previous.leader_ids[0])?.name});
          clearTimeout(timer.current);timer.current=setTimeout(()=>setAnnouncement(null),lead ? 3600:2600);
        }
      }
      cursor.current=next;setFight(next);setError("");
    }catch(e){if(active)setError((e as Error).message);}};
    refresh.current=load;
    let stopPolling=()=>{};
    void load().then(()=>{if(active)stopPolling=visibleArenaPolling(load,()=>cursor.current?.phase==="active"?ARENA_FIGHT_SYNC_MS:ARENA_SYNC_MS);});
    return()=>{active=false;refresh.current=null;stopPolling();clearTimeout(timer.current);};
  },[id,superadmin]);
  const highest=fight?.standings.length ? fightScore(fight.standings[0],fight.metric):0;
  return <div className={`arena-page arena-theme arena-fight-page${fight?.phase==="active" ? " is-live-fight":""}${fight?.standings.length===2 ? " is-head-to-head":" is-multistation"}`}><header className="arena-page-header"><a href={superadmin ? "/arena/superadmin":"/arena"}><ArrowLeft /> {superadmin ? "Till Superadmin":"Till Arenan"}</a><h1><Flag /> Butiksfight</h1><span className={`arena-status${fight?.phase==="active" && !error ? " status-active":""}`}>{error ? "PAUSAD":fight?.phase==="active" ? "LIVE":fight?.phase==="finished" ? "SLUTRESULTAT":fight?.phase==="scheduled" ? "SNART START":fight?.phase==="cancelled" ? "AVBRUTEN":"BUTIKSFIGHT"}</span></header>
    {error && <p className="arena-error" role="alert">{error}</p>}
    {!fight ? !error && <p role="status">Hämtar Butiksfight…</p>:<main className="arena-fight-main"><section className="arena-fight-heading"><span className="arena-eyebrow">SAMMA LAGKÄNSLA. STÖRRE RESULTAT.</span><h2>{fight.name}</h2><p>{fight.description}</p><small>{periodTime.format(new Date(fight.start_at))} – {periodTime.format(new Date(fight.end_at))} · Stockholm</small><ArenaFightClock fight={fight} onBoundary={()=>void refresh.current?.()} /></section>
      {fight.phase==="finished" && <FightResult fight={fight} />}
      <section className="arena-fight-scoreboard" aria-label={fight.standings.length===2 ? "Station mot station":"Live ranking"}>
        {fight.standings.length===2 && <div className="arena-fight-vs" aria-hidden="true">VS</div>}
        <div className="arena-fight-standings">{fight.standings.map((s,index)=>{
          const score=fightScore(s,fight.metric),gap=highest-score,next=index ? fightScore(fight.standings[index-1],fight.metric)-score:score-(fight.standings[1] ? fightScore(fight.standings[1],fight.metric):0),tied=s.rank===1 && fight.leader_ids.length>1,finished=fight.phase==="finished";
          return <article key={s.id} className={s.rank===1 ? "is-fight-leader":undefined}><div className="arena-fight-rank">{s.rank===1 ? <Crown aria-hidden="true" />:<span>#{s.rank}</span>}<b>{finished ? s.rank===1 ? tied ? "DELAD FÖRSTAPLATS":"VINNARE":"SLUTPLACERING":s.rank===1 ? tied ? "DELAD LEDNING":"LEDER":"UTMANARE"}</b></div><h3>{s.name}</h3><strong className="arena-fight-score">{formatFightScore(score,fight.metric)}</strong><div className="arena-fight-relative"><i style={{width:`${highest ? 100*score/highest:0}%`}} /></div><p>{tied ? finished ? "Lika slutresultat.":"Lika resultat. Varje försäljning kan avgöra.":index ? `${formatFightScore(next,fight.metric)} till nästa placering · ${formatFightScore(gap,fight.metric)} till ledningen`:`${formatFightScore(next,fight.metric)} före nästa station`}</p><small>{s.count} registreringar · {arenaNumber(s.points)} poäng · {arenaMoney(s.tb_ore)} TB</small>{s.unknown_tb_count>0 && <small>{s.unknown_tb_count} äldre registreringar saknar historiskt TB.</small>}</article>;
        })}</div>
      </section>
      {fight.phase==="active" && fight.leader_ids.length>1 && <div className="arena-fight-tie-state" role="status"><strong>DET ÄR LIKA!</strong><span>Aktuell ställning · {fight.standings.filter(s=>fight.leader_ids.includes(s.id)).map(s=>s.name).join(" · ")}</span></div>}
      <FightEventFeed events={fight.events??[]} /><p className="arena-fight-fairness">Totalresultat för den valda perioden. Ingen normalisering per säljare eller arbetstid.</p>
    </main>}
    {announcement && <FightAnnouncement event={announcement} className="arena-fight-lead-event" />}
  </div>;
}
