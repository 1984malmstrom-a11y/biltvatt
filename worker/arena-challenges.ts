import {arenaRequestPath} from './arena-route';
import type {Env} from './index';
import type {FightCenter,FightChallenge,CompetitionRules} from '../shared/arena-competitions';
import {competitionEnd} from '../shared/arena-competitions';
import {arenaDayStart,arenaNextDay} from '../shared/arena-leagues';
import {stockholmLocalDateTime} from '../shared/arena-clock';
import {competitionInput,assertStationsFree,competitionBatch,competitionAudit,notice,resolveScope} from './arena-competition-model';
import {prepareCompetition,cancelCompetition} from './arena-competitions';
import {deliverFightNotifications} from './arena-fight-notifications';
import {body,checkFields,fail,json,text} from './http';
export async function fightNoticeState(db:D1Database,station:string){
 const state=await db.prepare(`SELECT (SELECT COUNT(*) FROM arena_challenges WHERE challenged_id=? AND status='pending' AND expires_at>?) incoming,(SELECT COUNT(*) FROM arena_fight_notifications WHERE station_id=? AND read_at IS NULL) unread,(SELECT COUNT(*) FROM arena_challenges WHERE challenger_id=? AND status='pending' AND expires_at>?) outgoing,(SELECT COUNT(*) FROM arena_station_bookings WHERE station_id=? AND released_at IS NULL AND start_at>?) scheduled`).bind(station,new Date().toISOString(),station,station,new Date().toISOString(),station,new Date().toISOString()).first<{incoming:number;unread:number;outgoing:number;scheduled:number}>();return state??{incoming:0,unread:0};
}
export async function fightCenter(db:D1Database,station:string):Promise<FightCenter>{
 const now=new Date().toISOString();
 const [challenges,notifications,stations,activities,bookings,competitions,categories]=await Promise.all([
 db.prepare(`SELECT c.*,a.name challenger_name,b.name challenged_name FROM arena_challenges c JOIN arena_stations a ON a.id=c.challenger_id JOIN arena_stations b ON b.id=c.challenged_id WHERE c.challenger_id=? OR c.challenged_id=? ORDER BY c.created_at DESC LIMIT 100`).bind(station,station).all<any>(),
 db.prepare('SELECT id,kind,title,body,resource_id,read_at FROM arena_fight_notifications WHERE station_id=? ORDER BY created_at DESC LIMIT 50').bind(station).all<any>(),
 db.prepare("SELECT id,name FROM arena_stations WHERE status='active' AND NOT EXISTS(SELECT 1 FROM arena_station_organization WHERE station_id=arena_stations.id) ORDER BY name LIMIT 500").all<any>(),
 db.prepare('SELECT id,name,arena_category_id,category FROM arena_activities WHERE station_id=? AND active=1 ORDER BY sort_order,id').bind(station).all<any>(),
 db.prepare(`SELECT b.station_id,b.start_at,b.end_at,CASE WHEN b.station_id=? THEN COALESCE(l.name,f.name,'Butiksfight') ELSE 'En annan Butiksfight' END name FROM arena_station_bookings b LEFT JOIN arena_leagues l ON l.id=b.owner_id LEFT JOIN arena_fights f ON f.id=b.owner_id WHERE b.released_at IS NULL AND b.end_at>? ORDER BY b.start_at LIMIT 500`).bind(station,now).all<any>(),
 db.prepare(`SELECT l.id,l.name,l.format,l.start_day,l.status,l.result_json FROM arena_leagues l JOIN arena_league_members m ON m.league_id=l.id WHERE m.station_id=? AND l.request_key IS NOT NULL ORDER BY l.created_at DESC LIMIT 50`).bind(station).all<any>(),db.prepare('SELECT id,name FROM arena_activity_categories ORDER BY id').all<any>()]);
 const assigned=await db.prepare('SELECT station_id FROM arena_station_organization WHERE station_id=?').bind(station).first();
 const cs:FightChallenge[]=challenges.results.map(c=>({...c,rules:JSON.parse(c.rules_json),activity_suggestions:activities.results.filter(a=>JSON.parse(c.rules_json).activity_snapshots?.some((other:any)=>other.arena_category_id&&a.arena_category_id===other.arena_category_id||other.name.toLocaleLowerCase('sv-SE')===a.name.toLocaleLowerCase('sv-SE'))).map(a=>({id:a.id,name:a.name})),response:c.response_json?JSON.parse(c.response_json):undefined,status:c.status==='pending'&&c.expires_at<=now?'expired':c.status,busy:c.status==='pending'?bookings.results.find(b=>[c.challenger_id,c.challenged_id].includes(b.station_id)&&b.start_at<arenaDayStart(arenaNextDay(c.day))&&b.end_at>arenaDayStart(c.day))?.name:undefined}));
 return {station_id:station,competitions:competitions.results.map(c=>({id:c.id,name:c.name,format:c.format,phase:c.result_json?JSON.parse(c.result_json).phase:c.status==='cancelled'?'cancelled':c.start_day>stockholmLocalDateTime().slice(0,10)?'scheduled':'active'})),challenges:cs,notifications:notifications.results,incoming:cs.filter(c=>c.challenged_id===station&&c.status==='pending').length,stations:assigned?[]:stations.results,activities:assigned?[]:activities.results,bookings:assigned?[]:bookings.results,categories:categories.results};
}
export async function challengeAdminApi(request:Request,env:Env,station:string){
 const db=env.ARENA_DB!,path=arenaRequestPath(request),base='/api/admin/arena/challenges',suffix=path.slice(base.length).split('/').filter(Boolean),actor={id:station,display_name:(await db.prepare('SELECT name FROM arena_stations WHERE id=?').bind(station).first<{name:string}>())?.name??station,role:'station' as const};
 if(path==='/api/admin/arena/competition-availability'&&request.method==='GET')return json(await fightCenter(db,station));
 if(!suffix.length&&request.method==='GET')return json(await fightCenter(db,station));
 if(!suffix.length&&request.method==='POST'){
  const d=await body(request);checkFields(d,['request_id','opponent_id','day','metric','scope']);const opponent=text(d.opponent_id,'Motståndare',120);if(await db.prepare('SELECT station_id FROM arena_station_organization WHERE station_id IN (?,?) LIMIT 1').bind(station,opponent).first())fail(400,'Organisationsbundna matcher skapas av behörig tävlingsarrangör.');const day=text(d.day,'Matchdag',10);if(opponent===station)fail(400,'Välj en annan station.');
  const input=competitionInput({name:`${actor.display_name} · Dagsduell`,request_id:d.request_id,format:'daily',metric:d.metric,station_ids:[station,opponent],start_day:day,end_day:day,scope:d.scope});
  const today=stockholmLocalDateTime().slice(0,10);if(day<today||day>arenaNextDay(today,90))fail(400,'Dagsduellen ska vara idag eller högst 90 dagar framåt.');
  // Pending requests do not acquire bookings. Validate own mapping only now.
  const activity_snapshots=await resolveScope(db,[station],input.scope,arenaDayStart(day));
  if(!await db.prepare("SELECT 1 FROM arena_stations WHERE id=? AND status='active'").bind(opponent).first())fail(400,'Motståndaren är inte aktiv.');
  const previous=await db.prepare('SELECT id,challenger_id,rules_json,challenged_id,day FROM arena_challenges WHERE request_key=?').bind(input.request_id).first<any>();
  if(previous){if(previous.challenger_id!==station||previous.challenged_id!==opponent||previous.day!==day||JSON.parse(previous.rules_json).metric!==input.metric||JSON.stringify(JSON.parse(previous.rules_json).scope)!==JSON.stringify(input.scope))fail(409,'Begäran har redan använts.');return json({id:previous.id},201);}
  const id=crypto.randomUUID(),now=new Date().toISOString(),expires=arenaDayStart(arenaNextDay(day)),{name,request_id,...rules}=input;
  await db.batch([db.prepare("INSERT INTO arena_challenges(id,request_key,challenger_id,challenged_id,day,expires_at,rules_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,input.request_id,station,opponent,day,expires,JSON.stringify({...rules,activity_snapshots}),now,now),notice(db,opponent,'challenge',id,'NY UTMANING',`${actor.display_name} har utmanat er på en dagsduell.`,`sent:${id}`),competitionAudit(db,actor,'challenge.sent',id,{opponent,day,rules},`sent:${id}`)]);
  await deliverFightNotifications(env,id);return json({id},201);
 }
 if(suffix.length===2&&request.method==='POST'){
  const [id,action]=suffix,d=await body(request);checkFields(d,['request_id','reason','activity_id','confirm','temporary_activity']);
  const c=await db.prepare('SELECT * FROM arena_challenges WHERE id=? AND (challenger_id=? OR challenged_id=?)').bind(id,station,station).first<any>();if(!c)fail(404,'Utmaningen finns inte för stationen.');
  if(['accept','decline'].includes(action)&&c.challenged_id!==station)fail(403,'Bara mottagaren får svara på utmaningen.');if(action==='withdraw'&&c.challenger_id!==station)fail(403,'Bara utmanaren får dra tillbaka.');
  const now=new Date().toISOString(),rules=JSON.parse(c.rules_json) as CompetitionRules;
  if(action==='cancel'){if(d.confirm!==true)fail(400,'Bekräfta avbrottet.');if(!c.competition_id)fail(409,'Ingen aktiv duell finns.');await cancelCompetition(db,c.competition_id,text(d.reason,'Anledning',240),actor,station);await deliverFightNotifications(env,c.competition_id);return json({ok:true});}
  if(!['accept','decline','withdraw'].includes(action))fail(405,'Okänd utmaningsåtgärd.');
  if(action==='accept'&&c.status==='accepted')return json({id:c.competition_id});
  if((action==='decline'&&c.status==='declined')||(action==='withdraw'&&c.status==='withdrawn'))return json({ok:true});
  if(c.status!=='pending'||c.expires_at<=now)fail(409,'Utmaningen är redan besvarad eller har gått ut.');
  if(action==='accept'){
   if(d.confirm!==true)fail(400,'Läs och bekräfta reglerna innan accept.');
   if(rules.scope.kind==='activity'){const activity=text(d.activity_id,'Er motsvarande aktivitet',120);rules.scope={...rules.scope,activity_ids:{...rules.scope.activity_ids,[station]:activity}};}
   if(d.temporary_activity!==undefined)fail(400,'Tillfällig aktivitet kräver Superadmin och mänsklig UI-review. Välj en befintlig aktivitet för denna duell.');
   await assertStationsFree(db,rules.station_ids,arenaDayStart(rules.start_day),arenaDayStart(competitionEnd(rules)));
   const prepared=await prepareCompetition(db,{...rules,name:`${actor.display_name} · Dagsduell`,request_id:`challenge:${id}`},actor,`duel:${id}`);
   prepared.statements.push(db.prepare("UPDATE arena_challenges SET status='accepted',competition_id=?,response_json=?,updated_at=? WHERE id=?").bind(prepared.id,JSON.stringify({by:station,rules}),now,id),competitionAudit(db,actor,'challenge.accepted',id,{competition_id:prepared.id},`accept:${id}`),competitionAudit(db,actor,rules.scope.kind==='activity'?'activity.mapping.manual':'activity.mapping.accepted',id,rules.scope,`mapping:${id}`),notice(db,c.challenger_id,'accepted',id,'UTMANINGEN ACCEPTERAD',`${actor.display_name} accepterade dagsduellen.`,`accept:${id}`));
   try{await competitionBatch(db,prepared.statements);}catch(e){const accepted=await db.prepare("SELECT competition_id FROM arena_challenges WHERE id=? AND status='accepted'").bind(id).first<{competition_id:string}>();if(accepted)return json({id:accepted.competition_id});if(String(e).includes('arena_challenge_closed'))fail(409,'Utmaningen ändrades samtidigt.');throw e;}
   await deliverFightNotifications(env,id);return json({id:prepared.id});
  }
  const status=action==='decline'?'declined':'withdrawn',reason=d.reason===undefined?'':text(d.reason,'Anledning',240),other=station===c.challenger_id?c.challenged_id:c.challenger_id;
  try{await db.batch([db.prepare('UPDATE arena_challenges SET status=?,response_json=?,updated_at=? WHERE id=?').bind(status,JSON.stringify({reason,by:station}),now,id),notice(db,other,status,id,action==='decline'?'UTMANINGEN AVBÖJD':'UTMANINGEN ÅTERKALLAD',`${actor.display_name}${reason?`: ${reason}`:''}`,`${status}:${id}`),competitionAudit(db,actor,`challenge.${status}`,id,{reason},`${status}:${id}`)]);}catch(e){if(String(e).includes('arena_challenge_closed'))fail(409,'Utmaningen ändrades samtidigt.');throw e;}
  await deliverFightNotifications(env,id);return json({ok:true});
 }
 return fail(405,'Utmaningsfunktionen stöder inte åtgärden.');
}
