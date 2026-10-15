import type {ArenaFightActivity} from '../shared/arena';
import {fightWindows} from './arena-fight-windows';
import {fail} from './http';
// Reuse 0010's immutable descriptors and the existing registration/undo ledger.
// Backing rows are inactive and reserved under temp:, never normal activity setup.
export async function temporaryFightActivities(db:D1Database,station:string,fightId:string):Promise<ArenaFightActivity[]>{
 const rows=await db.prepare(`SELECT t.*,f.status,f.result_json FROM arena_temporary_fight_activities t JOIN arena_fights f ON f.id=t.fight_id JOIN arena_fight_stations m ON m.fight_id=f.id AND m.station_id=t.station_id WHERE t.station_id=? AND t.fight_id=? AND t.start_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND (t.end_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') OR json_extract(f.live_json,'$.sudden_death')=1) AND f.status<>'cancelled' AND f.result_json IS NULL`).bind(station,fightId).all<{id:string;fight_id:string;start_at:string;end_at:string;snapshot_json:string}>();
 return rows.results.map(r=>{const s=JSON.parse(r.snapshot_json);return {id:`temp:${r.id}`,fight_id:r.fight_id,start_at:r.start_at,end_at:r.end_at,name:s.name,points:s.points,tb_ore:s.tb_ore,display_mode:s.display_mode??'points',image_key:s.image_key,arena_category_id:s.category_id,category:'Butiksfight',offer_text:'TILLFÄLLIG FIGHT-AKTIVITET',price_text:'',sort_order:0,active:1};});
}
export async function prepareTemporarySale(db:D1Database,station:string,activityId:string){
 const descriptor=activityId.slice(5),row=await db.prepare(`SELECT t.fight_id id,t.start_at,t.end_at FROM arena_temporary_fight_activities t JOIN arena_fights f ON f.id=t.fight_id WHERE t.id=? AND t.station_id=? AND t.start_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND (t.end_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') OR json_extract(f.live_json,'$.sudden_death')=1) AND f.result_json IS NULL AND f.status<>'cancelled'`).bind(descriptor,station).first<{id:string;start_at:string;end_at:string}>();
 if(!row)fail(409,'Fight-aktiviteten är inte tillgänglig för stationen eller perioden.');
 if((await fightWindows(db,[row!])).get(row!.id)?.blocked_by)fail(409,'Fighten väntar på föregående sudden death.');
 // Only the active descriptor may introduce this namespaced ledger activity.
 await db.batch([
 db.prepare(`INSERT OR IGNORE INTO arena_activities(id,station_id,name,offer_text,price_text,points,tb_ore,display_mode,image_key,category,sort_order,active,arena_category_id,created_at,updated_at) SELECT ?,station_id,json_extract(snapshot_json,'$.name'),'Tillfällig fight-aktivitet','',json_extract(snapshot_json,'$.points'),json_extract(snapshot_json,'$.tb_ore'),COALESCE(json_extract(snapshot_json,'$.display_mode'),'points'),json_extract(snapshot_json,'$.image_key'),'Butiksfight',99999,0,json_extract(snapshot_json,'$.category_id'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM arena_temporary_fight_activities WHERE id=? AND station_id=?`).bind(activityId,descriptor,station),
 db.prepare(`INSERT OR IGNORE INTO arena_fight_activity_rules(fight_id,station_id,activity_id,snapshot_json) SELECT fight_id,station_id,?,snapshot_json FROM arena_temporary_fight_activities WHERE id=? AND station_id=?`).bind(activityId,descriptor,station)]);
 return row!.id;
}
