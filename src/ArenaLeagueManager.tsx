import {useEffect,useMemo,useState} from 'react';
import {api,send} from './api';
import {stockholmLocalDateTime} from '../shared/arena-clock';
import {roundRobin} from '../shared/arena-leagues';
import type {ArenaLeague} from '../shared/arena-leagues';
import type {ArenaStation,ArenaMetric} from '../shared/arena-network';
export default function ArenaLeagueManager({stations}:{stations:ArenaStation[]}){
 const [leagues,setLeagues]=useState<Pick<ArenaLeague,'id'|'name'|'start_day'>[]>([]),[name,setName]=useState(''),[day,setDay]=useState(()=>stockholmLocalDateTime().slice(0,10)),[metric,setMetric]=useState<ArenaMetric>('points'),[members,setMembers]=useState<string[]>([]),[win,setWin]=useState(1),[tie,setTie]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const plan=useMemo(()=>{try{return roundRobin(members,day);}catch{return[];}},[members,day]);
 async function load(){setLeagues((await api<{leagues:typeof leagues}>('/arena/superadmin/leagues')).leagues);}
 useEffect(()=>{void load().catch(e=>setError((e as Error).message));},[]);
 return <section className="arena-panel arena-league-manager"><span className="arena-eyebrow">ALLA MÖTER ALLA</span><h2>Matchserier</h2><p>2–16 stationer. En dagsduell per station och omgång, ny motståndare varje dag. Vid udda antal står en station över per omgång. Endast Superadmin skapar serier.</p>{error&&<p role="alert" className="arena-error">{error}</p>}
 <ul className="arena-competition-list">{leagues.map(l=><li key={l.id}><a href={`/arena/superadmin/leagues/${l.id}`}><strong>{l.name}</strong><small>Start {l.start_day} · öppna tabell och omgångar</small></a></li>)}</ul>
 <details><summary>Skapa matchserie</summary><form className="arena-form" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{await api('/arena/superadmin/leagues',send('POST',{name,start_day:day,metric,station_ids:members,day_win_points:win,day_tie_points:tie}));setName('');setMembers([]);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
 <div className="arena-form-row"><label>Serienamn<input value={name} maxLength={80} required onChange={e=>setName(e.target.value)}/></label><label>Första matchdag (Stockholm)<input type="date" min={stockholmLocalDateTime().slice(0,10)} value={day} required onChange={e=>setDay(e.target.value)}/></label></div>
 <label>Dagens tävlingsmått<select value={metric} onChange={e=>setMetric(e.target.value as ArenaMetric)}><option value="points">Poäng</option><option value="tb">TB · uppskattad marginal</option><option value="count">Antal registreringar</option></select></label>
 <div className="arena-form-row"><label>Matchpoäng per seger<input type="number" min={1} max={100} required value={win} onChange={e=>setWin(Number(e.target.value))}/></label><label>Lika dag<select value={tie} onChange={e=>setTie(Number(e.target.value))}><option value={0}>0 matchpoäng var</option><option value={1}>1 matchpoäng var</option></select></label></div>
 <fieldset className="arena-members"><legend>Seriens stationer · 2–16</legend>{stations.filter(s=>s.status==='active').map(s=><label key={s.id}><input type="checkbox" checked={members.includes(s.id)} onChange={e=>setMembers(v=>e.target.checked?[...v,s.id]:v.filter(id=>id!==s.id))}/>{s.name}</label>)}</fieldset>
 {plan.length>0&&<div className="arena-league-preview" role="status"><strong>{members.length} stationer · {Math.max(...plan.map(p=>p.round))} omgångar · {plan.length} matcher</strong><p>{plan[0].day} – {plan.at(-1)!.day} · varje match pågår midnatt till midnatt i Stockholm.</p><details><summary>Förhandsvisa första omgången</summary><ul>{plan.filter(p=>p.round===1).map(p=><li key={p.home}>{stations.find(s=>s.id===p.home)?.name} vs {stations.find(s=>s.id===p.away)?.name}</li>)}</ul></details></div>}
 <button className="arena-action" disabled={busy||!plan.length}>{busy?'Planerar serien…':'Skapa serie och matcher'}</button></form></details></section>;
}
