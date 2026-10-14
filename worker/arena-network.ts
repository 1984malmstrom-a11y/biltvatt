import type { Env } from "./index";
import type { ArenaGroupBoard, ArenaMetric, ArenaStationStanding } from "../shared/arena-network";
import { roundedPoints } from "../shared/arena";
import { requireArenaSuperadmin } from "./arena-auth";
import { arenaRange } from "./arena-model";
import { body, checkFields, fail, json, text } from "./http";
import { arenaFightAdminApi } from "./arena-fights";

export const standingScore=(row:ArenaStationStanding,metric:ArenaMetric)=>metric==="tb" ? row.tb_ore : metric==="count" ? row.count : row.points;
export function rankStations(rows:ArenaStationStanding[],metric:ArenaMetric) {
  const sorted=rows.map(row=>({...row,points:roundedPoints(row.points)})).sort((a,b)=>standingScore(b,metric)-standingScore(a,metric) || a.name.localeCompare(b.name,"sv") || a.id.localeCompare(b.id));
  for(let i=0;i<sorted.length;i++) sorted[i].rank=i && standingScore(sorted[i],metric)===standingScore(sorted[i-1],metric) ? sorted[i-1].rank : i+1;
  return sorted;
}
export async function arenaGroupBoard(db:D1Database,url:URL,group:string | null,name:string):Promise<ArenaGroupBoard> {
  const filtered=new URL(url);filtered.searchParams.delete("group_id");const range=arenaRange(filtered);
  const metric=(filtered.searchParams.get("metric")??"points") as ArenaMetric;
  if(filtered.searchParams.has("activity_id") || filtered.searchParams.has("category")) fail(400,"Gemensamma topplistor visar stationsresultat för hela perioden.");
  const rows=await db.prepare(`SELECT s.id,s.name,0 rank,COUNT(r.id) count,COALESCE(SUM(r.points_awarded),0) points,
    COALESCE(SUM(r.tb_ore_awarded),0) tb_ore,SUM(CASE WHEN r.id IS NOT NULL AND r.tb_ore_awarded IS NULL THEN 1 ELSE 0 END) unknown_tb_count,
    (SELECT COUNT(*) FROM arena_sellers p WHERE p.station_id=s.id AND p.active=1) active_sellers
    FROM arena_stations s LEFT JOIN arena_registrations r ON r.station_id=s.id AND r.voided_at IS NULL AND r.registered_at>=? AND r.registered_at<?
    WHERE s.status='active' AND (? IS NULL OR EXISTS(SELECT 1 FROM arena_group_members m WHERE m.station_id=s.id AND m.group_id=?)) GROUP BY s.id`)
    .bind(range.from,range.to,group,group).all<ArenaStationStanding>();
  const standings=rankStations(rows.results,metric);
  // Equal totals have equal competition rank; no invented working hours or normalization.
  return {name,metric,normalization:"total",period:(filtered.searchParams.get("period")??"today") as ArenaGroupBoard["period"],range,standings};
}
export async function arenaGroupApi(request:Request,db:D1Database,station:string):Promise<Response> {
  const url=new URL(request.url),path=url.pathname;if(request.method!=="GET")fail(405,"Metoden stöds inte.");
  if(path==="/api/arena/groups") {
    const rows=await db.prepare("SELECT g.id,g.name FROM arena_groups g JOIN arena_group_members m ON m.group_id=g.id WHERE m.station_id=? ORDER BY g.name,g.id").bind(station).all();return json({groups:rows.results});
  }
  const match=path.match(/^\/api\/arena\/groups\/([a-zA-Z0-9:_-]{1,120})\/leaderboard$/);
  if(!match)fail(404,"Topplistan finns inte.");
  const group=await db.prepare("SELECT g.id,g.name FROM arena_groups g JOIN arena_group_members m ON m.group_id=g.id WHERE g.id=? AND m.station_id=?").bind(match![1],station).first<{id:string;name:string}>();
  if(!group)fail(404,"Topplistan finns inte för stationen.");return json(await arenaGroupBoard(db,url,group!.id,group!.name));
}
export async function arenaSuperadminApi(request:Request,env:Env):Promise<Response> {
  await requireArenaSuperadmin(request,env);const db=env.ARENA_DB!,url=new URL(request.url),path=url.pathname,method=request.method,now=new Date().toISOString();
  if(path.startsWith("/api/arena/superadmin/fights"))return arenaFightAdminApi(request,db);
  if(path==="/api/arena/superadmin/stations" && method==="GET") {
    const rows=await db.prepare("SELECT id,name,email,status,kind,created_at,updated_at FROM arena_stations ORDER BY status='pending' DESC,name,id").all();return json({stations:rows.results});
  }
  const station=path.match(/^\/api\/arena\/superadmin\/stations\/([a-zA-Z0-9:_-]{1,120})(?:\/(revoke))?$/);
  if(station && ((method==="PATCH" && !station[2]) || (method==="POST" && station[2]==="revoke"))) {
    if(!await db.prepare("SELECT id FROM arena_stations WHERE id=?").bind(station[1]).first())fail(404,"Stationen finns inte.");
    if(station[2]==="revoke") {await db.prepare("UPDATE arena_station_sessions SET revoked_at=? WHERE station_id=? AND revoked_at IS NULL").bind(now,station[1]).run();return json({ok:true});}
    const data=await body(request);checkFields(data,["status"]);
    if(!["pending","active","suspended"].includes(String(data.status)))fail(400,"Välj väntande, aktiv eller pausad station.");
    await db.batch([
      db.prepare("UPDATE arena_stations SET status=?,updated_at=? WHERE id=?").bind(String(data.status),now,station[1]),
      db.prepare("UPDATE arena_station_sessions SET revoked_at=? WHERE station_id=? AND revoked_at IS NULL AND ?='suspended'").bind(now,station[1],String(data.status)),
    ]);return json({ok:true});
  }
  if(path==="/api/arena/superadmin/groups" && method==="GET") {
    const [groups,members]=await Promise.all([db.prepare("SELECT id,name FROM arena_groups ORDER BY name,id").all<{id:string;name:string}>(),db.prepare("SELECT group_id,station_id FROM arena_group_members").all<{group_id:string;station_id:string}>()]);
    return json({groups:groups.results.map(g=>({...g,station_ids:members.results.filter(m=>m.group_id===g.id).map(m=>m.station_id)}))});
  }
  const group=path.match(/^\/api\/arena\/superadmin\/groups(?:\/([a-zA-Z0-9:_-]{1,120}))?$/);
  if(group && ((method==="POST" && !group[1]) || (method==="PATCH" && group[1]))) {
    const data=await body(request);checkFields(data,["name","station_ids"]);const name=text(data.name,"Gruppnamn");
    const ids=data.station_ids;if(!Array.isArray(ids) || ids.length>100 || ids.some(id=>typeof id!=="string" || id.length>120) || new Set(ids).size!==ids.length)fail(400,"Välj en giltig lista med stationer.");
    const stationIds=ids as string[];
    if(stationIds.length) {const found=await db.prepare(`SELECT id FROM arena_stations WHERE id IN (${stationIds.map(()=>"?").join(",")})`).bind(...stationIds).all();if(found.results.length!==stationIds.length)fail(400,"En deltagarstation finns inte.");}
    const id=group[1]??crypto.randomUUID();if(group[1] && !await db.prepare("SELECT id FROM arena_groups WHERE id=?").bind(id).first())fail(404,"Gruppen finns inte.");
    await db.batch([
      group[1] ? db.prepare("UPDATE arena_groups SET name=?,updated_at=? WHERE id=?").bind(name,now,id) : db.prepare("INSERT INTO arena_groups(id,name,created_at,updated_at) VALUES(?,?,?,?)").bind(id,name,now,now),
      db.prepare("DELETE FROM arena_group_members WHERE group_id=?").bind(id),
      ...stationIds.map(stationId=>db.prepare("INSERT INTO arena_group_members(group_id,station_id,joined_at) VALUES(?,?,?)").bind(id,stationId,now)),
    ]);return json({id},group[1]?200:201);
  }
  if(path==="/api/arena/superadmin/leaderboard" && method==="GET") {
    const groupId=url.searchParams.get("group_id");let name="Alla aktiva stationer";
    if(groupId) {const g=await db.prepare("SELECT name FROM arena_groups WHERE id=?").bind(text(groupId,"Grupp",120)).first<{name:string}>();if(!g)fail(404,"Gruppen finns inte.");name=g!.name;}
    return json(await arenaGroupBoard(db,url,groupId,name));
  }
  return fail(404,"Superadmin-funktionen finns inte.");
}
