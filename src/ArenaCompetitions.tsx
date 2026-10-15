import {useEffect,useState} from 'react';
import {ArrowLeft,Flag,ChevronRight} from 'lucide-react';
import {api} from './api';
import type {ArenaFightListing} from '../shared/arena-fights';
import type {ArenaLeague} from '../shared/arena-leagues';
export default function ArenaCompetitions(){
 const [fights,setFights]=useState<ArenaFightListing[]>([]),[leagues,setLeagues]=useState<Pick<ArenaLeague,'id'|'name'|'start_day'>[]>([]),[error,setError]=useState(''),[ready,setReady]=useState(false);
 useEffect(()=>{let alive=true;void Promise.all([api<{fights:ArenaFightListing[]}>('/arena/fights'),api<{leagues:typeof leagues}>('/arena/leagues')]).then(([f,l])=>{if(alive){setFights(f.fights);setLeagues(l.leagues);setReady(true);}}).catch(e=>{if(alive)setError((e as Error).message);});return()=>{alive=false;};},[]);
 return <div className="arena-page arena-theme"><header className="arena-page-header"><a href="/arena"><ArrowLeft/> Till Arenan</a><h1><Flag/> Butiksfight</h1></header><main className="arena-competition-hub"><span className="arena-eyebrow">DITT LAG. NÄSTA DUELL.</span><h2>Matcher & serier</h2>{error&&<p role="alert" className="arena-error">{error}</p>}{!ready&&!error&&<p role="status">Hämtar matcher…</p>}
 {['active','scheduled','finished','cancelled'].map(phase=>fights.some(f=>f.status===phase)&&<section className="arena-panel" key={phase}><h2>{phase==='active'?'LIVE · Aktiva fighter':phase==='scheduled'?'Kommande fighter':phase==='finished'?'Avslutade fighter':'Avbrutna fighter'}</h2><ul className="arena-competition-list">{fights.filter(f=>f.status===phase).map(f=><li key={f.id}><a href={`/arena/fights/${f.id}`}><span><strong>{f.name}</strong><small>{f.scoring_mode==='daily'?'Dagspoäng · matchpoäng':f.metric==='tb'?'Total TB':f.metric==='count'?'Totalt antal':'Total poäng'} · {f.participants?.map(s=>s.name).join(' vs ')}</small></span><ChevronRight/></a></li>)}</ul></section>)}
 {ready&&!fights.length&&<section className="arena-panel"><h2>Nästa fight väntar</h2><p>När Superadmin planerar en fight för stationen hittar du ställning, dagsresultat och final här.</p></section>}
 <section className="arena-panel"><h2>Alla möter alla</h2><p>En ny motståndare per omgång. Avslutade dagsdueller ger matchpoäng till serietabellen.</p><ul className="arena-competition-list">{leagues.map(l=><li key={l.id}><a href={`/arena/leagues/${l.id}`}><span><strong>{l.name}</strong><small>Start {l.start_day}</small></span><ChevronRight/></a></li>)}</ul>{ready&&!leagues.length&&<p>Stationen har ingen matchserie ännu.</p>}</section></main></div>;
}
