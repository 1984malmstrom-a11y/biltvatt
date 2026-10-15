import {competitionBatch} from './arena-competition-model';
import type {ArenaLeague,ArenaLeagueFixture,ArenaLeagueRow} from '../shared/arena-leagues';
import {roundRobin,arenaDayStart,arenaNextDay} from '../shared/arena-leagues';
import type {ArenaMetric} from '../shared/arena-network';
import type {ArenaFight} from '../shared/arena-fights';
import {stockholmLocalDateTime} from '../shared/arena-clock';
import {arenaFightView} from './arena-fights';
import {auditStatement,type ArenaActor} from './arena-audit';
import {body,checkFields,fail,json,text} from './http';
type Row={id:string;name:string;metric:ArenaMetric;start_day:string;day_win_points:number;day_tie_points:number;result_json:string|null};
export async function arenaLeagueView(db:D1Database,id:string):Promise<ArenaLeague>{
 const row=await db.prepare('SELECT * FROM arena_leagues WHERE id=?').bind(id).first<Row>();if(!row)return fail(404,'Matchserien finns inte.');
 if(row.result_json)return JSON.parse(row.result_json);
 const [members,scheduled]=await Promise.all([
  db.prepare('SELECT s.id,s.name FROM arena_league_members m JOIN arena_stations s ON s.id=m.station_id WHERE m.league_id=? ORDER BY s.name,s.id').bind(id).all<{id:string;name:string}>(),
  db.prepare('SELECT x.fight_id,x.round_no,x.day,x.home_id,x.away_id,f.start_at,f.end_at,f.result_json FROM arena_league_fixtures x JOIN arena_fights f ON f.id=x.fight_id WHERE x.league_id=? ORDER BY x.round_no,x.fight_id').bind(id).all<{fight_id:string;round_no:number;day:string;home_id:string;away_id:string;start_at:string;end_at:string;result_json:string|null}>()
 ]);
 const standings:ArenaLeagueRow[]=members.results.map(m=>({...m,rank:0,played:0,won:0,drawn:0,lost:0,match_points:0}));
 const names=new Map(members.results.map(m=>[m.id,m.name])),now=new Date().toISOString(),fixtures:ArenaLeagueFixture[]=[];
 for(const f of scheduled.results){
  // Future rounds are metadata only. Never score/read every scheduled fight on
  // each poll. Past/final rounds use the existing immutable fight snapshots.
  const view:ArenaFight|null=f.result_json ? JSON.parse(f.result_json):f.start_at<=now ? await arenaFightView(db,f.fight_id):null;
  const fixture:ArenaLeagueFixture={fight_id:f.fight_id,round:f.round_no,day:f.day,home:{id:f.home_id,name:names.get(f.home_id)??'Station'},away:{id:f.away_id,name:names.get(f.away_id)??'Station'},phase:view?.phase==='finished'?'finished':view?'active':'scheduled',home_points:view?.standings.find(s=>s.id===f.home_id)?.match_points??0,away_points:view?.standings.find(s=>s.id===f.away_id)?.match_points??0,winner_ids:view?.winner_ids??[]};
  fixtures.push(fixture);
  if(fixture.phase==='finished')for(const s of standings.filter(s=>s.id===f.home_id||s.id===f.away_id)){
   s.played++;s.match_points+=s.id===f.home_id ? fixture.home_points:fixture.away_points;
   if(fixture.winner_ids.length!==1)s.drawn++;else if(fixture.winner_ids[0]===s.id)s.won++;else s.lost++;
  }
 }
 standings.sort((a,b)=>b.match_points-a.match_points||a.name.localeCompare(b.name,'sv')||a.id.localeCompare(b.id));
 for(let i=0;i<standings.length;i++)standings[i].rank=i && standings[i].match_points===standings[i-1].match_points ? standings[i-1].rank:i+1;
 const phase=fixtures.every(f=>f.phase==='finished')?'finished':fixtures.every(f=>f.phase==='scheduled')?'scheduled':'active';
 const view:ArenaLeague={id:row.id,name:row.name,metric:row.metric,start_day:row.start_day,day_win_points:row.day_win_points,day_tie_points:row.day_tie_points,phase,standings,fixtures};
 if(phase==='finished'){
  const result=await db.prepare('UPDATE arena_leagues SET result_json=? WHERE id=? AND result_json IS NULL').bind(JSON.stringify(view),id).run();
  if(!result.meta.changes)return JSON.parse((await db.prepare('SELECT result_json FROM arena_leagues WHERE id=?').bind(id).first<{result_json:string}>())!.result_json);
 }
 return view;
}
export async function arenaLeagueApi(request:Request,db:D1Database,station:string|null,actor?:ArenaActor):Promise<Response>{
 const path=new URL(request.url).pathname,base=actor?'/api/arena/superadmin/leagues':'/api/arena/leagues';
 if(path===base && request.method==='GET'){
  const rows=await db.prepare(`SELECT id,name,metric,start_day,day_win_points,day_tie_points FROM arena_leagues l WHERE l.request_key IS NULL ${station?'AND EXISTS(SELECT 1 FROM arena_league_members m WHERE m.league_id=l.id AND m.station_id=?)':''} ORDER BY created_at DESC LIMIT 100`).bind(...(station?[station]:[])).all();return json({leagues:rows.results});
 }
 const id=path.startsWith(base+'/')?path.slice(base.length+1):'';
 if(id && /^[a-zA-Z0-9:_-]{1,120}$/.test(id) && request.method==='GET'){
  if(station && !await db.prepare('SELECT 1 FROM arena_league_members WHERE league_id=? AND station_id=?').bind(id,station).first())fail(404,'Matchserien finns inte för stationen.');
  return json(await arenaLeagueView(db,id));
 }
 if(path!==base || request.method!=='POST' || !actor)fail(405,'Matchserier administreras av Superadmin.');
 const d=await body(request);checkFields(d,['name','metric','start_day','station_ids','day_win_points','day_tie_points']);
 const name=text(d.name,'Serienamn'),start=text(d.start_day,'Startdag',10),win=d.day_win_points??1,tie=d.day_tie_points??0;
 if(!['points','tb','count'].includes(String(d.metric)) || !Number.isInteger(win)||Number(win)<1||Number(win)>100||![0,1].includes(tie as number))fail(400,'Välj giltiga serie- och poängregler.');
 if(!Array.isArray(d.station_ids)||d.station_ids.some(s=>typeof s!=='string'||s.length>120))fail(400,'Välj giltiga stationer.');
 let plan:ReturnType<typeof roundRobin>;try{plan=roundRobin(d.station_ids as string[],start);}catch(e){return fail(400,(e as Error).message);}
 if(start<stockholmLocalDateTime().slice(0,10))fail(400,'En ny serie ska börja idag eller senare.');
 const ids=d.station_ids as string[],active=await db.prepare(`SELECT id FROM arena_stations WHERE status='active' AND id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all();if(active.results.length!==ids.length)fail(400,'Alla deltagarstationer måste vara aktiva.');
 const league=crypto.randomUUID(),now=new Date().toISOString();
 // Six statements, independent of team count. JSON set inserts keep even a
 // 16-team / 120-match plan below D1's per-invocation and binding limits.
 const fixtures=JSON.stringify(plan.map(match=>({...match,id:crypto.randomUUID(),start:arenaDayStart(match.day),end:arenaDayStart(arenaNextDay(match.day))})));
 const statements=[
  db.prepare('INSERT INTO arena_leagues(id,name,metric,start_day,day_win_points,day_tie_points,created_at) VALUES(?,?,?,?,?,?,?)').bind(league,name,String(d.metric),start,Number(win),Number(tie),now),
  db.prepare('INSERT INTO arena_league_members(league_id,station_id) SELECT ?,value FROM json_each(?)').bind(league,JSON.stringify(ids)),
  db.prepare(`INSERT INTO arena_fights(id,name,description,start_at,end_at,scoring,score_metric,status,scoring_mode,day_win_points,day_tie_points,created_at,updated_at,competition_id)
   SELECT json_extract(value,'$.id'),? || ' · omgång ' || json_extract(value,'$.round'),'Alla möter alla · en ny motståndare per omgång',json_extract(value,'$.start'),json_extract(value,'$.end'),?,?,CASE WHEN json_extract(value,'$.start')<=? THEN 'active' ELSE 'scheduled' END,'daily',?,?,?,?,? FROM json_each(?)`)
   .bind(name,d.metric==='count'?'count':'points',String(d.metric),now,Number(win),Number(tie),now,now,league,fixtures),
  db.prepare(`INSERT INTO arena_fight_stations(fight_id,station_id)
   SELECT json_extract(value,'$.id'),json_extract(value,'$.home') FROM json_each(?)
   UNION ALL SELECT json_extract(value,'$.id'),json_extract(value,'$.away') FROM json_each(?)`).bind(fixtures,fixtures),
  db.prepare(`INSERT INTO arena_league_fixtures(league_id,round_no,day,fight_id,home_id,away_id)
   SELECT ?,json_extract(value,'$.round'),json_extract(value,'$.day'),json_extract(value,'$.id'),json_extract(value,'$.home'),json_extract(value,'$.away') FROM json_each(?)`).bind(league,fixtures)
 ];
 statements.push(auditStatement(db,actor!,'league.created','league',league,null,{name,metric:d.metric,start_day:start,station_ids:ids,day_win_points:win,day_tie_points:tie,rounds:Math.max(...plan.map(p=>p.round))}));
 await db.batch(statements);return json({id:league},201);
}
