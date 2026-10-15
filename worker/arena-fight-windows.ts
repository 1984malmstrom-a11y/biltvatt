// A sudden-death match keeps its participants until its decisive registration.
// Prebooked future matches wait; sales while waiting never count in both events.
export async function fightWindows(db:D1Database,fs:{id:string;start_at:string;end_at:string}[]){
 const windows=new Map(fs.map(f=>[f.id,{start_at:f.start_at,blocked_by:null as string|null}]));if(!fs.length)return windows;
 const rows=await db.prepare(`SELECT current.id,previous.id previous_id,previous.result_json,previous.live_json
 FROM arena_fights current JOIN arena_fights previous ON previous.start_at<current.start_at AND previous.id<>current.id
 WHERE previous.knockout_json IS NOT NULL AND current.id IN (SELECT value FROM json_each(?)) AND (json_extract(previous.live_json,'$.sudden_death')=1 OR json_extract(previous.result_json,'$.sudden_death_ended_at') IS NOT NULL)
 AND EXISTS(SELECT 1 FROM arena_fight_stations a JOIN arena_fight_stations b ON b.station_id=a.station_id WHERE a.fight_id=current.id AND b.fight_id=previous.id)`)
 .bind(JSON.stringify(fs.map(f=>f.id))).all<{id:string;previous_id:string;result_json:string|null;live_json:string|null}>();
 for(const row of rows.results){const w=windows.get(row.id)!,finished=row.result_json?JSON.parse(row.result_json):null;if(!finished){w.blocked_by=row.previous_id;continue;}const ended=finished.sudden_death_ended_at??finished.cancelled?.at;if(ended){const floor=new Date(Date.parse(ended)+1).toISOString();if(floor>w.start_at)w.start_at=floor;}}
 return windows;
}
