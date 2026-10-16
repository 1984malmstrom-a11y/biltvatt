import {stockholmLocalDateTime} from '../shared/arena-clock';
import type {ArenaActor} from './arena-audit';
import {auditStatement} from './arena-audit';
import type {ContestRules} from '../shared/arena-contest';
import {body,checkFields,fail,json,text} from './http';
import {arenaDayStart} from '../shared/arena-leagues';
export type OrgStation={id:string;name:string;organization_id:string;region_id:string;district_id:string};
export type OrgGrant={organization_id:string;level:string;region_id:string;district_id:string};
export async function actorGrants(db:D1Database,actor:ArenaActor){return (await db.prepare('SELECT organization_id,level,region_id,district_id FROM arena_organization_grants WHERE account_id=?').bind(actor.id).all<OrgGrant>()).results;}
export const coversStation=(g:OrgGrant,s:OrgStation)=>g.organization_id===s.organization_id&&(g.level==='national'||g.level==='region'&&g.region_id===s.region_id||g.level==='district'&&g.region_id===s.region_id&&g.district_id===s.district_id);
export async function orgStations(db:D1Database){return (await db.prepare("SELECT s.id,s.name,m.organization_id,m.region_id,m.district_id FROM arena_station_organization m JOIN arena_stations s ON s.id=m.station_id WHERE s.status='active' ORDER BY s.id").all<OrgStation>()).results;}
export async function accessibleStations(db:D1Database,actor:ArenaActor){const rows=await orgStations(db);if(actor.role==='owner')return rows;const grants=await actorGrants(db,actor);return rows.filter(s=>grants.some(g=>coversStation(g,s)));}
export async function authorizeContest(db:D1Database,r:ContestRules,ids:string[],actor:ArenaActor,localStation?:string){
 const stations=(await orgStations(db)).filter(s=>s.organization_id===r.organization_id);
 if(ids.some(id=>!stations.some(s=>s.id===id)))fail(403,'Alla deltagare måste tillhöra samma behöriga organisation.');
 if(localStation){if(r.level!=='local'||ids.length!==1||ids[0]!==localStation||!['individual','station'].includes(r.kind))fail(403,'Stationschef får skapa lokala individ- och stationstävlingar.');}
 else if(actor.role!=='owner'){
  const grants=await actorGrants(db,actor);if(ids.some(id=>!grants.some(g=>coversStation(g,stations.find(s=>s.id===id)!))))fail(403,'Deltagare utanför ditt tilldelade område.');
  if(r.level==='national'&&!grants.some(g=>g.organization_id===r.organization_id&&g.level==='national'))fail(403,'Nationell tävling kräver centralt mandat inom organisationen.');
 }
 const eligible=stations.filter(s=>r.level==='district'?s.district_id===r.district_id&&s.region_id===r.region_id:r.level==='region'?s.region_id===r.region_id:true);
 if(r.level==='local'&&ids.length!==1)fail(400,'En lokal tävling har en station.');
 if(['district','region','national'].includes(r.level)&&(ids.length!==eligible.length||ids.some(id=>!eligible.some(s=>s.id===id))))fail(400,'Deltagarlistan måste motsvara den valda nivån. Använd Utvalda deltagare för ett urval.');
 return stations.filter(s=>ids.includes(s.id));
}
export async function assertCompetitionAccess(db:D1Database,id:string,actor:ArenaActor){
 const row=await db.prepare('SELECT organization_id FROM arena_leagues WHERE id=?').bind(id).first<{organization_id:string|null}>();if(!row)fail(404,'Tävlingen finns inte.');if(actor.role==='owner')return;
 if(!row!.organization_id)fail(403,'Äldre globala tävlingar kräver plattformsbehörighet.');
 const all=await accessibleStations(db,actor),members=(await db.prepare('SELECT station_id FROM arena_league_members WHERE league_id=?').bind(id).all<{station_id:string}>()).results;
 if(!members.length||members.some(m=>!all.some(s=>s.id===m.station_id&&s.organization_id===row!.organization_id)))fail(404,'Tävlingen finns inte inom ditt mandat.');
}
export async function organizationApi(request:Request,db:D1Database,actor:ArenaActor,localStation?:string):Promise<Response|null>{
 const path=new URL(request.url).pathname,base=localStation?'/api/admin/arena':'/api/arena/superadmin';
 if(path===`${base}/organization-context`&&request.method==='GET'){
  const allowed=localStation?(await orgStations(db)).filter(s=>s.id===localStation):await accessibleStations(db,actor),grants=localStation?[]:await actorGrants(db,actor);
  const owner=actor.role==='owner'&&!localStation;
  const orgs=(await db.prepare('SELECT * FROM arena_organizations ORDER BY name,id').all<{id:string}>()).results.filter(o=>owner||allowed.some(s=>s.organization_id===o.id)||grants.some(g=>g.organization_id===o.id));
  const orgIds=JSON.stringify(orgs.map(o=>o.id));
  const [regions,districts,flows,accounts]=await Promise.all([db.prepare('SELECT * FROM arena_regions WHERE organization_id IN (SELECT value FROM json_each(?))').bind(orgIds).all(),db.prepare('SELECT * FROM arena_districts WHERE organization_id IN (SELECT value FROM json_each(?))').bind(orgIds).all(),db.prepare('SELECT * FROM arena_customer_flow f WHERE station_id IN (SELECT value FROM json_each(?)) AND id=(SELECT id FROM arena_customer_flow WHERE station_id=f.station_id ORDER BY recorded_at DESC,id DESC LIMIT 1)').bind(JSON.stringify(allowed.map(s=>s.id))).all(),owner?db.prepare('SELECT id,display_name FROM arena_superadmins WHERE role=\'superadmin\' AND status=\'active\'').all():Promise.resolve({results:[]})]);
  const [categories,activities,sellers,unassigned]=await Promise.all([db.prepare('SELECT id,name FROM arena_activity_categories ORDER BY id').all(),db.prepare('SELECT id,station_id,name,arena_category_id FROM arena_activities WHERE active=1 AND station_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(allowed.map(s=>s.id))).all(),db.prepare('SELECT id,station_id,name FROM arena_sellers WHERE active=1 AND station_id IN (SELECT value FROM json_each(?)) ORDER BY name,id LIMIT 5001').bind(JSON.stringify(allowed.map(s=>s.id))).all(),owner?db.prepare('SELECT id,name FROM arena_stations WHERE NOT EXISTS(SELECT 1 FROM arena_station_organization WHERE station_id=arena_stations.id) ORDER BY name LIMIT 1000').all():Promise.resolve({results:[]})]);
  const visibleGrants=owner?(await db.prepare('SELECT account_id,organization_id,level,region_id,district_id FROM arena_organization_grants ORDER BY account_id,organization_id').all()).results:grants;
  return json({categories:categories.results,activities:activities.results,sellers:sellers.results,unassigned_stations:unassigned.results,owner,organizations:orgs,regions:regions.results,districts:districts.results,stations:allowed,flows:flows.results,grants:visibleGrants,accounts:accounts.results});
 }
 if(path===`${base}/customer-flow`&&request.method==='POST'){
  const d=await body(request);checkFields(d,['station_id','customers_milli','source','period_start','period_end']);const station=text(d.station_id,'Station',120),allowed=localStation?(await orgStations(db)).filter(s=>s.id===localStation):await accessibleStations(db,actor);
  if(!allowed.some(s=>s.id===station))fail(403,'Kundsnittet ligger utanför ditt mandat.');
  if(!Number.isSafeInteger(d.customers_milli)||Number(d.customers_milli)<=0||Number(d.customers_milli)>1000000000)fail(400,'Ange ett verifierat kundsnitt större än noll, högst 1 000 000 kunder/dag.');
  const from=text(d.period_start,'Mätperiodens start',10),to=text(d.period_end,'Mätperiodens slut',10);try{arenaDayStart(from);arenaDayStart(to);if(to<from||to>new Date().toISOString().slice(0,10))throw Error();}catch{fail(400,'Välj en avslutad giltig mätperiod.');}
  const active=await db.prepare("SELECT l.id FROM arena_leagues l JOIN arena_league_members m ON m.league_id=l.id WHERE m.station_id=? AND l.result_json IS NULL AND l.status='open' AND l.start_day<=? AND l.end_day>=? AND json_extract(l.rules_json,'$.contest.fair_play') IS NOT NULL LIMIT 1").bind(station,stockholmLocalDateTime().slice(0,10),stockholmLocalDateTime().slice(0,10)).first();if(active)fail(409,'Kundsnitt får inte ändras under en aktiv FAIR PLAY-tävling.');
  const id=crypto.randomUUID(),record={id,station_id:station,customers_milli:Number(d.customers_milli),source:text(d.source,'Källa',300),period_start:from,period_end:to,recorded_at:new Date().toISOString()};
  await db.batch([db.prepare('INSERT INTO arena_customer_flow(id,station_id,customers_milli,source,period_start,period_end,recorded_at,actor_id) VALUES(?,?,?,?,?,?,?,?)').bind(id,station,record.customers_milli,record.source,from,to,record.recorded_at,actor.id),auditStatement(db,actor,'customer-flow.recorded','station',station,null,record,station)]);return json({id},201);
 }
 if(!path.startsWith(`${base}/organizations`)&&path!==`${base}/organization-membership`&&path!==`${base}/organization-grants`)return null;
 if(actor.role!=='owner'||localStation)fail(403,'Endast plattformsägaren får tilldela organisationsstruktur och mandat.');
 const d=await body(request),id=crypto.randomUUID(),now=new Date().toISOString();let statement:D1PreparedStatement;
 if(path===`${base}/organizations`&&request.method==='POST'){checkFields(d,['name','country_code']);const country=text(d.country_code,'Landskod',2).toUpperCase();if(!/^[A-Z]{2}$/.test(country))fail(400,'Ange två bokstäver för land.');statement=db.prepare('INSERT INTO arena_organizations VALUES(?,?,?,?)').bind(id,text(d.name,'Organisation'),country,now);}
 else if(path===`${base}/organizations/regions`&&request.method==='POST'){checkFields(d,['organization_id','name']);statement=db.prepare('INSERT INTO arena_regions VALUES(?,?,?)').bind(id,text(d.organization_id,'Organisation',120),text(d.name,'Region'));}
 else if(path===`${base}/organizations/districts`&&request.method==='POST'){checkFields(d,['organization_id','region_id','name']);statement=db.prepare('INSERT INTO arena_districts VALUES(?,?,?,?)').bind(id,text(d.organization_id,'Organisation',120),text(d.region_id,'Region',120),text(d.name,'Distrikt'));}
 else if(path===`${base}/organization-membership`&&request.method==='POST'){
  checkFields(d,['station_id','organization_id','region_id','district_id']);const sid=text(d.station_id,'Station',120);
  if(await db.prepare('SELECT 1 FROM arena_station_organization WHERE station_id=?').bind(sid).first())fail(409,'Stationen har redan en organisation. Flytt kräver en separat granskad process.');
  if(await db.prepare('SELECT 1 FROM arena_fight_stations m JOIN arena_fights f ON f.id=m.fight_id WHERE m.station_id=? AND f.result_json IS NULL AND f.status<>\'cancelled\' LIMIT 1').bind(sid).first())fail(409,'Avsluta befintliga matcher före organisationstilldelning.');
  if(await db.prepare('SELECT 1 FROM arena_group_members WHERE station_id=? LIMIT 1').bind(sid).first())fail(409,'Ta bort äldre globala gruppkopplingar innan stationen får en organisation.');
  statement=db.prepare('INSERT INTO arena_station_organization VALUES(?,?,?,?)').bind(sid,text(d.organization_id,'Organisation',120),text(d.region_id,'Region',120),text(d.district_id,'Distrikt',120));
 }else if(path===`${base}/organization-grants`&&['POST','DELETE'].includes(request.method)){
  checkFields(d,['account_id','organization_id','level','region_id','district_id']);const account=text(d.account_id,'Administratör',120),org=text(d.organization_id,'Organisation',120),level=text(d.level,'Mandat',20),region=typeof d.region_id==='string'?d.region_id:'',district=typeof d.district_id==='string'?d.district_id:'';
  if(!['national','region','district'].includes(level)||level==='national'&&(region!==''||district!=='')||level==='region'&&(!region||district!=='')||level==='district'&&(!region||!district))fail(400,'Välj korrekt region/distrikt för mandatet.');
  if(!await db.prepare("SELECT id FROM arena_superadmins WHERE id=? AND role='superadmin'").bind(account).first())fail(400,'Välj ett befintligt administratörskonto.');
  if(region&&!await db.prepare('SELECT id FROM arena_regions WHERE id=? AND organization_id=?').bind(region,org).first()||district&&!await db.prepare('SELECT id FROM arena_districts WHERE id=? AND region_id=? AND organization_id=?').bind(district,region,org).first())fail(400,'Området hör inte till organisationen.');
  statement=request.method==='POST'?db.prepare('INSERT OR IGNORE INTO arena_organization_grants VALUES(?,?,?,?,?)').bind(account,org,level,region,district):db.prepare('DELETE FROM arena_organization_grants WHERE account_id=? AND organization_id=? AND level=? AND region_id=? AND district_id=?').bind(account,org,level,region,district);
 }else return fail(405,'Organisationsfunktionen stöder inte åtgärden.');
 try{await db.batch([statement,auditStatement(db,actor,'organization.configured','organization',id,null,{path,...d})]);}catch(e){if(/FOREIGN KEY/.test(String(e)))fail(400,'Organisation, region och distrikt måste höra ihop.');throw e;}return json({id},201);
}
