import {arenaRequestPath} from './arena-route';
import {fightWindows} from './arena-fight-windows';
import {stockholmLocalDateTime} from '../shared/arena-clock';
import {freezeCompetitionReport} from './arena-reports';
import type {Competition,CompetitionInput,CompetitionRules,CompetitionMatch,CompetitionStanding} from '../shared/arena-competitions';
import {competitionSchedule,competitionEnd,bracketSeeds} from '../shared/arena-competitions';
import {arenaDayStart,arenaNextDay} from '../shared/arena-leagues';
import type {ArenaMetric} from '../shared/arena-network';
import type {ArenaFight} from '../shared/arena-fights';
import {arenaFightView} from './arena-fights';
import {competitionInput,assertStationsFree,resolveScope,bookingStatements,competitionBatch,competitionAudit,systemActor,notice,type ActivitySnapshot} from './arena-competition-model';
import type {ArenaActor} from './arena-audit';
import {body,checkFields,fail,json,text} from './http';
type Row={id:string;name:string;format:CompetitionRules['format'];rules_json:string;start_day:string;end_day:string;metric:ArenaMetric;result_json:string|null;status:string;cancellation_json:string|null;request_key:string|null};
type MatchRow={id:string;name:string;start_at:string;end_at:string;status:string;result_json:string|null;live_json:string|null;round_no:number;day:string;home_id:string;away_id:string;stage:string;slot_no:number};
const score=(r:{points:number;tb_ore:number;count:number},m:ArenaMetric)=>m==='tb'?r.tb_ore:m==='count'?r.count:r.points;
export function fightStatements(db:D1Database,id:string,competition:string,name:string,r:CompetitionRules,participants:{id:string;name:string}[],from:string,to:string,activities:ActivitySnapshot[],knockout?:unknown){
 const now=new Date().toISOString();return [
 db.prepare(`INSERT INTO arena_fights(id,name,description,start_at,end_at,scoring,score_metric,status,scoring_mode,day_win_points,day_tie_points,match_win,match_draw,competition_id,scope_json,participant_json,knockout_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'scheduled',?,1,0,?,?,?,?,?,?,?,?)`).bind(id,name,'Arena Competition · frysta deltagare och aktivitetsregler',from,to,r.metric==='count'?'count':'points',r.metric,r.format==='daily'?'daily':'total',r.win,r.draw,competition,JSON.stringify(r.scope),JSON.stringify(Object.fromEntries(participants.map(s=>[s.id,s.name]))),knockout?JSON.stringify(knockout):null,now,now),
 ...participants.map(s=>db.prepare('INSERT INTO arena_fight_stations(fight_id,station_id) VALUES(?,?)').bind(id,s.id)),
 db.prepare(`INSERT INTO arena_fight_activity_rules(fight_id,station_id,activity_id,snapshot_json) SELECT ?,json_extract(value,'$.station_id'),json_extract(value,'$.id'),value FROM json_each(?)`).bind(id,JSON.stringify(activities.filter(a=>participants.some(s=>s.id===a.station_id))))
 ];
}
export async function prepareCompetition(db:D1Database,d:CompetitionInput,actor:ArenaActor,id:string=crypto.randomUUID()):Promise<{id:string;statements:D1PreparedStatement[]}>{
 const {name,request_id,...r}=d,start=arenaDayStart(r.start_day),end=arenaDayStart(competitionEnd(r));
 const participants=await assertStationsFree(db,r.station_ids,start,end),activities=await resolveScope(db,r.station_ids,r.scope,start);
 const now=new Date().toISOString(),plan=competitionSchedule(r),names=new Map(participants.map(s=>[s.id,s.name]));
 const statements:D1PreparedStatement[]=[db.prepare(`INSERT INTO arena_leagues(id,name,metric,start_day,end_day,day_win_points,day_tie_points,match_win,match_draw,format,rules_json,request_key,created_at) VALUES(?,?,?,?,?,1,0,?,?,?,?,?,?)`).bind(id,name,r.metric,r.start_day,competitionEnd(r),r.win,r.draw,r.format,JSON.stringify({...r,activities}),request_id,now),...bookingStatements(db,id,r),
 db.prepare(`INSERT INTO arena_league_members(league_id,station_id,snapshot_name,seed) SELECT ?,value,NULL,CAST(key AS INTEGER)+1 FROM json_each(?)`).bind(id,JSON.stringify(r.station_ids)),
 db.prepare(`UPDATE arena_league_members SET snapshot_name=(SELECT name FROM arena_stations WHERE id=station_id) WHERE league_id=?`).bind(id),
 competitionAudit(db,actor,'competition.created',id,r,`created:${id}`),competitionAudit(db,actor,'schedule.generated',id,{matches:plan.length,format:r.format},`schedule:${id}`)];
 if(r.format==='sprint'||r.format==='daily')statements.push(...fightStatements(db,`${id}:direct`,id,name,r,participants,start,end,activities));
 const planned=plan.map((match,index)=>({id:`${id}:r${match.round}:${index}`,name:`${name} · Omgång ${match.round}`,round:match.round,day:match.day,home:match.home,away:match.away,from:arenaDayStart(match.day),to:arenaDayStart(arenaNextDay(match.day,r.match_days)),participants:[match.home,match.away],names:{[match.home]:names.get(match.home),[match.away]:names.get(match.away)}}));
 if(planned.length){const payload=JSON.stringify(planned);
  statements.push(db.prepare(`INSERT INTO arena_fights(id,name,description,start_at,end_at,scoring,score_metric,status,scoring_mode,day_win_points,day_tie_points,match_win,match_draw,competition_id,scope_json,participant_json,created_at,updated_at)
   SELECT json_extract(value,'$.id'),json_extract(value,'$.name'),'Arena · alla möter alla',json_extract(value,'$.from'),json_extract(value,'$.to'),?,?,'scheduled','total',1,0,?,?,?,?,json_extract(value,'$.names'),?,? FROM json_each(?)`).bind(r.metric==='count'?'count':'points',r.metric,r.win,r.draw,id,JSON.stringify(r.scope),now,now,payload),
   db.prepare(`INSERT INTO arena_fight_stations(fight_id,station_id) SELECT json_extract(f.value,'$.id'),p.value FROM json_each(?) f JOIN json_each(json_extract(f.value,'$.participants')) p`).bind(payload),
   db.prepare(`INSERT INTO arena_fight_activity_rules(fight_id,station_id,activity_id,snapshot_json) SELECT m.fight_id,m.station_id,json_extract(a.value,'$.id'),a.value FROM arena_fight_stations m JOIN json_each(?) a ON json_extract(a.value,'$.station_id')=m.station_id WHERE m.fight_id IN (SELECT json_extract(value,'$.id') FROM json_each(?))`).bind(JSON.stringify(activities),payload),
   db.prepare(`INSERT INTO arena_league_fixtures(league_id,round_no,day,fight_id,home_id,away_id) SELECT ?,json_extract(value,'$.round'),json_extract(value,'$.day'),json_extract(value,'$.id'),json_extract(value,'$.home'),json_extract(value,'$.away') FROM json_each(?)`).bind(id,payload));
 }
 if(r.format==='cup'||r.format==='playoffs'){
  const size=r.format==='cup'?r.station_ids.length:r.playoff_size;
  for(let round=1;round<=Math.log2(size);round++)for(let slot=0;slot<size/2**round;slot++)statements.push(db.prepare('INSERT INTO arena_bracket_slots(competition_id,round_no,slot_no) VALUES(?,?,?)').bind(id,round,slot));
 }
 for(const s of participants)statements.push(notice(db,s.id,'scheduled',id,'NY BUTIKSFIGHT',`${name} · start ${r.start_day}`,`created:${id}`));
 return {id,statements};
}
export async function createCompetition(db:D1Database,input:CompetitionInput,actor:ArenaActor){
 const previous=await db.prepare('SELECT id,rules_json,name FROM arena_leagues WHERE request_key=?').bind(input.request_id).first<{id:string;rules_json:string;name:string}>();
 if(previous){const saved=JSON.parse(previous.rules_json);for(const key of Object.keys(input).filter(k=>!['name','request_id'].includes(k)))if(JSON.stringify(saved[key])!==JSON.stringify(input[key as keyof CompetitionInput]))fail(409,'Begäran har redan använts för andra tävlingsregler.');if(previous.name!==input.name)fail(409,'Begäran har redan använts.');return previous.id;}
 const prepared=await prepareCompetition(db,input,actor);try{await competitionBatch(db,prepared.statements);}catch(e){const won=await db.prepare('SELECT id FROM arena_leagues WHERE request_key=?').bind(input.request_id).first<{id:string}>();if(won)return createCompetition(db,input,actor);throw e;}return prepared.id;
}
async function matches(db:D1Database,id:string){return (await db.prepare(`SELECT f.id,f.name,f.start_at,f.end_at,f.status,f.result_json,f.live_json,COALESCE(x.round_no,b.round_no,1) round_no,COALESCE(x.day,substr(f.start_at,1,10)) day,COALESCE(x.home_id,b.home_id) home_id,COALESCE(x.away_id,b.away_id) away_id,CASE WHEN b.fight_id IS NOT NULL THEN 'knockout' WHEN x.fight_id IS NOT NULL THEN 'league' ELSE 'direct' END stage,COALESCE(b.slot_no,0) slot_no FROM arena_fights f LEFT JOIN arena_league_fixtures x ON x.fight_id=f.id LEFT JOIN arena_bracket_slots b ON b.fight_id=f.id WHERE f.competition_id=? ORDER BY f.start_at,f.id`).bind(id).all<MatchRow>()).results;}
function table(members:{station_id:string;snapshot_name:string;seed:number}[],fs:MatchRow[],r:CompetitionRules):CompetitionStanding[]{
 const rows=members.map(m=>({id:m.station_id,name:m.snapshot_name,seed:m.seed,rank:0,played:0,won:0,drawn:0,lost:0,match_points:0,metric_for:0,metric_against:0}));
 for(const f of fs.filter(f=>f.stage==='league'&&f.result_json)){
  const view=JSON.parse(f.result_json!) as ArenaFight;if(view.phase!=='finished')continue;
  for(const p of view.standings){const row=rows.find(s=>s.id===p.id)!;row.played++;row.metric_for+=score(p,r.metric);row.metric_against+=view.standings.filter(s=>s.id!==p.id).reduce((sum,s)=>sum+score(s,r.metric),0);
   if(view.winner_ids.length!==1){row.drawn++;row.match_points+=r.draw;}else if(view.winner_ids[0]===p.id){row.won++;row.match_points+=r.win;}else row.lost++;
  }
 }
 rows.sort((a,b)=>b.match_points-a.match_points||(b.metric_for-b.metric_against)-(a.metric_for-a.metric_against)||b.metric_for-a.metric_for||a.seed-b.seed||a.id.localeCompare(b.id));rows.forEach((r,i)=>r.rank=i+1);return rows;
}
function directStandings(f:ArenaFight,r:CompetitionRules):CompetitionStanding[]{
 const closed=f.days?.filter(d=>d.closed)??[];
 return f.standings.map((p,index)=>({id:p.id,name:p.name,rank:p.rank,seed:index+1,played:r.format==='daily'?closed.length:f.phase==='finished'?1:0,won:r.format==='daily'?closed.filter(d=>d.winner_ids.length===1&&d.winner_ids[0]===p.id).length:f.phase==='finished'&&f.winner_ids.length===1&&f.winner_ids[0]===p.id?1:0,drawn:r.format==='daily'?closed.filter(d=>d.winner_ids.length>1&&d.winner_ids.includes(p.id)).length:f.phase==='finished'&&f.winner_ids.length>1?1:0,lost:r.format==='daily'?closed.filter(d=>!d.winner_ids.includes(p.id)).length:f.phase==='finished'&&!f.winner_ids.includes(p.id)?1:0,match_points:p.match_points??0,metric_for:score(p,r.metric),metric_against:f.standings.filter(s=>s.id!==p.id).reduce((total,s)=>total+score(s,r.metric),0)}));
}
async function advance(db:D1Database,row:Row,r:CompetitionRules,members:{station_id:string;snapshot_name:string;seed:number}[],now:Date){
 if(row.status==='cancelled'||row.result_json)return;
 for(let pass=0;pass<4;pass++){
  let fs=await matches(db,row.id);
  // No current opponent feeds are fetched here. Past results are frozen once;
  // catch-up is bounded, current matchup gets the full event feed only on demand.
  const due=fs.filter(f=>!f.result_json&&f.status!=='cancelled'&&f.end_at<=now.toISOString()).slice(0,32);
  for(const f of due)await arenaFightView(db,f.id,now);
  fs=await matches(db,row.id);
  if(!['cup','playoffs'].includes(r.format))return;
  let slots=(await db.prepare('SELECT * FROM arena_bracket_slots WHERE competition_id=? ORDER BY round_no,slot_no').bind(row.id).all<{round_no:number;slot_no:number;home_id:string|null;away_id:string|null;fight_id:string|null;winner_id:string|null;result_json:string|null}>()).results;
  for(const slot of slots.filter(s=>s.fight_id&&!s.result_json)){
   const f=fs.find(f=>f.id===slot.fight_id);if(!f?.result_json)continue;const result=JSON.parse(f.result_json) as ArenaFight;if(result.phase!=='finished'||result.winner_ids.length!==1)continue;
   await db.batch([db.prepare('UPDATE arena_bracket_slots SET winner_id=?,result_json=? WHERE competition_id=? AND round_no=? AND slot_no=? AND result_json IS NULL').bind(result.winner_ids[0],f.result_json,row.id,slot.round_no,slot.slot_no),competitionAudit(db,systemActor,'playoff.advance',row.id,{round:slot.round_no,slot:slot.slot_no,winner:result.winner_ids[0]},`advance:${f.id}`),notice(db,result.winner_ids[0],'advance',row.id,'VIDARE I SLUTSPELET',row.name,`advance:${f.id}`)]);
  }
  slots=(await db.prepare('SELECT * FROM arena_bracket_slots WHERE competition_id=? ORDER BY round_no,slot_no').bind(row.id).all<typeof slots[number]>()).results;
  const league=fs.filter(f=>f.stage==='league');if(r.format==='playoffs'&&(!league.length||league.some(f=>!f.result_json)))return;
  const seedRows=r.format==='cup'?members.map(m=>({id:m.station_id,seed:m.seed})):table(members,fs,r).slice(0,r.playoff_size).map((s,i)=>({id:s.id,seed:i+1}));
  const seeds=Object.fromEntries(seedRows.map(s=>[s.id,s.seed]));const seeded=bracketSeeds(seedRows.length).map(seed=>seedRows[seed-1].id);
  const activities=(JSON.parse(row.rules_json).activities??[]) as ActivitySnapshot[];const names=new Map(members.map(m=>[m.station_id,m.snapshot_name]));let created=false;
  const leagueRounds=competitionSchedule(r).reduce((n,m)=>Math.max(n,m.round),0);
  for(const slot of slots.filter(s=>!s.fight_id)){
   const previous=slots.filter(s=>s.round_no===slot.round_no-1&&[slot.slot_no*2,slot.slot_no*2+1].includes(s.slot_no)).sort((a,b)=>a.slot_no-b.slot_no);
   const pair=slot.round_no===1?[seeded[slot.slot_no*2],seeded[slot.slot_no*2+1]]:previous.length===2&&previous.every(s=>s.winner_id)?previous.map(s=>s.winner_id!):[];
   if(pair.length!==2)continue;
   const fid=`${row.id}:ko${slot.round_no}:${slot.slot_no}`,day=arenaNextDay(r.start_day,(leagueRounds+slot.round_no-1)*r.match_days);
   const stmts=fightStatements(db,fid,row.id,`${row.name} · ${slot.round_no===Math.log2(seedRows.length)?'FINAL':slot.round_no===Math.log2(seedRows.length)-1?'SEMIFINAL':'KVARTSFINAL'}`,r,pair.map(id=>({id,name:names.get(id)!})),arenaDayStart(day),arenaDayStart(arenaNextDay(day,r.match_days)),activities,{secondary:r.secondary_metric,tie_rule:r.tie_rule,seeds,format:r.format});
   stmts.push(db.prepare('UPDATE arena_bracket_slots SET home_id=?,away_id=?,fight_id=? WHERE competition_id=? AND round_no=? AND slot_no=? AND fight_id IS NULL').bind(pair[0],pair[1],fid,row.id,slot.round_no,slot.slot_no),competitionAudit(db,systemActor,'playoff.seed.frozen',row.id,{round:slot.round_no,slot:slot.slot_no,seeds,pair},`seed:${fid}`));
   try{await competitionBatch(db,stmts);created=true;}catch(e){if(!await db.prepare('SELECT id FROM arena_fights WHERE id=?').bind(fid).first())throw e;}
  }
  if(!created&&!due.length)return;
 }
}
export async function competitionView(db:D1Database,id:string,station?:string,now=new Date()):Promise<Competition>{
 const row=await db.prepare('SELECT * FROM arena_leagues WHERE id=? AND request_key IS NOT NULL').bind(id).first<Row>();if(!row)fail(404,'Tävlingen finns inte.');
 if(station&&!await db.prepare('SELECT 1 FROM arena_league_members WHERE league_id=? AND station_id=?').bind(id,station).first())fail(404,'Tävlingen finns inte för stationen.');
 if(row!.result_json){const result=JSON.parse(row!.result_json) as Competition;await freezeCompetitionReport(db,result);return {...result,station_id:station,own_match:undefined};}
 const r=JSON.parse(row!.rules_json) as CompetitionRules;
 const members=(await db.prepare('SELECT station_id,snapshot_name,seed FROM arena_league_members WHERE league_id=? ORDER BY seed,station_id').bind(id).all<{station_id:string;snapshot_name:string;seed:number}>()).results;
 await advance(db,row!,r,members,now);const fs=await matches(db,id),names=new Map(members.map(m=>[m.station_id,m.snapshot_name]));
 // One aggregate for live score summaries; no N separate eventfeed requests.
 const live=fs.filter(f=>!f.result_json&&f.start_at<=now.toISOString()&&f.status!=='cancelled');
 const windows=await fightWindows(db,live);
 const totals=live.length?await db.prepare(`WITH windows AS (SELECT json_extract(value,'$.id') id,json_extract(value,'$.start_at') start_at,json_extract(value,'$.blocked_by') blocked_by FROM json_each(?)) SELECT m.fight_id,m.station_id,COUNT(r.id) count,COALESCE(SUM(r.points_awarded),0) points,COALESCE(SUM(r.tb_ore_awarded),0) tb_ore FROM arena_fight_stations m JOIN arena_fights f ON f.id=m.fight_id JOIN windows w ON w.id=f.id LEFT JOIN arena_registrations r ON r.station_id=m.station_id AND r.registered_at>=w.start_at AND w.blocked_by IS NULL AND r.registered_at<f.end_at AND r.registered_at<=? AND r.voided_at IS NULL AND EXISTS(SELECT 1 FROM arena_fight_activity_rules a WHERE a.fight_id=f.id AND a.station_id=r.station_id AND a.activity_id=r.activity_id) WHERE f.id IN (SELECT value FROM json_each(?)) GROUP BY m.fight_id,m.station_id`).bind(JSON.stringify(live.map(f=>({id:f.id,...windows.get(f.id)!}))),now.toISOString(),JSON.stringify(live.map(f=>f.id))).all<{fight_id:string;station_id:string;count:number;points:number;tb_ore:number}>():{results:[]};
 const matchViews:CompetitionMatch[]=fs.map(f=>{const saved=f.result_json?JSON.parse(f.result_json) as ArenaFight:null;const phase=saved?.phase??(windows.get(f.id)?.blocked_by?'scheduled':f.start_at>now.toISOString()?'scheduled':f.status==='cancelled'?'cancelled':'active');const ids=[f.home_id??members[0]?.station_id,f.away_id??members[1]?.station_id];return {id:f.id,round:f.round_no,day:f.stage==='league'?f.day:stockholmLocalDateTime(new Date(f.start_at)).slice(0,10),stage:f.stage as CompetitionMatch['stage'],slot:f.slot_no,home_id:ids[0],away_id:ids[1],home_name:names.get(ids[0])??'',away_name:names.get(ids[1])??'',phase,score:ids.map(id=>{const t=saved?.standings.find(s=>s.id===id)??totals.results.find(t=>t.fight_id===f.id&&t.station_id===id);return t?score(t,r.metric):0;}),winner_ids:saved?.winner_ids??[],tie_break_reason:saved?.tie_break_reason,sudden_death:f.live_json?JSON.parse(f.live_json).sudden_death:false,start_at:f.start_at,end_at:f.end_at};});
 const standings=table(members,fs,r),direct=fs.find(f=>f.stage==='direct');if(direct?.result_json||direct?.live_json)standings.splice(0,standings.length,...directStandings(JSON.parse(direct.result_json??direct.live_json!) as ArenaFight,r));
 const bracket=(await db.prepare('SELECT round_no round,slot_no slot,home_id,away_id,fight_id,winner_id FROM arena_bracket_slots WHERE competition_id=? ORDER BY round_no,slot_no').bind(id).all<Competition['bracket'][number]>()).results;
 const complete=fs.length>0&&fs.every(f=>!!f.result_json)&&(!bracket.length||bracket.every(s=>!!s.winner_id));
 let champions:string[]=[];
 if(complete){if(r.format==='cup'||r.format==='playoffs')champions=bracket.filter(s=>s.round===Math.max(...bracket.map(s=>s.round))).map(s=>s.winner_id!);else if(r.format==='league')champions=standings.length?[standings[0].id]:[];else champions=JSON.parse(fs[0].result_json!).winner_ids;}
 const phase=row!.status==='cancelled'?'cancelled':complete?'finished':fs.some(f=>f.start_at<=now.toISOString())?'active':'scheduled';
 const paused=fs.some(f=>f.stage==='knockout'&&f.result_json&&JSON.parse(f.result_json).phase==='cancelled');
 const view:Competition={paused_reason:paused?'En slutspelsmatch är avbruten. Ingen station går vidare utan vinnare; Superadmin kan avbryta tävlingen.':undefined,catching_up:fs.some(f=>!f.result_json&&f.end_at<=now.toISOString()&&!JSON.parse(f.live_json??'{}').sudden_death),station_id:station,id,name:row!.name,format:r.format,rules:r,phase,matches:matchViews,standings,bracket,champion_ids:champions,frozen:complete||phase==='cancelled',...(row!.cancellation_json?{cancelled:JSON.parse(row!.cancellation_json)}:{})};
 if(complete){await db.batch([db.prepare('UPDATE arena_leagues SET result_json=? WHERE id=? AND result_json IS NULL').bind(JSON.stringify({...view,station_id:undefined,frozen:true}),id),competitionAudit(db,systemActor,'competition.result.frozen',id,{champion_ids:champions},`final:${id}`),...r.station_ids.map(station=>notice(db,station,'completed',id,'BUTIKSFIGHT · SLUTRESULTAT',champions.length?`Vinnare: ${champions.map(id=>names.get(id)??id).join(' · ')}`:'Perioden är avslutad.',`complete:${id}`))]);const stored=await db.prepare('SELECT result_json FROM arena_leagues WHERE id=?').bind(id).first<{result_json:string}>();const frozen=JSON.parse(stored!.result_json) as Competition;await freezeCompetitionReport(db,frozen);return {...frozen,station_id:station};}
 if(station&&phase!=='cancelled'){const own=fs.filter(f=>!f.result_json&&f.start_at<=now.toISOString()&&f.status!=='cancelled').find(f=>f.home_id===station||f.away_id===station||f.stage==='direct');view.own_match=own?await arenaFightView(db,own.id,now):null;if(view.own_match&&own?.stage==='direct')view.standings=directStandings(view.own_match,r);}
 return view;
}
export async function syncStationCompetitions(db:D1Database,station:string){
 const active=await db.prepare(`SELECT l.id FROM arena_leagues l JOIN arena_league_members m ON m.league_id=l.id WHERE m.station_id=? AND l.request_key IS NOT NULL AND l.result_json IS NULL AND l.status='open' AND l.start_day<=? ORDER BY l.start_day LIMIT 1`).bind(station,stockholmLocalDateTime().slice(0,10)).first<{id:string}>();
 if(active)await competitionView(db,active.id); // metadata/aggregates, no opponent eventfeeds
}
export async function cancelCompetition(db:D1Database,id:string,reason:string,actor:ArenaActor,station?:string){
 const row=await db.prepare('SELECT * FROM arena_leagues WHERE id=? AND request_key IS NOT NULL').bind(id).first<Row>();if(!row)fail(404,'Tävlingen finns inte.');
 if(station){const spontaneous=await db.prepare('SELECT id FROM arena_challenges WHERE competition_id=? AND (challenger_id=? OR challenged_id=?)').bind(id,station,station).first();if(!spontaneous)fail(403,'Stationsadmin får bara avbryta sin spontana direktduell.');}
 if(row!.status==='cancelled')return;
 if(row!.result_json)fail(409,'Ett fryst slutresultat kan inte avbrytas.');
 const before=await competitionView(db,id);if(station&&before.phase!=='active')fail(409,'Bara en pågående spontan duell kan avbrytas av stationsadmin.');if(before.phase==='finished')fail(409,'Tävlingen är redan avslutad.');
 const at=new Date().toISOString(),cancelled={reason,at,actor:actor.display_name,station_id:station??null};
 const fs=await matches(db,id),snapshots: {id:string;result:string}[]=[];
 for(const f of fs.filter(f=>!f.result_json)){const v=await arenaFightView(db,f.id);if(v.phase==='finished')continue;snapshots.push({id:f.id,result:JSON.stringify({...v,phase:'cancelled',winner_ids:[],leader_ids:[],cancelled})});}
 const cancelledView:Competition={...before,phase:'cancelled',champion_ids:[],cancelled,frozen:true,matches:before.matches.map(m=>snapshots.some(f=>f.id===m.id)?{...m,phase:'cancelled',winner_ids:[]}:m)};
 const statements=[db.prepare("UPDATE arena_leagues SET status='cancelled',cancellation_json=?,result_json=? WHERE id=?").bind(JSON.stringify(cancelled),JSON.stringify(cancelledView),id),...snapshots.map(f=>db.prepare("UPDATE arena_fights SET status='cancelled',result_json=?,cancellation_json=?,updated_at=? WHERE id=? AND result_json IS NULL").bind(f.result,JSON.stringify(cancelled),at,f.id)),db.prepare("UPDATE arena_challenges SET status='cancelled',updated_at=? WHERE competition_id=? AND status='accepted'").bind(at,id),competitionAudit(db,actor,'competition.cancelled',id,cancelled,`cancel:${id}`)];
 for(const s of before.rules.station_ids)statements.push(notice(db,s,'cancelled',id,'DUELLEN HAR AVBRUTITS',`${actor.display_name}: ${reason}. Ingen vinnare utsågs.`,`cancel:${id}`));
 try{await competitionBatch(db,statements);}catch(e){const saved=await db.prepare('SELECT status,result_json FROM arena_leagues WHERE id=?').bind(id).first<{status:string;result_json:string|null}>();if(saved?.status==='cancelled')return;if(saved?.result_json)fail(409,'Tävlingen avslutades samtidigt; slutresultatet bevaras.');throw e;}await freezeCompetitionReport(db,cancelledView);
}
export async function competitionApi(request:Request,db:D1Database,actor?:ArenaActor,station?:string){
 const path=arenaRequestPath(request),base=actor?'/api/arena/superadmin/competitions':'/api/arena/competitions',suffix=path.slice(base.length).split('/').filter(Boolean);
 if(actor&&suffix[0]==='availability'&&request.method==='GET'){const [bookings,activities,categories]=await Promise.all([db.prepare("SELECT b.station_id,b.start_at,b.end_at,COALESCE(l.name,f.name,'Butiksfight') name FROM arena_station_bookings b LEFT JOIN arena_leagues l ON l.id=b.owner_id LEFT JOIN arena_fights f ON f.id=b.owner_id WHERE b.released_at IS NULL AND b.end_at>?").bind(new Date().toISOString()).all(),db.prepare('SELECT id,station_id,name,arena_category_id FROM arena_activities WHERE active=1').all(),db.prepare('SELECT id,name FROM arena_activity_categories').all()]);return json({bookings:bookings.results,activities:activities.results,categories:categories.results});}
 if(!suffix.length&&request.method==='GET'){const rows=await db.prepare(`SELECT l.id,l.name,l.format,l.start_day,l.status,l.result_json FROM arena_leagues l WHERE l.request_key IS NOT NULL ${station?'AND EXISTS(SELECT 1 FROM arena_league_members m WHERE m.league_id=l.id AND m.station_id=?)':''} ORDER BY l.created_at DESC LIMIT 100`).bind(...(station?[station]:[])).all();return json({competitions:rows.results.map((r:any)=>({id:r.id,name:r.name,format:r.format,phase:r.result_json?JSON.parse(r.result_json).phase:r.status==='cancelled'?'cancelled':r.start_day>stockholmLocalDateTime().slice(0,10)?'scheduled':'active'}))});}
 if(!suffix.length&&request.method==='POST'&&actor){const input=competitionInput(await body(request));return json({id:await createCompetition(db,input,actor)},201);}
 if(suffix.length===1&&/^[a-zA-Z0-9:_-]{1,120}$/.test(suffix[0])&&request.method==='GET')return json(await competitionView(db,suffix[0],station));
 if(suffix.length===2&&suffix[1]==='temporary-activities'&&actor){
 const c=await competitionView(db,suffix[0]);if(c.frozen)fail(409,'Tävlingen är låst.');
 if(request.method==='GET'){const rows=await db.prepare('SELECT id,fight_id,station_id,start_at,end_at,snapshot_json FROM arena_temporary_fight_activities WHERE fight_id IN (SELECT id FROM arena_fights WHERE competition_id=?)').bind(c.id).all<any>();return json({temporary_activities:rows.results.map(r=>({...r,snapshot:JSON.parse(r.snapshot_json),active:r.start_at<=new Date().toISOString()&&r.end_at>new Date().toISOString()}))});}
 if(request.method==='POST'){const d=await body(request);checkFields(d,['fight_id','station_id','name','points','tb_ore','category_id','image_key']);const fid=text(d.fight_id,'Match',120),stationId=text(d.station_id,'Station',120),match=c.matches.find(m=>m.id===fid);if(!match||!await db.prepare('SELECT 1 FROM arena_fight_stations WHERE fight_id=? AND station_id=?').bind(fid,stationId).first())fail(400,'Välj en deltagare i matchen.');if(!Number.isFinite(d.points)||Number(d.points)<0||Number(d.points)>10000||!Number.isInteger(d.tb_ore)||Number(d.tb_ore)<0||Number(d.tb_ore)>100000000)fail(400,'Välj giltiga belöningar.');if(!['wash','fika','food','drink','car-care','campaign','other'].includes(String(d.category_id)))fail(400,'Välj kategori.');if(d.image_key!=null&&!await db.prepare('SELECT id FROM arena_activity_images WHERE id=? AND station_id=?').bind(String(d.image_key),stationId).first())fail(400,'Bilden tillhör inte stationen.');const tempid=`${fid}:${stationId}`,snapshot={name:text(d.name,'Namn'),points:d.points,tb_ore:d.tb_ore,category_id:d.category_id,image_key:d.image_key??null,placement:'HUMAN REVIEW REQUIRED'};await db.batch([db.prepare('INSERT OR IGNORE INTO arena_temporary_fight_activities(id,fight_id,station_id,start_at,end_at,snapshot_json) VALUES(?,?,?,?,?,?)').bind(tempid,fid,stationId,match!.start_at,match!.end_at,JSON.stringify(snapshot)),competitionAudit(db,actor,'temporary.activity.snapshot',c.id,snapshot,`temp:${tempid}`)]);return json({id:tempid,placement:'HUMAN REVIEW REQUIRED'},201);}
 }
 if(suffix.length===2&&suffix[1]==='cancel'&&request.method==='POST'&&actor){const d=await body(request);checkFields(d,['reason','confirm']);if(d.confirm!==true)fail(400,'Bekräfta att tävlingen ska avbrytas.');await cancelCompetition(db,suffix[0],text(d.reason,'Anledning',240),actor);return json({ok:true});}
 return fail(405,'Tävlingsfunktionen stöder inte åtgärden.');
}
