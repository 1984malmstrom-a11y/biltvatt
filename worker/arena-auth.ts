import type { Env } from "./index";
import type { ArenaStation } from "../shared/arena-network";
import { constantEqual, passwordHash, passwordMatches, randomToken, tokenHash } from "../shared/arena-crypto";
import { body, checkFields, fail, json, text } from "./http";
import { stationId } from "./station-config";

const STATION_COOKIE="arena_station_session",SUPER_COOKIE="arena_superadmin_session";
const STATION_AGE=365*86400,SUPER_AGE=12*3600;
const renewedCookies=new WeakMap<Request,string>();
export const renewedArenaCookie=(request:Request)=>renewedCookies.get(request);
const cookieValue=(r:Request,name:string)=>r.headers.get("Cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))?.[1];
export const hasArenaStationCookie=(r:Request)=>cookieValue(r,STATION_COOKIE)!==undefined;
const cookie=(r:Request,name:string,token:string,age:number)=>`${name}=${token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(r.url).protocol==="https:" ? "; Secure" : ""}`;
const dbFor=(env:Env)=>env.ARENA_DB ?? fail(503,"Arena-databasen är inte konfigurerad.");
const normalizedEmail=(value:unknown)=>{
  const email=text(value,"Stationsmejl",254).normalize("NFC").toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,"Ange en giltig mejladress.");return email;
};
const password=(value:unknown)=>{
  if(typeof value!=="string" || value.length<12 || value.length>256) fail(400,"Lösenordet ska vara 12–256 tecken.");return value as string;
};
async function rateLimit(db:D1Database,request:Request,realm:string,limit:number,seconds:number,identity="") {
  const now=Math.floor(Date.now()/1000),start=now-now%seconds;
  const ip=await tokenHash(request.headers.get("CF-Connecting-IP")??"local");
  const bucket=`${realm}:${identity || ip}`;
  const row=await db.prepare(`INSERT INTO arena_auth_limits(bucket_key,window_start,attempts) VALUES(?,?,1)
    ON CONFLICT(bucket_key) DO UPDATE SET attempts=CASE WHEN window_start=excluded.window_start THEN attempts+1 ELSE 1 END,window_start=excluded.window_start RETURNING attempts`)
    .bind(bucket,start).first<{attempts:number}>();
  if((row?.attempts??limit+1)>limit) fail(429,"För många försök. Försök igen senare.");
}
type SessionRow=ArenaStation & {session_id:string;expires_at:string};
async function stationSession(request:Request,env:Env):Promise<SessionRow | null> {
  const token=cookieValue(request,STATION_COOKIE);if(token===undefined)return null;
  if(!/^[a-f0-9]{64}$/.test(token)) fail(401,"Logga in på stationen igen.");
  const row=await dbFor(env).prepare(`SELECT s.id,s.name,s.email,s.status,s.kind,t.id session_id,t.expires_at
    FROM arena_station_sessions t JOIN arena_stations s ON s.id=t.station_id
    WHERE t.token_hash=? AND t.revoked_at IS NULL AND t.expires_at>?`).bind(await tokenHash(token),new Date().toISOString()).first<SessionRow>();
  if(!row) fail(401,"Stationens session har avslutats. Logga in igen.");return row;
}
export async function resolveArenaStation(request:Request,env:Env) {
  const db=dbFor(env),session=await stationSession(request,env);
  let station:ArenaStation | null=session;
  const serverKey=stationId(env);
  if(!session) {
    if(env.ARENA_ONLY==="1") fail(401,"Logga in eller anslut din station till Arenan.");
    station=await db.prepare("SELECT id,name,email,status,kind FROM arena_stations WHERE id=?").bind(serverKey).first<ArenaStation>();
    if(station?.kind==="arena") fail(401,"Logga in på stationen.");
  }
  if(station && station.status!=="active") fail(403,station.status==="pending" ? "Stationen väntar på godkännande." : "Stationen är pausad. Kontakta administratören.");
  if(session && Date.parse(session.expires_at)-Date.now()<30*86400000) {
    await db.prepare("UPDATE arena_station_sessions SET expires_at=? WHERE id=? AND revoked_at IS NULL").bind(new Date(Date.now()+STATION_AGE*1000).toISOString(),session.session_id).run();
    renewedCookies.set(request,cookie(request,STATION_COOKIE,cookieValue(request,STATION_COOKIE)!,STATION_AGE));
  }
  const key=station?.id??serverKey,kind=station?.kind??"integrated";
  const source=key===serverKey ? env.DB : key==="tingsryd" ? env.STATION_DB_TINGSRYD : key==="karlshamn" ? env.STATION_DB_KARLSHAMN : key==="karlskrona" ? env.STATION_DB_KARLSKRONA : undefined;
  return {key,kind,station,session,staffDB:kind==="integrated" ? source : undefined};
}
async function issueStationSession(request:Request,db:D1Database,station:string) {
  const token=randomToken(),now=new Date().toISOString();
  await db.prepare("INSERT INTO arena_station_sessions(id,token_hash,station_id,created_at,expires_at) VALUES(?,?,?,?,?)")
    .bind(crypto.randomUUID(),await tokenHash(token),station,now,new Date(Date.now()+STATION_AGE*1000).toISOString()).run();
  return cookie(request,STATION_COOKIE,token,STATION_AGE);
}
export async function requireArenaSuperadmin(request:Request,env:Env) {
  const token=cookieValue(request,SUPER_COOKIE);
  if(!token || !/^[a-f0-9]{64}$/.test(token)) fail(401,"Logga in som Superadmin.");
  if(!env.ARENA_SUPERADMIN_SECRET || env.ARENA_SUPERADMIN_SECRET.length<32) fail(503,"Superadmin är inte konfigurerad.");
  const row=await dbFor(env).prepare("SELECT token_hash FROM arena_superadmin_sessions WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?")
    .bind(await tokenHash(token!),new Date().toISOString()).first();if(!row) fail(401,"Superadmin-sessionen har avslutats.");
}
export async function arenaAuthApi(request:Request,env:Env):Promise<Response> {
  const db=dbFor(env),url=new URL(request.url),path=url.pathname,method=request.method;
  if(url.searchParams.size)fail(400,"Kontofunktionen tar inte emot filter.");
  if(path==="/api/arena/auth/session" && method==="GET") {
    const session=await stationSession(request,env);
    if(!session) return json({authenticated:false,integrated:env.ARENA_ONLY!=="1"});
    const {session_id,expires_at,...station}=session;
    const sessions=await db.prepare("SELECT id,created_at,expires_at FROM arena_station_sessions WHERE station_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC")
      .bind(station.id,new Date().toISOString()).all();
    // Renew only near expiry; no request-by-request writes or daily logouts.
    const headers:Record<string,string>={};
    if(Date.parse(expires_at)-Date.now()<30*86400000) {
      await db.prepare("UPDATE arena_station_sessions SET expires_at=? WHERE id=? AND revoked_at IS NULL").bind(new Date(Date.now()+STATION_AGE*1000).toISOString(),session_id).run();
      headers["Set-Cookie"]=cookie(request,STATION_COOKIE,cookieValue(request,STATION_COOKIE)!,STATION_AGE);
    }
    return json({authenticated:true,station,session_id,sessions:sessions.results},200,headers);
  }
  if(path==="/api/arena/auth/signup" && method==="POST") {
    await rateLimit(db,request,"signup",5,3600);
    const data=await body(request);checkFields(data,["name","email","password"]);
    const name=text(data.name,"Stationsnamn"),email=normalizedEmail(data.email),credential=await passwordHash(password(data.password));
    if(await db.prepare("SELECT station_id FROM arena_station_accounts WHERE email_normalized=?").bind(email).first()) fail(409,"Ett stationskonto med den mejladressen finns redan.");
    const id=crypto.randomUUID(),now=new Date().toISOString();
    try { await db.batch([
      db.prepare("INSERT INTO arena_stations(id,station_key,name,email,status,kind,created_at,updated_at) VALUES(?,?,?,?,'pending','arena',?,?)").bind(id,`arena-${id}`,name,email,now,now),
      db.prepare("INSERT INTO arena_station_accounts(station_id,email_normalized,password_hash,password_salt,password_iterations,created_at) VALUES(?,?,?,?,?,?)").bind(id,email,credential.hash,credential.salt,credential.iterations,now),
    ]); } catch(error) { if(await db.prepare("SELECT station_id FROM arena_station_accounts WHERE email_normalized=?").bind(email).first())fail(409,"Ett stationskonto med den mejladressen finns redan.");throw error; }
    return json({station:{id,name,email,status:"pending",kind:"arena"}},201,{"Set-Cookie":await issueStationSession(request,db,id)});
  }
  if(path==="/api/arena/auth/login" && method==="POST") {
    await rateLimit(db,request,"login-ip",20,900);
    const data=await body(request);checkFields(data,["email","password"]);const email=normalizedEmail(data.email),pass=password(data.password);
    await rateLimit(db,request,"login-account",10,900,await tokenHash(email));
    const account=await db.prepare(`SELECT a.station_id,a.password_hash,a.password_salt,a.password_iterations,s.status FROM arena_station_accounts a JOIN arena_stations s ON s.id=a.station_id WHERE a.email_normalized=?`)
      .bind(email).first<{station_id:string;password_hash:string;password_salt:string;password_iterations:number;status:string}>();
    const valid=account ? await passwordMatches(pass,account.password_hash,account.password_salt,account.password_iterations) : (await passwordHash(pass),false);
    if(!valid) fail(401,"Fel mejladress eller lösenord.");if(account!.status==="suspended") fail(403,"Stationen är pausad.");
    return json({ok:true},200,{"Set-Cookie":await issueStationSession(request,db,account!.station_id)});
  }
  if((path==="/api/arena/auth/logout" || path==="/api/arena/auth/revoke") && method==="POST") {
    const session=await stationSession(request,env);if(!session)fail(401,"Logga in på stationen.");
    let id=session!.session_id;
    if(path.endsWith("revoke")) {const data=await body(request);checkFields(data,["session_id"]);id=text(data.session_id,"Session",36);}
    const changed=await db.prepare("UPDATE arena_station_sessions SET revoked_at=? WHERE id=? AND station_id=? AND revoked_at IS NULL").bind(new Date().toISOString(),id,session!.id).run();
    if(!changed.meta.changes) fail(404,"Sessionen finns inte.");
    return json({ok:true},200,id===session!.session_id ? {"Set-Cookie":cookie(request,STATION_COOKIE,"",0)}:{});
  }
  if(path==="/api/arena/auth/superadmin/session" && method==="GET") {
    if(!cookieValue(request,SUPER_COOKIE))return json({authenticated:false});await requireArenaSuperadmin(request,env);return json({authenticated:true});
  }
  if(path==="/api/arena/auth/superadmin/login" && method==="POST") {
    await rateLimit(db,request,"superadmin",10,900);
    if(!env.ARENA_SUPERADMIN_SECRET || env.ARENA_SUPERADMIN_SECRET.length<32)fail(503,"Superadmin är inte konfigurerad.");
    const data=await body(request);checkFields(data,["secret"]);const supplied=text(data.secret,"Superadmin-nyckel",256);
    if(!constantEqual(await tokenHash(supplied),await tokenHash(env.ARENA_SUPERADMIN_SECRET!)))fail(401,"Fel Superadmin-nyckel.");
    const token=randomToken(),now=new Date().toISOString();
    await db.prepare("INSERT INTO arena_superadmin_sessions(token_hash,created_at,expires_at) VALUES(?,?,?)").bind(await tokenHash(token),now,new Date(Date.now()+SUPER_AGE*1000).toISOString()).run();
    return json({ok:true},200,{"Set-Cookie":cookie(request,SUPER_COOKIE,token,SUPER_AGE)});
  }
  if(path==="/api/arena/auth/superadmin/logout" && method==="POST") {
    await requireArenaSuperadmin(request,env);await db.prepare("UPDATE arena_superadmin_sessions SET revoked_at=? WHERE token_hash=?").bind(new Date().toISOString(),await tokenHash(cookieValue(request,SUPER_COOKIE)!)).run();
    return json({ok:true},200,{"Set-Cookie":cookie(request,SUPER_COOKIE,"",0)});
  }
  return fail(404,"Kontofunktionen finns inte.");
}
