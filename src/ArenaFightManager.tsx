import {useEffect,useState} from "react";
import {api,send} from "./api";
import type {ArenaMetric,ArenaStation} from "../shared/arena-network";
import {stockholmInstant,stockholmLocalDateTime} from "../shared/arena-clock";
import type {ArenaFightListing as Summary} from "../shared/arena-fights";
const period=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
export default function ArenaFightManager({stations}:{stations:ArenaStation[]}) {
  const [fights,setFights]=useState<Summary[]>([]),[name,setName]=useState(""),[description,setDescription]=useState("");
  const [start,setStart]=useState(()=>stockholmLocalDateTime()),[end,setEnd]=useState(()=>stockholmLocalDateTime(new Date(Date.now()+7*86400000)));
  const [metric,setMetric]=useState<ArenaMetric>("points"),[members,setMembers]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function load(){try{setFights((await api<{fights:Summary[]}>("/arena/superadmin/fights")).fights);}catch(e){setError((e as Error).message);}}
  useEffect(()=>{void load();},[]);
  return <div className="arena-admin-grid arena-fight-manager"><section className="arena-panel"><span className="arena-eyebrow">EVENTÖVERSIKT</span><h2>Butiksfighter</h2><p>Perioder visas i Stockholmstid. Välj ett event för full ställning och händelser.</p>
    <div className="arena-fight-manager-counts">{[["active","Aktiva"],["scheduled","Kommande"],["finished","Avslutade"]].map(([status,label])=><div key={status}><strong>{fights.filter(f=>f.status===status).length}</strong><span>{label}</span></div>)}</div>
    {[["active","Aktiva nu"],["scheduled","Kommande"],["finished","Avslutade"],["cancelled","Avbrutna"]].map(([status,label])=>fights.some(f=>f.status===status) && <section className="arena-fight-manager-group" key={status}><h3>{label}</h3><ul className="arena-fight-admin-list">{fights.filter(f=>f.status===status).map(f=><li key={f.id}><a href={`/arena/superadmin/fights/${f.id}`}><div><strong>{f.name}</strong><span className={`arena-status status-${status}`}>{status==="active" ? "LIVE":label.toLocaleUpperCase("sv-SE")}</span></div><span>{f.metric==="tb" ? "TB":f.metric==="count" ? "Antal":"Poäng"} · {period.format(new Date(f.start_at))} – {period.format(new Date(f.end_at))}</span><small>{f.participants?.map(s=>s.name).join(" · ") || "Deltagare visas i fight-vyn"}</small>{!!f.leader_names?.length && <b>{status==="finished" ? f.leader_names.length>1 ? "Delad seger":"Vinnare":"Leder"}: {f.leader_names.join(" · ")}</b>}</a></li>)}</ul></section>)}
    {!fights.length && <p>Skapa lagets första Butiksfight.</p>}</section>
    <form className="arena-panel arena-form" onSubmit={e=>{e.preventDefault();if(busy)return;setBusy(true);setError("");void(async()=>{try{await api("/arena/superadmin/fights",send("POST",{name,description,start_at:stockholmInstant(start),end_at:stockholmInstant(end),metric,station_ids:members}));setName("");setDescription("");setMembers([]);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}})();}}><span className="arena-eyebrow">ETT GEMENSAMT EVENT</span><h2>Skapa Butiksfight</h2>{error && <p className="arena-error" role="alert">{error}</p>}
      <label>Fightnamn<input value={name} onChange={e=>setName(e.target.value)} required maxLength={80} /></label><label>Beskrivning<input value={description} onChange={e=>setDescription(e.target.value)} maxLength={400} /></label>
      <div className="arena-form-row"><label>Start (Stockholm)<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} required /></label><label>Slut (Stockholm)<input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} required /></label></div>
      <label>Tävlingsmått<select aria-label="Tävlingsmått" value={metric} onChange={e=>setMetric(e.target.value as ArenaMetric)}><option value="points">POÄNG</option><option value="tb">TB · uppskattad marginal</option><option value="count">ANTAL REGISTRERINGAR</option></select></label>
      <fieldset className="arena-members"><legend>Deltagande stationer · minst två</legend>{stations.filter(s=>s.status==="active").map(s=><label key={s.id}><input type="checkbox" checked={members.includes(s.id)} onChange={e=>setMembers(current=>e.target.checked ? [...current,s.id]:current.filter(id=>id!==s.id))} />{s.name}</label>)}</fieldset>
      <p>Registreringar från start till precis före slutet räknas. Slutställningen sparas vid sluttiden.</p><button className="arena-action" disabled={busy || members.length<2}>{busy ? "Skapar…":"Skapa fight"}</button>
    </form></div>;
}
