import type {ArenaFight} from '../shared/arena-fights';
import {fightScore} from '../shared/arena-fights';
import {formatFightScore} from './ArenaFightPresentation';
const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',day:'numeric',month:'short'});
export default function ArenaFightDays({fight}:{fight:ArenaFight}) {
 const days=(fight.days??[]).filter(d=>d.closed).slice().reverse();
 return <section className="arena-panel arena-fight-days"><header><span className="arena-eyebrow">VARJE DAG ÄR EN NY DUELL</span><h2>Dagshistorik & matchpoäng</h2></header>
 {fight.current_day && <div className="arena-day-current"><strong>IDAG · PÅGÅR</strong><p>{fight.current_day.standings.map(s=>`${s.name}: ${formatFightScore(fightScore(s,fight.metric),fight.metric)}`).join(' · ')}</p><small>Preliminärt. Dagsvinnaren får {fight.day_win_points} mp när dagens duell stängs.</small></div>}
 {!days.length && <p>Första dagsresultatet låses när dagen avslutas i Stockholmstid.</p>}
 {days.length>0 && <details open={days.length<=7}><summary>{days.length} låsta dagsresultat</summary><ol>{days.map(day=><li key={day.day}><header><time dateTime={day.day}>{date.format(new Date(day.start_at))}</time><b>{day.winner_ids.length===1 ? `${day.standings.find(s=>s.id===day.winner_ids[0])?.name} vann`:'Delad dagsledning'}</b></header><ul>{day.standings.map(s=><li key={s.id}><span>{s.name}</span><small>{formatFightScore(fightScore(s,fight.metric),fight.metric)}</small><strong>+{s.match_points??0} mp</strong></li>)}</ul></li>)}</ol></details>}
 </section>;
}
