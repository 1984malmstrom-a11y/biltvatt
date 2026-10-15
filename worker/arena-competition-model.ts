import type {CompetitionInput,CompetitionRules,FightScope} from '../shared/arena-competitions';
import {competitionSchedule,competitionEnd,competitionFormats} from '../shared/arena-competitions';
import {arenaDayStart,arenaNextDay} from '../shared/arena-leagues';
import {stockholmLocalDateTime} from '../shared/arena-clock';
import type {ArenaActor} from './arena-audit';
import {fail,text} from './http';
export const systemActor:ArenaActor={id:'arena-engine',display_name:'Arena tävlingsmotor',role:'system'};
export const categories=[['wash','BILTVÄTT'],['fika','KAFFE / FIKA'],['food','MAT'],['drink','DRYCK'],['car-care','BILVÅRD'],['campaign','KAMPANJ'],['other','ÖVRIGT']] as const;
export function competitionInput(d:Record<string,unknown>):CompetitionInput{
 const allowed=['name','request_id','format','metric','station_ids','start_day','end_day','double_round','playoff_size','match_days','win','draw','secondary_metric','tie_rule','scope'];
 if(Object.keys(d).some(k=>!allowed.includes(k)))fail(400,'Tävlingsinställningen innehåller okända fält.');
 const r={name:text(d.name,'Tävlingsnamn',80),request_id:text(d.request_id,'Begäran',120),format:d.format,metric:d.metric,station_ids:d.station_ids,start_day:d.start_day,end_day:d.end_day??d.start_day,double_round:d.double_round??false,playoff_size:d.playoff_size??4,match_days:d.match_days??1,win:d.win??1,draw:d.draw??.5,secondary_metric:d.secondary_metric??(d.metric==='tb'?'points':'tb'),tie_rule:d.tie_rule??'secondary',scope:d.scope??{kind:'all'}} as CompetitionInput;
 if(!competitionFormats.some(f=>f[0]===r.format)||!['points','tb','count'].includes(r.metric)||!['points','tb','count'].includes(r.secondary_metric)||r.secondary_metric===r.metric||!['secondary','seed','sudden-death'].includes(r.tie_rule)||typeof r.double_round!=='boolean')fail(400,'Välj giltiga tävlings- och skiljeregler.');
 if(r.tie_rule==='seed'&&r.format!=='playoffs')fail(400,'Högre seed får bara avgöra liga med slutspel.');
 if(!Array.isArray(r.station_ids)||r.station_ids.some(s=>typeof s!=='string'||!s||s.length>120)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(r.start_day)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(r.end_day))fail(400,'Välj giltiga stationer och kalenderdagar.');
 const scope=r.scope;if(!scope||!['all','focus','category','activity'].includes(scope.kind)||Object.keys(scope).some(k=>!['kind','category_id','activity_ids'].includes(k)))fail(400,'Välj giltig omfattning.');
 if(scope.kind==='category'&&!categories.some(c=>c[0]===scope.category_id))fail(400,'Välj en Arena-kategori.');
 if(scope.kind==='activity'&&(!scope.activity_ids||typeof scope.activity_ids!=='object'||Array.isArray(scope.activity_ids)))fail(400,'Välj lokal aktivitet för varje station.');
 try{competitionSchedule(r);const end=competitionEnd(r);if(Date.parse(arenaDayStart(end))-Date.parse(arenaDayStart(r.start_day))>366*86400000)throw Error('Spelschemat får omfatta högst ett år.');if(!['sprint','daily'].includes(r.format))r.end_day=arenaNextDay(end,-1);}catch(e){fail(400,(e as Error).message);}
 if(r.start_day<stockholmLocalDateTime().slice(0,10))fail(400,'En ny tävling ska börja idag eller senare.');
 return r;
}
export function competitionAudit(db:D1Database,actor:ArenaActor,action:string,resource:string,data:unknown,key:string){return db.prepare(`INSERT OR IGNORE INTO arena_audit_log(id,actor_id,actor_display,actor_role,action,resource_type,resource_id,station_id,before_json,after_json,metadata_json,created_at) VALUES(?,?,?,?,?,'competition',?,NULL,NULL,?,'{}',?)`).bind(`competition:${key}`,actor.id,actor.display_name,actor.role,action,resource,JSON.stringify(data),new Date().toISOString());}
export function notice(db:D1Database,station:string,kind:string,id:string,title:string,body:string,key:string){return db.prepare(`INSERT OR IGNORE INTO arena_fight_notifications(id,station_id,event_key,kind,title,body,resource_id,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(`${station}:${key}`,station,key,kind,title,body,id,new Date().toISOString());}
export async function assertStationsFree(db:D1Database,ids:string[],start:string,end:string,owner=''){
 const active=await db.prepare(`SELECT id,name FROM arena_stations WHERE status='active' AND id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<{id:string;name:string}>();if(active.results.length!==ids.length)fail(400,'Alla deltagare måste vara aktiva stationer.');
 const busy=await db.prepare(`SELECT s.name,b.end_at FROM arena_station_bookings b JOIN arena_stations s ON s.id=b.station_id WHERE b.released_at IS NULL AND b.owner_id<>? AND b.start_at<? AND b.end_at>? AND b.station_id IN (SELECT value FROM json_each(?)) LIMIT 1`).bind(owner,end,start,JSON.stringify(ids)).first<{name:string;end_at:string}>();
 if(busy)fail(409,`${busy.name} deltar redan i en överlappande Butiksfight till ${busy.end_at}.`);
 const sudden=await db.prepare(`SELECT f.id FROM arena_fights f JOIN arena_fight_stations m ON m.fight_id=f.id WHERE f.result_json IS NULL AND f.status<>'cancelled' AND json_extract(f.live_json,'$.sudden_death')=1 AND m.station_id IN (SELECT value FROM json_each(?)) LIMIT 1`).bind(JSON.stringify(ids)).first();if(sudden)fail(409,'Stationen har en pågående sudden death. Vänta tills den är avgjord.');
 return active.results;
}
export type ActivitySnapshot={id:string;station_id:string;name:string;points:number;tb_ore:number|null;display_mode:string;image_key:string|null;category:string;arena_category_id:string|null};
export async function resolveScope(db:D1Database,ids:string[],scope:FightScope,start:string):Promise<ActivitySnapshot[]>{
 const rows=await db.prepare(`SELECT id,station_id,name,points,tb_ore,display_mode,image_key,category,arena_category_id FROM arena_activities WHERE active=1 AND station_id IN (SELECT value FROM json_each(?)) ORDER BY sort_order,id`).bind(JSON.stringify(ids)).all<ActivitySnapshot>();
 if(scope.kind==='all')return rows.results;
 let selected=rows.results;
 if(scope.kind==='category')selected=selected.filter(a=>a.arena_category_id===scope.category_id);
 if(scope.kind==='activity')selected=selected.filter(a=>scope.activity_ids?.[a.station_id]===a.id);
 if(scope.kind==='focus'){
  const focuses=await db.prepare(`SELECT station_id,activity_id FROM arena_campaigns WHERE active=1 AND start_at<=? AND end_at>? AND station_id IN (SELECT value FROM json_each(?)) ORDER BY start_at DESC,id`).bind(start,start,JSON.stringify(ids)).all<{station_id:string;activity_id:string}>();
  const focus=new Map<string,string>();for(const f of focuses.results)if(!focus.has(f.station_id))focus.set(f.station_id,f.activity_id);
  selected=selected.filter(a=>focus.get(a.station_id)===a.id);
 }
 if(ids.some(id=>!selected.some(a=>a.station_id===id)))fail(400,'En station saknar matchande aktiv aktivitet eller månadsfokus. Välj lokal mappning innan accept.');
 return selected;
}
export function bookingStatements(db:D1Database,id:string,r:CompetitionRules){return r.station_ids.map(station=>db.prepare('INSERT INTO arena_station_bookings(station_id,owner_id,start_at,end_at) VALUES(?,?,?,?)').bind(station,id,arenaDayStart(r.start_day),arenaDayStart(competitionEnd(r))));}
export async function competitionBatch(db:D1Database,statements:D1PreparedStatement[]){try{return await db.batch(statements);}catch(e){if(String(e).includes('arena_station_busy'))fail(409,'Stationen bokades samtidigt av en annan tävling. Ingen del av denna tävling skapades.');throw e;}}
