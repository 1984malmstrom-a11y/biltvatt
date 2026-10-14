import type { ArenaFight, ArenaFightSummary } from "../shared/arena-fights";
import { fightLeaders, fightPhase, uniqueFightLeader } from "../shared/arena-fights";
import type { ArenaMetric, ArenaStationStanding } from "../shared/arena-network";
import { arenaInstant } from "../shared/arena-clock";
import { rankStations } from "./arena-network";
import { body,checkFields,fail,json,text } from "./http";

type FightRow={id:string;name:string;description:string;start_at:string;end_at:string;score_metric:ArenaMetric;status:string;result_json:string | null;live_json:string | null;leader_signature:string;leader_checked_at:string;revision:number;version:number};
type FightListing={id:string;name:string;start_at:string;end_at:string;metric:ArenaMetric;status:string};
const listPhases=(rows:FightListing[])=>rows.map(row=>({...row,status:fightPhase(row.start_at,row.end_at,row.status)}));
async function fightRows(db:D1Database,fight:FightRow,now:string,finished:boolean) {
  const rows=await db.prepare(`SELECT s.id,s.name,0 rank,COUNT(r.id) count,COALESCE(SUM(r.points_awarded),0) points,COALESCE(SUM(r.tb_ore_awarded),0) tb_ore,
    SUM(CASE WHEN r.id IS NOT NULL AND r.tb_ore_awarded IS NULL THEN 1 ELSE 0 END) unknown_tb_count
    FROM arena_fight_stations f JOIN arena_stations s ON s.id=f.station_id
    LEFT JOIN arena_registrations r ON r.station_id=s.id AND r.registered_at>=? AND r.registered_at<? AND r.registered_at<=?
      AND (r.voided_at IS NULL OR (?=1 AND r.voided_at>=?))
    WHERE f.fight_id=? GROUP BY s.id`)
    .bind(fight.start_at,fight.end_at,finished ? fight.end_at:now,finished?1:0,fight.end_at,fight.id).all<ArenaStationStanding>();
  return rankStations(rows.results,fight.score_metric);
}
export async function arenaFightView(db:D1Database,id:string,now=new Date()):Promise<ArenaFight> {
  const snapshot=now.toISOString();
  for(let attempt=0;attempt<3;attempt++) {
    const row=await db.prepare("SELECT id,name,description,start_at,end_at,score_metric,status,result_json,live_json,leader_signature,leader_checked_at,revision,version FROM arena_fights WHERE id=?").bind(id).first<FightRow>();
    if(!row)fail(404,"Butiksfighten finns inte.");if(row!.result_json)return JSON.parse(row!.result_json) as ArenaFight;
    const f=row!,phase=fightPhase(f.start_at,f.end_at,f.status,now),standings=await fightRows(db,f,snapshot,phase==="finished");
    const view:ArenaFight={id:f.id,name:f.name,description:f.description,start_at:f.start_at,end_at:f.end_at,metric:f.score_metric,phase,snapshot_at:snapshot,version:f.version,standings,leader_ids:fightLeaders(standings,f.score_metric),winner_ids:phase==="finished" ? fightLeaders(standings,f.score_metric):[]};
    if(phase==="finished") {
      // Freeze as of the end instant. Later undo still changes ordinary Arena stats,
      // but is intentionally ignored by final fight scores, even before first read.
      const result=await db.prepare("UPDATE arena_fights SET status='finished',result_json=?,finished_at=?,updated_at=?,revision=revision+1 WHERE id=? AND result_json IS NULL")
        .bind(JSON.stringify(view),f.end_at,snapshot,id).run();
      if(result.meta.changes)return view;continue;
    }
    if(phase!=="active")return view;
    if(f.leader_checked_at>snapshot && f.live_json){const current=JSON.parse(f.live_json) as ArenaFight;current.latest_lead_change=await leadEvent(db,id);return current;}
    const signature=uniqueFightLeader(standings,f.score_metric),changed=signature!==f.leader_signature;
    view.version=f.version+(changed?1:0);
    const leader=standings.find(s=>s.id===signature);
    const statements=[db.prepare(`UPDATE arena_fights SET status='active',leader_signature=?,leader_checked_at=?,live_json=?,revision=revision+1,version=?
      WHERE id=? AND revision=? AND leader_checked_at<=? AND result_json IS NULL`)
      .bind(signature,snapshot,JSON.stringify(view),view.version,id,f.revision,snapshot)];
    if(changed && leader)statements.push(db.prepare(`INSERT OR IGNORE INTO arena_fight_lead_events(id,fight_id,version,station_id,station_name,created_at)
      SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM arena_fights WHERE id=? AND revision=? AND version=? AND leader_signature=?)`)
      .bind(crypto.randomUUID(),id,view.version,leader.id,leader.name,snapshot,id,f.revision+1,view.version,signature));
    const result=await db.batch(statements);
    if(!result[0].meta.changes) {
      const latest=await db.prepare("SELECT result_json,live_json FROM arena_fights WHERE id=?").bind(id).first<{result_json:string|null;live_json:string|null}>();
      if(latest?.result_json)return JSON.parse(latest.result_json) as ArenaFight;
      if(latest?.live_json){const current=JSON.parse(latest.live_json) as ArenaFight;current.latest_lead_change=await leadEvent(db,id);return current;}continue;
    }
    view.latest_lead_change=await leadEvent(db,id);return view;
  }
  return fail(409,"Ställningen uppdateras. Försök igen.");
}
const leadEvent=(db:D1Database,id:string)=>db.prepare("SELECT version,station_id,station_name,created_at FROM arena_fight_lead_events WHERE fight_id=? ORDER BY version DESC LIMIT 1").bind(id).first<NonNullable<ArenaFight["latest_lead_change"]>>();
export async function arenaFightSummary(db:D1Database,station:string):Promise<ArenaFightSummary|null> {
  const now=new Date().toISOString(),row=await db.prepare(`SELECT f.id FROM arena_fights f JOIN arena_fight_stations s ON s.fight_id=f.id
    WHERE s.station_id=? AND f.status<>'cancelled' AND f.start_at<=? AND f.end_at>? ORDER BY f.start_at DESC,f.id LIMIT 1`).bind(station,now,now).first<{id:string}>();
  if(!row)return null;const fight=await arenaFightView(db,row.id);
  return {id:fight.id,name:fight.name,metric:fight.metric,phase:fight.phase,standings:fight.standings,version:fight.version};
}
export async function refreshStationFights(db:D1Database,station:string) {
  const now=new Date().toISOString(),rows=await db.prepare(`SELECT f.id FROM arena_fights f JOIN arena_fight_stations s ON s.fight_id=f.id WHERE s.station_id=? AND f.status IN ('scheduled','active') AND f.start_at<=? ORDER BY f.end_at LIMIT 32`).bind(station,now).all<{id:string}>();
  await Promise.all(rows.results.map(r=>arenaFightView(db,r.id)));
}
export async function arenaFightApi(request:Request,db:D1Database,station:string):Promise<Response> {
  const path=new URL(request.url).pathname;if(request.method!=="GET")fail(405,"Butiksfighter administreras av Superadmin.");
  if(path==="/api/arena/fights") {
    const rows=await db.prepare("SELECT f.id,f.name,f.start_at,f.end_at,f.score_metric metric,f.status FROM arena_fights f JOIN arena_fight_stations s ON s.fight_id=f.id WHERE s.station_id=? ORDER BY f.start_at DESC LIMIT 100").bind(station).all<FightListing>();return json({fights:listPhases(rows.results)});
  }
  const match=path.match(/^\/api\/arena\/fights\/([a-zA-Z0-9:_-]{1,120})$/);
  if(!match || !await db.prepare("SELECT fight_id FROM arena_fight_stations WHERE fight_id=? AND station_id=?").bind(match?.[1]??"",station).first())fail(404,"Butiksfighten finns inte för stationen.");
  return json(await arenaFightView(db,match![1]));
}
// Only called after the separate Superadmin authentication gate.
export async function arenaFightAdminApi(request:Request,db:D1Database):Promise<Response> {
  const path=new URL(request.url).pathname,method=request.method;
  if(path==="/api/arena/superadmin/fights" && method==="GET") {
    const rows=await db.prepare("SELECT id,name,start_at,end_at,score_metric metric,status FROM arena_fights ORDER BY start_at DESC LIMIT 100").all<FightListing>();return json({fights:listPhases(rows.results)});
  }
  const match=path.match(/^\/api\/arena\/superadmin\/fights\/([a-zA-Z0-9:_-]{1,120})$/);
  if(match && method==="GET")return json(await arenaFightView(db,match[1]));
  if(path!=="/api/arena/superadmin/fights" || method!=="POST")fail(405,"Metoden stöds inte.");
  const data=await body(request);checkFields(data,["name","description","start_at","end_at","station_ids","metric"]);
  const name=text(data.name,"Fightnamn"),description=data.description==="" ? "":text(data.description,"Beskrivning",400);
  let start:string,end:string;try{start=arenaInstant(data.start_at);end=arenaInstant(data.end_at);}catch(e){return fail(400,(e as Error).message);}
  if(Date.parse(end)<=Date.parse(start) || Date.parse(end)<=Date.now() || Date.parse(end)-Date.parse(start)>180*86400000)fail(400,"Fighten ska sluta efter start och nu, med högst 180 dagars period.");
  if(!["points","tb","count"].includes(String(data.metric)))fail(400,"Välj poäng, TB eller antal.");
  if(!Array.isArray(data.station_ids) || data.station_ids.length<2 || data.station_ids.length>32 || data.station_ids.some(id=>typeof id!=="string" || id.length>120) || new Set(data.station_ids).size!==data.station_ids.length)fail(400,"Välj 2–32 olika stationer.");
  const ids=data.station_ids as string[],found=await db.prepare(`SELECT id FROM arena_stations WHERE status='active' AND id IN (${ids.map(()=>"?").join(",")})`).bind(...ids).all();if(found.results.length!==ids.length)fail(400,"Alla deltagarstationer måste vara aktiva.");
  const id=crypto.randomUUID(),now=new Date().toISOString(),status=Date.parse(start)<=Date.now() ? "active":"scheduled";
  await db.batch([
    db.prepare("INSERT INTO arena_fights(id,name,description,start_at,end_at,scoring,score_metric,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(id,name,description,start,end,data.metric==="count" ? "count":"points",String(data.metric),status,now,now),
    ...ids.map(station=>db.prepare("INSERT INTO arena_fight_stations(fight_id,station_id) VALUES(?,?)").bind(id,station)),
  ]);return json({id},201);
}
