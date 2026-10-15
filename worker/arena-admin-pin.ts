import type {Env} from './index';
import {recentAuth} from './arena-security';
import {resolveArenaStation} from './arena-auth';
import {passwordHash,passwordMatches,randomToken,tokenHash} from '../shared/arena-crypto';
import {audit,auditStatement,type ArenaActor} from './arena-audit';
import {body,checkFields,fail,json} from './http';
export const ADMIN_IDLE_MS=20*60000;
const AGE=8*3600,COOKIE='arena_station_admin',BASE='/api/arena/auth/admin-access';
const value=(r:Request)=>r.headers.get('Cookie')?.match(/(?:^|;\s*)arena_station_admin=([a-f0-9]{64})(?:;|$)/)?.[1];
const cookie=(r:Request,t:string,age=AGE)=>`${COOKIE}=${t}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(r.url).protocol==='https:'?'; Secure':''}`;
type Pin={pin_hash:string;pin_salt:string;pin_iterations:number;version:number};
function pin(v:unknown){if(typeof v!=='string'||!/^\d{6}$/.test(v))fail(400,'PIN ska bestå av exakt 6 siffror.');return v as string;}
const actor=(key:string):ArenaActor=>({id:key,display_name:'Stationsadmin',role:'station'});
async function elevation(r:Request,env:Env,identity:Awaited<ReturnType<typeof resolveArenaStation>>){
 const token=value(r);if(!token||!identity.session)return null;
 return env.ARENA_DB!.prepare(`SELECT e.token_hash FROM arena_admin_elevations e JOIN arena_admin_pins p ON p.station_id=e.station_id AND p.version=e.pin_version
 WHERE e.token_hash=? AND e.station_id=? AND e.station_session_id=? AND e.revoked_at IS NULL AND e.expires_at>? AND e.last_active_at>?`)
 .bind(await tokenHash(token),identity.key,identity.session.session_id,new Date().toISOString(),new Date(Date.now()-ADMIN_IDLE_MS).toISOString()).first<{token_hash:string}>();
}
export async function requireArenaAdminElevation(r:Request,env:Env){const i=await resolveArenaStation(r,env);if(!await elevation(r,env,i))fail(401,'Ange stationens admin-PIN för att fortsätta.');return i;}
async function reserve(db:D1Database,key:string){
 const now=new Date().toISOString(),cutoff=new Date(Date.now()-5*60000).toISOString();
 const attempt=await db.prepare(`INSERT INTO arena_admin_pin_attempts(station_id,attempts,window_start) VALUES(?,1,?) ON CONFLICT(station_id) DO UPDATE SET attempts=CASE WHEN window_start<=? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<=? THEN excluded.window_start ELSE window_start END RETURNING attempts`)
 .bind(key,now,cutoff,cutoff).first<{attempts:number}>();
 if((attempt?.attempts??6)>5){if(attempt?.attempts===6)await audit(db,actor(key),'admin.pin.locked','station',key,null,null,key);fail(429,'För många försök. Försök igen om 5 minuter.');}
 return attempt!.attempts;
}
async function verify(db:D1Database,key:string,input:string){
 const attempt=await reserve(db,key),p=await db.prepare('SELECT pin_hash,pin_salt,pin_iterations,version FROM arena_admin_pins WHERE station_id=?').bind(key).first<Pin>();
 const valid=p?await passwordMatches(input,p.pin_hash,p.pin_salt,p.pin_iterations):(await passwordHash(input),false);
 if(!valid){await audit(db,actor(key),'admin.pin.rejected','station',key,null,null,key);fail(401,'Fel PIN. Försök igen.');}return {p:p!,attempt};
}
export async function resetArenaAdminPin(r:Request,env:Env,station:string,a:ArenaActor){
 recentAuth(a);
 const db=env.ARENA_DB!,d=await body(r);checkFields(d,['new_pin','confirm_pin']);const next=pin(d.new_pin);if(next!==pin(d.confirm_pin))fail(400,'PIN-koderna stämmer inte överens.');
 const st=await db.prepare('SELECT id,kind FROM arena_stations WHERE id=?').bind(station).first<{id:string;kind:string}>();if(!st||st.kind!=='arena')fail(404,'Stationens PIN hanteras inte här.');
 const h=await passwordHash(next),now=new Date().toISOString();
 await db.batch([
 db.prepare('INSERT INTO arena_admin_pins(station_id,pin_hash,pin_salt,pin_iterations,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(station_id) DO UPDATE SET pin_hash=excluded.pin_hash,pin_salt=excluded.pin_salt,pin_iterations=excluded.pin_iterations,version=version+1,updated_at=excluded.updated_at').bind(station,h.hash,h.salt,h.iterations,now),
 db.prepare('UPDATE arena_admin_elevations SET revoked_at=? WHERE station_id=? AND revoked_at IS NULL').bind(now,station),
 db.prepare('DELETE FROM arena_admin_pin_attempts WHERE station_id=?').bind(station),
 auditStatement(db,a,'admin.pin.reset','station',station,null,null,station)]);
 return json({ok:true});
}
export async function arenaAdminPinApi(r:Request,env:Env):Promise<Response|null>{
 const path=new URL(r.url).pathname;if(!path.startsWith(BASE+'/'))return null;
 if(new URL(r.url).search)fail(400,'Adminåtkomst tar inte emot filter.');
 const i=await resolveArenaStation(r,env),db=env.ARENA_DB!;
 if(i.kind!=='arena'||!i.session)return path===BASE+'/status'&&r.method==='GET'?json({mode:'legacy'}):fail(400,'Använd stationens befintliga administratörsinloggning.');
 const key=i.key,now=new Date().toISOString(),a=actor(key);
 if(path===BASE+'/status'&&r.method==='GET')return json({mode:'pin',configured:!!await db.prepare('SELECT station_id FROM arena_admin_pins WHERE station_id=?').bind(key).first(),authorized:!!await elevation(r,env,i),idle_seconds:ADMIN_IDLE_MS/1000});
 if(path===BASE+'/logout'&&r.method==='POST'){
 const e=await elevation(r,env,i);if(e)await db.batch([db.prepare('UPDATE arena_admin_elevations SET revoked_at=? WHERE token_hash=?').bind(now,e.token_hash),auditStatement(db,a,'admin.session.revoked','station',key,null,null,key)]);
 return json({ok:true},200,{'Set-Cookie':cookie(r,'',0)});
 }
 if(path===BASE+'/unlock'&&r.method==='POST'){
 const d=await body(r);checkFields(d,['pin']);const {p,attempt}=await verify(db,key,pin(d.pin)),t=randomToken();
 await db.prepare('DELETE FROM arena_admin_elevations WHERE expires_at<=?').bind(now).run();
 const result=await db.prepare(`INSERT INTO arena_admin_elevations(token_hash,station_id,station_session_id,pin_version,created_at,last_active_at,expires_at)
 SELECT ?,p.station_id,s.id,p.version,?,?,? FROM arena_admin_pins p JOIN arena_station_sessions s ON s.station_id=p.station_id WHERE p.station_id=? AND p.version=? AND p.pin_hash=? AND s.id=? AND s.revoked_at IS NULL AND s.expires_at>?`)
 .bind(await tokenHash(t),now,now,new Date(Date.now()+AGE*1000).toISOString(),key,p.version,p.pin_hash,i.session.session_id,now).run();
 if(!result.meta.changes)fail(401,'Åtkomsten ändrades. Ange PIN igen.');
 await db.prepare('DELETE FROM arena_admin_pin_attempts WHERE station_id=? AND attempts=?').bind(key,attempt).run();
 await audit(db,a,'admin.session.created','station',key,null,null,key);return json({ok:true},200,{'Set-Cookie':cookie(r,t)});
 }
 const e=await elevation(r,env,i);if(!e)fail(401,'Ange stationens admin-PIN för att fortsätta.');
 if(path===BASE+'/touch'&&r.method==='POST'){
 await db.prepare('UPDATE arena_admin_elevations SET last_active_at=? WHERE token_hash=? AND revoked_at IS NULL AND last_active_at>? AND expires_at>?').bind(now,e!.token_hash,new Date(Date.now()-ADMIN_IDLE_MS).toISOString(),now).run();return json({ok:true});
 }
 if(path===BASE+'/change'&&r.method==='POST'){
 const d=await body(r);checkFields(d,['current_pin','new_pin','confirm_pin']);const next=pin(d.new_pin);if(next!==pin(d.confirm_pin))fail(400,'PIN-koderna stämmer inte överens.');const {p}=await verify(db,key,pin(d.current_pin)),h=await passwordHash(next);
 const results=await db.batch([
 db.prepare('UPDATE arena_admin_pins SET pin_hash=?,pin_salt=?,pin_iterations=?,version=version+1,updated_at=? WHERE station_id=? AND version=? AND pin_hash=? AND EXISTS(SELECT 1 FROM arena_admin_elevations e JOIN arena_station_sessions s ON s.id=e.station_session_id WHERE e.token_hash=? AND e.revoked_at IS NULL AND s.revoked_at IS NULL AND e.expires_at>? AND s.expires_at>? AND e.last_active_at>?)').bind(h.hash,h.salt,h.iterations,now,key,p.version,p.pin_hash,e!.token_hash,now,now,new Date(Date.now()-ADMIN_IDLE_MS).toISOString()),
 db.prepare('UPDATE arena_admin_elevations SET revoked_at=? WHERE station_id=? AND revoked_at IS NULL AND pin_version<> (SELECT version FROM arena_admin_pins WHERE station_id=?)').bind(now,key,key)]);
 if(!results[0].meta.changes)fail(409,'PIN ändrades samtidigt. Logga in igen.');await audit(db,a,'admin.pin.changed','station',key,null,null,key);return json({ok:true},200,{'Set-Cookie':cookie(r,'',0)});
 }
 return fail(404,'Adminfunktionen finns inte.');
}
