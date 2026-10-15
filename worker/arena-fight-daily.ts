import {competitionAudit,systemActor} from './arena-competition-model';
import type {ArenaFightDay} from '../shared/arena-fights';
import {fightLeaders,fightScore} from '../shared/arena-fights';
import type {ArenaMetric,ArenaStationStanding} from '../shared/arena-network';
import {stockholmLocalDateTime} from '../shared/arena-clock';
import {arenaNextDay,arenaDayStart} from '../shared/arena-leagues';
import {rankStations} from './arena-network';
type Config={participant_json?:string|null;id:string;start_at:string;end_at:string;score_metric:ArenaMetric;day_win_points:number;day_tie_points:number};
export async function dailyFightRows(db:D1Database,f:Config,snapshot:string){
 const [members,saved]=await Promise.all([
  db.prepare('SELECT s.id,s.name FROM arena_fight_stations m JOIN arena_stations s ON s.id=m.station_id WHERE m.fight_id=? ORDER BY s.id').bind(f.id).all<{id:string;name:string}>(),
  db.prepare('SELECT day,result_json FROM arena_fight_days WHERE fight_id=? ORDER BY day').bind(f.id).all<{day:string;result_json:string}>()
 ]);
 const names=f.participant_json?JSON.parse(f.participant_json) as Record<string,string>:{};for(const m of members.results)m.name=names[m.id]??m.name;
 const frozen=new Map(saved.results.map(r=>[r.day,JSON.parse(r.result_json) as ArenaFightDay]));
 const windows:{day:string;start_at:string;end_at:string;closed:boolean}[]=[];
 const first=stockholmLocalDateTime(new Date(f.start_at)).slice(0,10),last=stockholmLocalDateTime(new Date(Date.parse(f.end_at)-1)).slice(0,10);
 for(let day=first;day<=last;day=arenaNextDay(day)){
  const start_at=arenaDayStart(day)>f.start_at ? arenaDayStart(day):f.start_at;
  const end_at=arenaDayStart(arenaNextDay(day))<f.end_at ? arenaDayStart(arenaNextDay(day)):f.end_at;
  if(start_at>snapshot)break;
  if(!frozen.has(day))windows.push({day,start_at,end_at,closed:end_at<=snapshot});
 }
 // One indexed range aggregate for all missing days, under D1's binding limit.
 // Closed-day undo semantics are evaluated at that day's cutoff, even if first
 // viewed later. Published days are insert-once and immutable in the database.
 const rows=windows.length ? await db.prepare(`WITH windows AS (
  SELECT json_extract(value,'$.day') day,json_extract(value,'$.start_at') start_at,
   json_extract(value,'$.end_at') end_at,json_extract(value,'$.closed') closed FROM json_each(?)
 ) SELECT w.day,s.id,s.name,0 rank,COUNT(r.id) count,COALESCE(SUM(r.points_awarded),0) points,
 COALESCE(SUM(r.tb_ore_awarded),0) tb_ore,SUM(CASE WHEN r.id IS NOT NULL AND r.tb_ore_awarded IS NULL THEN 1 ELSE 0 END) unknown_tb_count
 FROM windows w CROSS JOIN arena_fight_stations m JOIN arena_stations s ON s.id=m.station_id
 LEFT JOIN arena_registrations r ON r.station_id=s.id AND r.registered_at>=w.start_at AND r.registered_at<w.end_at AND r.registered_at<=?
  AND (r.voided_at IS NULL OR (w.closed=1 AND r.voided_at>=w.end_at))
 AND (NOT EXISTS(SELECT 1 FROM arena_fights scoped WHERE scoped.id=m.fight_id AND scoped.scope_json IS NOT NULL) OR EXISTS(SELECT 1 FROM arena_fight_activity_rules rule WHERE rule.fight_id=m.fight_id AND rule.station_id=s.id AND rule.activity_id=r.activity_id))
 WHERE m.fight_id=? GROUP BY w.day,s.id`).bind(JSON.stringify(windows),snapshot,f.id).all<ArenaStationStanding & {day:string}>():{results:[]};
 const computed=windows.map(window=>{
  const standings=rankStations(rows.results.filter(r=>r.day===window.day).map(({day,...r})=>({...r,name:names[r.id]??r.name})),f.score_metric);
  const winners=window.closed ? fightLeaders(standings,f.score_metric):[];
  for(const row of standings)row.match_points=window.closed && winners.includes(row.id) ? winners.length===1 ? f.day_win_points:f.day_tie_points:0;
  return {...window,standings,winner_ids:winners};
 });
 const closing=computed.filter(d=>d.closed);
 if(closing.length){await db.batch(closing.flatMap(d=>[db.prepare('INSERT OR IGNORE INTO arena_fight_days(fight_id,day,result_json) VALUES(?,?,?)').bind(f.id,d.day,JSON.stringify(d)),competitionAudit(db,systemActor,'daily.score.frozen',f.id,{day:d.day},`day:${f.id}:${d.day}`)]));
  // Read the winner of any concurrent publication, not our losing candidate.
  const published=await db.prepare('SELECT day,result_json FROM arena_fight_days WHERE fight_id=? ORDER BY day').bind(f.id).all<{day:string;result_json:string}>();
  for(const row of published.results)frozen.set(row.day,JSON.parse(row.result_json));
 }
 const days=[...frozen.values(),...computed.filter(d=>!d.closed)].sort((a,b)=>a.day.localeCompare(b.day));
 const standings=members.results.map(member=>{
  const row:ArenaStationStanding={...member,rank:0,points:0,tb_ore:0,count:0,unknown_tb_count:0,match_points:0};
  for(const day of days){const s=day.standings.find(s=>s.id===row.id);if(s){row.points+=s.points;row.count+=s.count;row.tb_ore+=s.tb_ore;row.unknown_tb_count+=s.unknown_tb_count;row.match_points!+=s.match_points??0;}}
  row.points=Math.round(row.points*100)/100;return row;
 }).sort((a,b)=>fightScore(b,f.score_metric,'daily')-fightScore(a,f.score_metric,'daily')||a.name.localeCompare(b.name,'sv')||a.id.localeCompare(b.id));
 for(let i=0;i<standings.length;i++)standings[i].rank=i && standings[i].match_points===standings[i-1].match_points ? standings[i-1].rank:i+1;
 return {standings,days,current_day:days.find(d=>!d.closed)??null};
}
