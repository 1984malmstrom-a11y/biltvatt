import {arenaRequestPath} from './arena-route';
import {fightWindows} from './arena-fight-windows';
import {cancelOfficialFight} from './arena-fight-cancel';
import {syncStationCompetitions} from './arena-competitions';
import {competitionAudit,systemActor,competitionBatch} from './arena-competition-model';
import {resolveKnockout} from './arena-knockout';
import {auditStatement,type ArenaActor} from "./arena-audit";
import {freezeFightReport} from "./arena-reports";
import type { ArenaFight, ArenaFightSummary, ArenaFightEvent, ArenaFightListing } from "../shared/arena-fights";
import { fightLeaders, fightPhase, uniqueFightLeader } from "../shared/arena-fights";
import type { ArenaMetric, ArenaStationStanding } from "../shared/arena-network";
import { arenaInstant } from "../shared/arena-clock";
import {dailyFightRows} from './arena-fight-daily';
import { rankStations } from "./arena-network";
import { body,checkFields,fail,json,text } from "./http";

type FightRow={id:string;name:string;description:string;start_at:string;end_at:string;score_metric:ArenaMetric;status:string;result_json:string | null;live_json:string | null;leader_signature:string;leader_checked_at:string;revision:number;version:number;competition_id?:string|null;knockout_json?:string|null;participant_json?:string|null;scoring_mode:'total'|'daily';day_win_points:number;day_tie_points:number};
type FightListing=ArenaFightListing;
const listPhases=(rows:FightListing[])=>rows.map(row=>({...row,status:fightPhase(row.start_at,row.end_at,row.status)}));
async function fightRows(db:D1Database,fight:FightRow,now:string,finished:boolean) {
  const rows=await db.prepare(`SELECT s.id,s.name,0 rank,COUNT(r.id) count,COALESCE(SUM(r.points_awarded),0) points,COALESCE(SUM(r.tb_ore_awarded),0) tb_ore,
    SUM(CASE WHEN r.id IS NOT NULL AND r.tb_ore_awarded IS NULL THEN 1 ELSE 0 END) unknown_tb_count
    FROM arena_fight_stations f JOIN arena_stations s ON s.id=f.station_id
    LEFT JOIN arena_registrations r ON r.station_id=s.id AND r.registered_at>=? AND r.registered_at<? AND r.registered_at<=?
      AND (r.voided_at IS NULL OR (?=1 AND r.voided_at>=?))
      AND (NOT EXISTS(SELECT 1 FROM arena_fights scoped WHERE scoped.id=f.fight_id AND scoped.scope_json IS NOT NULL) OR EXISTS(SELECT 1 FROM arena_fight_activity_rules rule WHERE rule.fight_id=f.fight_id AND rule.station_id=s.id AND rule.activity_id=r.activity_id))
    WHERE f.fight_id=? GROUP BY s.id`)
    .bind(fight.start_at,fight.end_at,finished ? fight.end_at:now,finished?1:0,fight.end_at,fight.id).all<ArenaStationStanding>();
  return rankStations(rows.results,fight.score_metric);
}
async function fightEvents(db:D1Database,f:FightRow,now:string,finished:boolean):Promise<ArenaFightEvent[]> {
  const rows=await db.prepare(`SELECT 'sale:'||r.id id,'sale' kind,r.station_id,COALESCE(json_extract(r.event_snapshot,'$.station_name'),station.name) station_name,r.registered_at created_at,r.seller_id,COALESCE(json_extract(r.event_snapshot,'$.seller_name'),seller.name) seller_name,seller.avatar_index,CASE WHEN seller.profile_image_id IS NOT NULL THEN '/api/arena/portraits/'||seller.profile_image_id END profile_url,COALESCE(json_extract(r.event_snapshot,'$.activity_name'),a.name) activity_name,r.points_awarded,r.tb_ore_awarded,a.display_mode
    FROM arena_fight_stations member JOIN arena_registrations r ON r.station_id=member.station_id
    JOIN arena_stations station ON station.id=r.station_id
    JOIN arena_sellers seller ON seller.id=r.seller_id AND seller.station_id=r.station_id
    JOIN arena_activities a ON a.id=r.activity_id AND a.station_id=r.station_id
    WHERE member.fight_id=? AND (NOT EXISTS(SELECT 1 FROM arena_fights scoped WHERE scoped.id=member.fight_id AND scoped.scope_json IS NOT NULL) OR EXISTS(SELECT 1 FROM arena_fight_activity_rules rule WHERE rule.fight_id=member.fight_id AND rule.station_id=r.station_id AND rule.activity_id=r.activity_id)) AND r.registered_at>=? AND r.registered_at<? AND r.registered_at<=?
      AND (r.voided_at IS NULL OR (?=1 AND r.voided_at>=?))
    UNION ALL SELECT 'lead:'||version,'lead',station_id,station_name,created_at,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL
    FROM arena_fight_lead_events WHERE fight_id=? AND created_at>=? AND created_at<? AND created_at<=?
    ORDER BY created_at DESC,id DESC LIMIT 20`)
    .bind(f.id,f.start_at,f.end_at,finished ? f.end_at:now,finished?1:0,f.end_at,f.id,f.start_at,f.end_at,now).all<ArenaFightEvent>();
  // Keep observed ties in the existing versioned publication, without a new table.
  const saved=f.live_json ? JSON.parse(f.live_json) as ArenaFight:null;
  const ties=saved?.events?.filter(e=>e.kind==="tie" && e.created_at>=f.start_at && e.created_at<f.end_at)??[];
  return [...rows.results,...ties].sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id)).slice(0,20);
}
export async function arenaFightView(db:D1Database,id:string,now=new Date()):Promise<ArenaFight> {
  const snapshot=now.toISOString();
  for(let attempt=0;attempt<3;attempt++) {
    const row=await db.prepare("SELECT id,name,description,start_at,end_at,score_metric,status,result_json,live_json,leader_signature,leader_checked_at,revision,version,competition_id,knockout_json,participant_json,scoring_mode,COALESCE(match_win,day_win_points) day_win_points,COALESCE(match_draw,day_tie_points) day_tie_points FROM arena_fights WHERE id=?").bind(id).first<FightRow>();
    if(!row)fail(404,"Butiksfighten finns inte.");if(row!.result_json)return JSON.parse(row!.result_json) as ArenaFight;
    const f=row!,phase=fightPhase(f.start_at,f.end_at,f.status,now);
    const window=(await fightWindows(db,[f])).get(f.id)!;
    if(window.blocked_by){const members=await db.prepare('SELECT s.id,s.name FROM arena_fight_stations m JOIN arena_stations s ON s.id=m.station_id WHERE m.fight_id=?').bind(f.id).all<{id:string;name:string}>();const names=f.participant_json?JSON.parse(f.participant_json):{};return {id:f.id,name:f.name,description:f.description,start_at:f.start_at,end_at:f.end_at,metric:f.score_metric,phase:'scheduled',snapshot_at:snapshot,version:f.version,blocked_by_sudden_death:window.blocked_by,leader_ids:[],winner_ids:[],events:[],standings:members.results.map(s=>({...s,name:names[s.id]??s.name,rank:1,points:0,count:0,tb_ore:0,unknown_tb_count:0}))};}
    const scoring={...f,start_at:window.start_at};
    const daily=f.scoring_mode==='daily' ? await dailyFightRows(db,scoring,snapshot):null;
    const standings=daily?.standings??await fightRows(db,scoring,snapshot,phase==="finished");
    if(f.participant_json){const names=JSON.parse(f.participant_json) as Record<string,string>;for(const r of standings)r.name=names[r.id]??r.name;}
    const view:ArenaFight={competition_id:f.competition_id,id:f.id,name:f.name,description:f.description,start_at:f.start_at,end_at:f.end_at,metric:f.score_metric,phase,snapshot_at:snapshot,version:f.version,standings,leader_ids:fightLeaders(standings,f.score_metric,f.scoring_mode),winner_ids:phase==="finished" ? fightLeaders(standings,f.score_metric,f.scoring_mode):[],events:await fightEvents(db,scoring,snapshot,phase==="finished"),...(daily?{scoring_mode:f.scoring_mode,day_win_points:f.day_win_points,day_tie_points:f.day_tie_points,days:daily.days,current_day:daily.current_day}:{})};
    if(window.blocked_by){view.phase='scheduled';view.blocked_by_sudden_death=window.blocked_by;view.standings=view.standings.map(s=>({...s,points:0,tb_ore:0,count:0,match_points:0}));view.events=[];view.leader_ids=[];view.winner_ids=[];return view;}
    if(window.start_at>f.start_at)view.effective_start_at=window.start_at;
    if(window.start_at>=f.end_at){view.phase='cancelled';view.winner_ids=[];view.leader_ids=[];view.cancelled={reason:'Hela matchperioden blockerades av tidigare sudden death. Ingen vinnare utsågs.',at:snapshot,actor:'Arena tävlingsmotor'};}
    else await resolveKnockout(db,f,view,snapshot);
    if(view.phase==="finished"||view.phase==="cancelled") {
      // Freeze as of the end instant. Later undo still changes ordinary Arena stats,
      // but is intentionally ignored by final fight scores, even before first read.
      const result=await db.prepare("UPDATE arena_fights SET status=?,result_json=?,finished_at=?,updated_at=?,revision=revision+1 WHERE id=? AND result_json IS NULL")
        .bind(view.phase,JSON.stringify(view),f.end_at,snapshot,id).run();
      if(result.meta.changes){await freezeFightReport(db,view);await db.batch([competitionAudit(db,systemActor,'match.frozen',id,{winner_ids:view.winner_ids},`match:${id}`)]);return view;}continue;
    }
    if(view.phase!=="active")return view;
    if(f.leader_checked_at>snapshot && f.live_json){const current=JSON.parse(f.live_json) as ArenaFight;current.latest_lead_change=await leadEvent(db,id);return current;}
    const scoringRows=daily?.current_day?.standings??standings;
    const signature=daily ? `${uniqueFightLeader(standings,f.score_metric,'daily')}|${daily.current_day?.day??''}|${uniqueFightLeader(scoringRows,f.score_metric)}`:uniqueFightLeader(standings,f.score_metric),changed=signature!==f.leader_signature;
    view.version=f.version+(changed?1:0);
    const leader=standings.find(s=>s.id===(daily ? uniqueFightLeader(scoringRows,f.score_metric):signature));
    const previous=f.live_json ? JSON.parse(f.live_json) as ArenaFight:null;
    const previousLeaders=previous ? fightLeaders(previous.current_day?.standings??previous.standings,f.score_metric):[];
    const feedbackLeaders=fightLeaders(scoringRows,f.score_metric);
    if(changed && !leader && previousLeaders.length===1 && feedbackLeaders.length>1 && scoringRows[0] && (f.score_metric==="tb" ? scoringRows[0].tb_ore:f.score_metric==="count" ? scoringRows[0].count:scoringRows[0].points)>0) {
      const tied=scoringRows.filter(s=>feedbackLeaders.includes(s.id));
      view.events=[{id:`tie:${view.version}`,kind:"tie" as const,station_id:tied[0].id,station_name:tied.map(s=>s.name).join(" · "),created_at:snapshot},...(view.events??[])].slice(0,20);
    }
    if(changed && leader)view.events=[{id:`lead:${view.version}`,kind:"lead" as const,station_id:leader.id,station_name:leader.name,created_at:snapshot},...(view.events??[])].slice(0,20);
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
  await syncStationCompetitions(db,station);
  const now=new Date(),instant=now.toISOString(),recent=new Date(now.getTime()-86400000).toISOString();
  const row=await db.prepare(`SELECT f.id FROM arena_fights f JOIN arena_fight_stations s ON s.fight_id=f.id
    WHERE s.station_id=? AND f.status<>'cancelled' AND f.start_at<=? AND (f.end_at>? OR (f.result_json IS NULL AND json_extract(f.live_json,'$.sudden_death')=1))
    ORDER BY CASE WHEN json_extract(f.live_json,'$.sudden_death')=1 AND f.result_json IS NULL THEN -1 WHEN f.end_at>? THEN 0 ELSE 1 END,f.start_at DESC,f.id LIMIT 1`).bind(station,instant,recent,instant).first<{id:string}>();
  if(!row)return null;const fight=await arenaFightView(db,row.id);
  const {id,name,metric,phase,standings,version,start_at,end_at,snapshot_at,leader_ids,winner_ids,latest_lead_change,scoring_mode,day_win_points,day_tie_points,current_day,sudden_death,tie_break_reason,competition_id,effective_start_at}=fight;
  return {id,name,metric,phase,standings,version,start_at,end_at,snapshot_at,leader_ids,winner_ids,latest_lead_change,sudden_death,tie_break_reason,competition_id,effective_start_at,...(scoring_mode==='daily'?{scoring_mode,day_win_points,day_tie_points,current_day}:{})};
}
export async function refreshStationFights(db:D1Database,station:string) {
  const now=new Date().toISOString(),rows=await db.prepare(`SELECT f.id FROM arena_fights f JOIN arena_fight_stations s ON s.fight_id=f.id WHERE s.station_id=? AND f.status IN ('scheduled','active') AND f.start_at<=? ORDER BY f.end_at LIMIT 32`).bind(station,now).all<{id:string}>();
  await Promise.all(rows.results.map(r=>arenaFightView(db,r.id)));
}
export async function arenaFightApi(request:Request,db:D1Database,station:string):Promise<Response> {
  const path=arenaRequestPath(request);if(request.method!=="GET")fail(405,"Butiksfighter administreras av Superadmin.");
  if(path==="/api/arena/fights") {
    const rows=await db.prepare("SELECT f.id,f.name,f.start_at,f.end_at,f.score_metric metric,f.status,f.scoring_mode FROM arena_fights f JOIN arena_fight_stations s ON s.fight_id=f.id WHERE s.station_id=? ORDER BY f.start_at DESC LIMIT 100").bind(station).all<FightListing>();return json({fights:listPhases(rows.results)});
  }
  const match=path.match(/^\/api\/arena\/fights\/([a-zA-Z0-9:_-]{1,120})$/);
  if(!match || !await db.prepare("SELECT fight_id FROM arena_fight_stations WHERE fight_id=? AND station_id=?").bind(match?.[1]??"",station).first())fail(404,"Butiksfighten finns inte för stationen.");
  return json(await arenaFightView(db,match![1]));
}
// Only called after the separate Superadmin authentication gate.
export async function arenaFightAdminApi(request:Request,db:D1Database,actor:ArenaActor):Promise<Response> {
  const path=arenaRequestPath(request),method=request.method;
  if(path==="/api/arena/superadmin/fights" && method==="GET") {
    const [rows,members]=await Promise.all([
      db.prepare("SELECT id,name,start_at,end_at,score_metric metric,status,scoring_mode,live_json,result_json FROM arena_fights ORDER BY start_at DESC LIMIT 100").all<FightListing & {live_json:string|null;result_json:string|null}>(),
      db.prepare("SELECT m.fight_id,s.id,s.name FROM arena_fight_stations m JOIN arena_stations s ON s.id=m.station_id WHERE m.fight_id IN (SELECT id FROM arena_fights ORDER BY start_at DESC LIMIT 100)").all<{fight_id:string;id:string;name:string}>(),
    ]);
    return json({fights:listPhases(rows.results.map(({live_json,result_json,...row})=>{
      const saved=result_json || live_json,view=saved ? JSON.parse(saved) as ArenaFight:null;
      return {...row,participants:members.results.filter(m=>m.fight_id===row.id).map(({id,name})=>({id,name})),leader_names:view?.standings.filter(s=>(fightPhase(row.start_at,row.end_at,row.status)==="finished" ? view.phase==="finished" ? view.winner_ids:[]:view.leader_ids).includes(s.id)).map(s=>s.name)??[]};
    }))});
  }
  const cancellation=path.match(/^\/api\/arena\/superadmin\/fights\/([a-zA-Z0-9:_-]{1,120})\/cancel$/);if(cancellation&&method==='POST')return cancelOfficialFight(request,db,cancellation[1],actor);
  const match=path.match(/^\/api\/arena\/superadmin\/fights\/([a-zA-Z0-9:_-]{1,120})$/);
  if(match && method==="GET")return json(await arenaFightView(db,match[1]));
  if(path!=="/api/arena/superadmin/fights" || method!=="POST")fail(405,"Metoden stöds inte.");
  const data=await body(request);checkFields(data,["name","description","start_at","end_at","station_ids","metric","scoring_mode","day_win_points","day_tie_points"]);
  const mode=data.scoring_mode??"total",win=data.day_win_points??1,tie=data.day_tie_points??0;
  if(!["total","daily"].includes(String(mode)) || !Number.isInteger(win) || Number(win)<1 || Number(win)>100 || ![0,1].includes(tie as number))fail(400,"Välj giltigt fightläge, 1–100 poäng för dagsvinst och 0 eller 1 vid lika.");
  const name=text(data.name,"Fightnamn"),description=data.description==="" ? "":text(data.description,"Beskrivning",400);
  let start:string,end:string;try{start=arenaInstant(data.start_at);end=arenaInstant(data.end_at);}catch(e){return fail(400,(e as Error).message);}
  if(Date.parse(end)<=Date.parse(start) || Date.parse(end)<=Date.now() || Date.parse(end)-Date.parse(start)>180*86400000)fail(400,"Fighten ska sluta efter start och nu, med högst 180 dagars period.");
  if(!["points","tb","count"].includes(String(data.metric)))fail(400,"Välj poäng, TB eller antal.");
  if(!Array.isArray(data.station_ids) || data.station_ids.length<2 || data.station_ids.length>32 || data.station_ids.some(id=>typeof id!=="string" || id.length>120) || new Set(data.station_ids).size!==data.station_ids.length)fail(400,"Välj 2–32 olika stationer.");
  const ids=data.station_ids as string[],found=await db.prepare(`SELECT id FROM arena_stations WHERE status='active' AND id IN (${ids.map(()=>"?").join(",")})`).bind(...ids).all();if(found.results.length!==ids.length)fail(400,"Alla deltagarstationer måste vara aktiva.");
  const id=crypto.randomUUID(),now=new Date().toISOString(),status=Date.parse(start)<=Date.now() ? "active":"scheduled";
  await competitionBatch(db,[
    db.prepare("INSERT INTO arena_fights(id,name,description,start_at,end_at,scoring,score_metric,status,created_at,updated_at,scoring_mode,day_win_points,day_tie_points) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,name,description,start,end,data.metric==="count" ? "count":"points",String(data.metric),status,now,now,String(mode),Number(win),Number(tie)),
    ...ids.map(station=>db.prepare("INSERT INTO arena_fight_stations(fight_id,station_id) VALUES(?,?)").bind(id,station)),
    auditStatement(db,actor,"fight.created","fight",id,null,{name,description,start_at:start,end_at:end,metric:data.metric,scoring_mode:mode,day_win_points:win,day_tie_points:tie,status,station_ids:ids}),
  ]);return json({id},201);
}
