import type {Env} from './index';
import {constantEqual,PASSWORD_ITERATIONS,passwordHash,passwordMatches,randomToken,tokenHash} from '../shared/arena-crypto';
import {body,checkFields,fail,json,text} from './http';
import {audit,auditStatement,type ArenaActor} from './arena-audit';

const COOKIE='arena_superadmin_session',AGE=4*3600;
export const securityCookieValue=(r:Request,name=COOKIE)=>r.headers.get('Cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))?.[1];
export const securityCookie=(r:Request,token:string,age=AGE)=>`${COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(r.url).protocol==='https:'?'; Secure':''}`;
export const localAuth=(r:Request,env:Env)=>['localhost','127.0.0.1','[::1]'].includes(new URL(r.url).hostname)||(env.ARENA_AUTH_DEV==='1'&&new URL(r.url).hostname.endsWith('.test'));
export function securityEmail(value:unknown){const email=text(value,'Mejladress',254).normalize('NFC').toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Ange en giltig mejladress.');return email;}
export function securityPassword(value:unknown){if(typeof value!=='string'||value.length<12||value.length>256)fail(400,'Lösenordet ska vara 12–256 tecken.');return value as string;}
export async function securityLimit(db:D1Database,r:Request,realm:string,limit=10,seconds=900,identity=''){
  const now=Math.floor(Date.now()/1000),start=now-now%seconds;
  const key=`security:${realm}:${await tokenHash(identity||r.headers.get('CF-Connecting-IP')||'local')}`;
  const row=await db.prepare(`INSERT INTO arena_auth_limits(bucket_key,window_start,attempts) VALUES(?,?,1) ON CONFLICT(bucket_key) DO UPDATE SET attempts=CASE WHEN window_start=excluded.window_start THEN attempts+1 ELSE 1 END,window_start=excluded.window_start RETURNING attempts`).bind(key,start).first<{attempts:number}>();
  if((row?.attempts??limit+1)>limit)fail(429,'För många försök. Försök igen senare.');
}
export type SuperAccount=ArenaActor & {role:'owner'|'superadmin';status:string;password_hash:string|null;password_salt:string|null;password_iterations:number|null;auth_epoch:number};
export async function superActor(request:Request,env:Env):Promise<ArenaActor>{
  const token=securityCookieValue(request);if(!token||!/^[a-f0-9]{64}$/.test(token))fail(401,'Logga in som Superadmin.');
  const db=env.ARENA_DB!,hash=await tokenHash(token!);
  const row=await db.prepare(`SELECT t.account_id,t.reauthenticated_at,a.id,a.display_name,a.email_normalized,a.role,a.status,a.email_verified_at,a.auth_epoch,t.auth_epoch session_epoch FROM arena_superadmin_sessions t LEFT JOIN arena_superadmins a ON a.id=t.account_id WHERE t.token_hash=? AND t.revoked_at IS NULL AND t.expires_at>?`).bind(hash,new Date().toISOString()).first<SuperAccount & {account_id:string|null;session_epoch:number}>();
  if(!row)fail(401,'Superadmin-sessionen har avslutats.');
  if(!row!.account_id){
    if(!localAuth(request,env)||!env.ARENA_SUPERADMIN_SECRET||await db.prepare("SELECT id FROM arena_superadmins WHERE role='owner'").first())fail(401,'Individuellt Superadmin-konto krävs.');
    return {id:'local-legacy',display_name:'Lokal testadministratör',role:'owner',session_hash:hash,reauthenticated_at:row!.reauthenticated_at};
  }
  if(row!.status!=='active'||row!.auth_epoch!==row!.session_epoch)fail(401,'Kontot eller sessionen har avslutats.');
  const verificationOnly=['/api/arena/auth/superadmin/session','/api/arena/auth/superadmin/logout','/api/arena/auth/verification/request'].includes(new URL(request.url).pathname);
  if(!row!.email_verified_at&&!localAuth(request,env)&&!verificationOnly)fail(403,'Verifiera kontots recovery-mejl först.');
  return {id:row!.id,display_name:row!.display_name,email_normalized:row!.email_normalized,role:row!.role,session_hash:hash,reauthenticated_at:row!.reauthenticated_at,email_verified_at:row!.email_verified_at};
}
export function ownerOnly(actor:ArenaActor){if(actor.role!=='owner')fail(403,'Endast Owner får hantera denna funktion.');}
export function recentAuth(actor:ArenaActor){if(!actor.reauthenticated_at||Date.now()-Date.parse(actor.reauthenticated_at)>5*60000)fail(403,'Bekräfta ditt lösenord igen före denna säkerhetsändring.');}
async function issue(request:Request,db:D1Database,account:SuperAccount){
  const token=randomToken(),now=new Date().toISOString();
  await db.batch([db.prepare('INSERT INTO arena_superadmin_sessions(token_hash,created_at,expires_at,account_id,auth_epoch,reauthenticated_at) VALUES(?,?,?,?,?,?)').bind(await tokenHash(token),now,new Date(Date.now()+AGE*1000).toISOString(),account.id,account.auth_epoch,now),db.prepare('UPDATE arena_superadmins SET last_login_at=? WHERE id=?').bind(now,account.id)]);
  return securityCookie(request,token);
}
export type ArenaMail={to:string;purpose:string;url:string};
export interface ArenaMailProvider{send(message:ArenaMail):Promise<void>}
// Production requires an explicit service binding. No raw tokens are returned by HTTP APIs.
async function deliver(request:Request,env:Env,mail:ArenaMail){
  if(localAuth(request,env)){
    await env.ARENA_DB!.prepare('INSERT INTO arena_dev_outbox(id,recipient,purpose,payload_json,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),mail.to,mail.purpose,JSON.stringify(mail),new Date().toISOString()).run();return;
  }
  if(!env.ARENA_MAILER)fail(503,'Mejlleverans är inte konfigurerad. Kontakta administratören.');
  const response=await env.ARENA_MAILER!.fetch('https://arena-mailer.internal/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(mail)});
  if(!response.ok)fail(503,'Mejlleveransen är tillfälligt otillgänglig.');
}
async function createToken(request:Request,env:Env,realm:string,id:string,email:string,purpose:'reset'|'verify'|'invite'){
  const token=randomToken(),now=new Date().toISOString(),db=env.ARENA_DB!;
  await db.batch([
    db.prepare('UPDATE arena_security_tokens SET used_at=? WHERE account_id=? AND realm=? AND purpose=? AND used_at IS NULL').bind(now,id,realm,purpose),
    db.prepare('INSERT INTO arena_security_tokens(id,token_hash,realm,account_id,purpose,email_normalized,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),await tokenHash(token),realm,id,purpose,email,now,new Date(Date.now()+(purpose==='invite'?86400000:1800000)).toISOString()),
  ]);
  const target=new URL('/arena/recovery',request.url);target.hash=new URLSearchParams({token,realm,purpose}).toString();
  await deliver(request,env,{to:email,purpose,url:target.toString()});
}
export async function securityAuthApi(request:Request,env:Env):Promise<Response|null>{
  const db=env.ARENA_DB!,url=new URL(request.url),p=url.pathname,m=request.method,now=new Date().toISOString();
  if(p==='/api/arena/auth/superadmin/session'&&m==='GET'){
    if(!securityCookieValue(request))return json({authenticated:false});const actor=await superActor(request,env);const {session_hash,...publicActor}=actor;return json({authenticated:true,actor:publicActor});
  }
  if(p==='/api/arena/auth/superadmin/login'&&m==='POST'){
    await securityLimit(db,request,'login-ip');const data=await body(request);
    if(data.secret!==undefined){
      if(!env.ARENA_SUPERADMIN_SECRET||env.ARENA_SUPERADMIN_SECRET.length<32)fail(503,'Superadmin är inte konfigurerad.');
      if(!localAuth(request,env)||await db.prepare("SELECT id FROM arena_superadmins WHERE role='owner'").first())fail(401,'Använd ett individuellt Superadmin-konto.');
      checkFields(data,['secret']);if(!constantEqual(await tokenHash(text(data.secret,'Lokal testnyckel',256)),await tokenHash(env.ARENA_SUPERADMIN_SECRET!)))fail(401,'Fel inloggning.');
      const token=randomToken();await db.prepare('INSERT INTO arena_superadmin_sessions(token_hash,created_at,expires_at,reauthenticated_at) VALUES(?,?,?,?)').bind(await tokenHash(token),now,new Date(Date.now()+AGE*1000).toISOString(),now).run();
      return json({ok:true},200,{'Set-Cookie':securityCookie(request,token)});
    }
    checkFields(data,['email','password']);const email=securityEmail(data.email),password=securityPassword(data.password);
    await securityLimit(db,request,'login-account',8,900,email);
    const a=await db.prepare('SELECT * FROM arena_superadmins WHERE email_normalized=?').bind(email).first<SuperAccount>();
    const valid=a?.password_hash&&a.password_salt&&a.password_iterations ? await passwordMatches(password,a.password_hash,a.password_salt,a.password_iterations):(await passwordHash(password),false);
    if(!valid||a!.status!=='active')fail(401,'Fel mejladress eller lösenord.');
    if(!a!.password_hash!.startsWith('pbkdf2-sha256$') || a!.password_iterations!<PASSWORD_ITERATIONS){const h=await passwordHash(password);await db.prepare('UPDATE arena_superadmins SET password_hash=?,password_salt=?,password_iterations=? WHERE id=? AND password_hash=?').bind(h.hash,h.salt,h.iterations,a!.id,a!.password_hash).run();}
    await audit(db,a!,'login.success','superadmin',a!.id);
    return json({ok:true},200,{'Set-Cookie':await issue(request,db,a!)});
  }
  if(p==='/api/arena/auth/superadmin/logout'&&m==='POST'){
    const a=await superActor(request,env);await db.prepare('UPDATE arena_superadmin_sessions SET revoked_at=? WHERE token_hash=?').bind(now,a.session_hash!).run();return json({ok:true},200,{'Set-Cookie':securityCookie(request,'',0)});
  }
  if(p==='/api/arena/auth/superadmin/reauth'&&m==='POST'){
    const a=await superActor(request,env);await securityLimit(db,request,'reauth',5,900,a.id);const data=await body(request);checkFields(data,['password']);
    const account=await db.prepare('SELECT * FROM arena_superadmins WHERE id=?').bind(a.id).first<SuperAccount>();
    if(!account?.password_hash||!await passwordMatches(securityPassword(data.password),account.password_hash,account.password_salt!,account.password_iterations!))fail(401,'Lösenordet stämmer inte.');
    await db.prepare('UPDATE arena_superadmin_sessions SET reauthenticated_at=? WHERE token_hash=?').bind(now,a.session_hash!).run();return json({ok:true});
  }
  if(p==='/api/arena/auth/forgot'&&m==='POST'){
    await securityLimit(db,request,'forgot-ip',5,900);const data=await body(request);checkFields(data,['email','realm']);const email=securityEmail(data.email),realm=data.realm==='superadmin'?'superadmin':data.realm==='station'?'station':fail(400,'Välj kontotyp.');
    await securityLimit(db,request,'forgot-email',3,3600,email);
    // Uniform response for existing, unverified and absent accounts, including missing provider.
    const a=realm==='superadmin'?await db.prepare("SELECT id,email_verified_at FROM arena_superadmins WHERE email_normalized=? AND status='active'").bind(email).first<{id:string;email_verified_at:string|null}>():await db.prepare('SELECT station_id id,email_verified_at FROM arena_station_accounts WHERE email_normalized=?').bind(email).first<{id:string;email_verified_at:string|null}>();
    if(a?.email_verified_at){try{await createToken(request,env,realm,a.id,email,'reset');await audit(db,{id:a.id,display_name:email,role:realm==='station'?'station':'system'},'password.reset.requested',realm,a.id);}catch{console.warn('Arena password reset delivery deferred.');}}
    return json({ok:true,message:'Om ett verifierat konto finns skickas instruktioner.'});
  }
  if(p==='/api/arena/auth/reset'&&m==='POST'){
    await securityLimit(db,request,'reset-ip',10,900);const data=await body(request);checkFields(data,['token','password']);const token=text(data.token,'Engångslänk',128),h=await passwordHash(securityPassword(data.password));
    const row=await db.prepare("SELECT * FROM arena_security_tokens WHERE token_hash=? AND purpose IN ('reset','invite') AND used_at IS NULL AND expires_at>?").bind(await tokenHash(token),now).first<{id:string;realm:string;account_id:string;purpose:string;email_normalized:string}>();
    if(!row)fail(400,'Länken är ogiltig eller har gått ut.');
    const r=row!,isSuper=r.realm==='superadmin';
    // Every credential/session write is guarded by the live token, then consumed last in one transaction.
    const guard='EXISTS(SELECT 1 FROM arena_security_tokens WHERE id=? AND used_at IS NULL AND expires_at>?)';
    const result=await db.batch([
      isSuper?db.prepare(`UPDATE arena_superadmins SET password_hash=?,password_salt=?,password_iterations=?,status=CASE WHEN status='invited' THEN 'active' ELSE status END,email_verified_at=COALESCE(email_verified_at,?),auth_epoch=auth_epoch+1,updated_at=? WHERE id=? AND status<>'disabled' AND ${guard}`).bind(h.hash,h.salt,h.iterations,now,now,r.account_id,r.id,now):db.prepare(`UPDATE arena_station_accounts SET password_hash=?,password_salt=?,password_iterations=? WHERE station_id=? AND ${guard}`).bind(h.hash,h.salt,h.iterations,r.account_id,r.id,now),
      db.prepare(`UPDATE ${isSuper?'arena_superadmin_sessions':'arena_station_sessions'} SET revoked_at=? WHERE ${isSuper?'account_id':'station_id'}=? AND ${guard}`).bind(now,r.account_id,r.id,now),
      db.prepare('UPDATE arena_security_tokens SET used_at=? WHERE account_id=? AND realm=? AND used_at IS NULL AND id<>? AND '+guard).bind(now,r.account_id,r.realm,r.id,r.id,now),
      db.prepare('UPDATE arena_security_tokens SET used_at=? WHERE id=? AND used_at IS NULL AND expires_at>?').bind(now,r.id,now),
    ]);
    if(!result[0].meta.changes)fail(400,'Länken är redan använd eller kontot är inaktiverat.');
    await audit(db,{id:r.account_id,display_name:r.email_normalized,role:isSuper?'system':'station'},'password.reset.completed',r.realm,r.account_id);
    return json({ok:true});
  }
  if(p==='/api/arena/auth/verify'&&m==='POST'){
    await securityLimit(db,request,'verify',10);const d=await body(request);checkFields(d,['token']);
    const r=await db.prepare("SELECT * FROM arena_security_tokens WHERE token_hash=? AND purpose='verify' AND used_at IS NULL AND expires_at>?").bind(await tokenHash(text(d.token,'Engångslänk',128)),now).first<{id:string;realm:string;account_id:string;email_normalized:string}>();if(!r)fail(400,'Verifieringslänken är ogiltig.');
    const results=await db.batch([
      db.prepare(`UPDATE ${r!.realm==='station'?'arena_station_accounts':'arena_superadmins'} SET email_verified_at=? WHERE ${r!.realm==='station'?'station_id':'id'}=? AND email_normalized=? AND EXISTS(SELECT 1 FROM arena_security_tokens WHERE id=? AND used_at IS NULL AND expires_at>?)`).bind(now,r!.account_id,r!.email_normalized,r!.id,now),
      db.prepare('UPDATE arena_security_tokens SET used_at=? WHERE id=? AND used_at IS NULL AND expires_at>?').bind(now,r!.id,now),
    ]);if(!results[0].meta.changes)fail(400,'Länken kan inte användas.');return json({ok:true});
  }
  if(p==='/api/arena/auth/verification/request'&&m==='POST'){
    await securityLimit(db,request,'verification-request',3,3600);const d=await body(request);checkFields(d,['realm']);
    if(d.realm==='superadmin'){const a=await superActor(request,env);await createToken(request,env,'superadmin',a.id,a.email_normalized!,'verify');}
    else if(d.realm==='station'){
      const token=securityCookieValue(request,'arena_station_session');if(!token)fail(401,'Logga in på stationen.');
      const a=await db.prepare('SELECT a.station_id,a.email_normalized FROM arena_station_sessions s JOIN arena_station_accounts a ON a.station_id=s.station_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?').bind(await tokenHash(token!),now).first<{station_id:string;email_normalized:string}>();if(!a)fail(401,'Logga in igen.');await createToken(request,env,'station',a!.station_id,a!.email_normalized,'verify');
    }else fail(400,'Välj kontotyp.');return json({ok:true});
  }
  if(p==='/api/arena/auth/recovery-code'&&m==='POST'){
    await securityLimit(db,request,'recovery-code-ip',5,3600);const d=await body(request);checkFields(d,['email','code','password']);const email=securityEmail(d.email);await securityLimit(db,request,'recovery-account',5,3600,email);
    const h=await passwordHash(securityPassword(d.password));
    const r=await db.prepare("SELECT c.id,a.id account_id,a.display_name FROM arena_recovery_codes c JOIN arena_superadmins a ON a.id=c.account_id WHERE a.email_normalized=? AND a.role='owner' AND a.status='active' AND c.code_hash=? AND c.used_at IS NULL").bind(email,await tokenHash(text(d.code,'Recovery-kod',128).toUpperCase().replaceAll('-',''))).first<{id:string;account_id:string;display_name:string}>();
    if(!r)fail(400,'Koden kan inte användas.');
    const result=await db.batch([
      db.prepare('UPDATE arena_superadmins SET password_hash=?,password_salt=?,password_iterations=?,auth_epoch=auth_epoch+1,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM arena_recovery_codes WHERE id=? AND used_at IS NULL)').bind(h.hash,h.salt,h.iterations,now,r!.account_id,r!.id),
      db.prepare('UPDATE arena_superadmin_sessions SET revoked_at=? WHERE account_id=? AND EXISTS(SELECT 1 FROM arena_recovery_codes WHERE id=? AND used_at IS NULL)').bind(now,r!.account_id,r!.id),
      db.prepare('UPDATE arena_recovery_codes SET used_at=? WHERE id=? AND used_at IS NULL').bind(now,r!.id),
    ]);if(!result[0].meta.changes)fail(400,'Koden är redan använd.');
    await audit(db,{id:r!.account_id,display_name:r!.display_name,role:'owner'},'owner.recovered','superadmin',r!.account_id);
    return json({ok:true});
  }
  return null;
}
export async function securityAdminApi(request:Request,env:Env,actor:ArenaActor):Promise<Response|null>{
  const db=env.ARENA_DB!,p=new URL(request.url).pathname,m=request.method,now=new Date().toISOString();
  if(p==='/api/arena/superadmin/accounts'&&m==='GET'){
    ownerOnly(actor);const rows=await db.prepare('SELECT id,email_normalized,display_name,role,status,email_verified_at,last_login_at,created_at FROM arena_superadmins ORDER BY role,display_name').all();return json({accounts:rows.results});
  }
  if(p==='/api/arena/superadmin/accounts'&&m==='POST'){
    ownerOnly(actor);recentAuth(actor);const d=await body(request);checkFields(d,['email','display_name','confirm']);if(d.confirm!=='INVITE')fail(400,'Bekräfta inbjudan.');
    const email=securityEmail(d.email),name=text(d.display_name,'Namn'),id=crypto.randomUUID();
    if(await db.prepare('SELECT id FROM arena_superadmins WHERE email_normalized=?').bind(email).first())fail(409,'Kontot finns redan.');
    // Check delivery configuration before persisting the invitation.
    if(!localAuth(request,env)&&!env.ARENA_MAILER)fail(503,'Konfigurera mejlprovider först.');
    await db.batch([db.prepare("INSERT INTO arena_superadmins(id,email_normalized,display_name,role,status,created_at,updated_at) VALUES(?,?,?,'superadmin','invited',?,?)").bind(id,email,name,now,now),auditStatement(db,actor,'superadmin.invited','superadmin',id,null,{email,display_name:name,role:'superadmin'})]);
    await createToken(request,env,'superadmin',id,email,'invite');return json({id},201);
  }
  const account=p.match(/^\/api\/arena\/superadmin\/accounts\/([a-zA-Z0-9-]{1,120})(?:\/(revoke|reinvite))?$/);
  if(account&&['PATCH','POST'].includes(m)){
    ownerOnly(actor);recentAuth(actor);const target=await db.prepare('SELECT id,display_name,email_normalized,role,status FROM arena_superadmins WHERE id=?').bind(account[1]).first<{id:string;display_name:string;email_normalized:string;role:string;status:string}>();if(!target)fail(404,'Kontot finns inte.');
    if(target!.role==='owner')fail(403,'Owner skyddas. Använd separat ownership-process.');
    const d=await body(request);checkFields(d,['status','role','confirm']);if(d.confirm!=='CONFIRM')fail(400,'Bekräfta säkerhetsändringen.');
    if(account[2]==='reinvite'){await createToken(request,env,'superadmin',target!.id,target!.email_normalized,'invite');await audit(db,actor,'superadmin.reinvited','superadmin',target!.id);return json({ok:true});}
    if(d.role!==undefined&&d.role!=='superadmin')fail(403,'Ownership kan inte ändras här.');
    const status=d.status===undefined?target!.status:String(d.status);if(!['active','disabled'].includes(status))fail(400,'Ogiltig kontostatus.');
    if(status==='active'&&target!.status==='invited')fail(409,'Kontot måste aktiveras via inbjudan.');
    await db.batch([
      db.prepare('UPDATE arena_superadmins SET status=?,auth_epoch=auth_epoch+1,updated_at=? WHERE id=? AND role<>\'owner\'').bind(status,now,target!.id),
      db.prepare('UPDATE arena_superadmin_sessions SET revoked_at=? WHERE account_id=?').bind(now,target!.id),
      db.prepare('UPDATE arena_security_tokens SET used_at=? WHERE account_id=? AND realm=\'superadmin\' AND used_at IS NULL').bind(now,target!.id),
      auditStatement(db,actor,account[2]==='revoke'?'sessions.revoked':status==='disabled'?'superadmin.disabled':'superadmin.enabled','superadmin',target!.id,target,{status,role:'superadmin'}),
    ]);return json({ok:true});
  }
  if(p==='/api/arena/superadmin/security'&&m==='GET'){
    const [sessions,codes]=await Promise.all([db.prepare('SELECT token_hash,created_at,expires_at FROM arena_superadmin_sessions WHERE account_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC').bind(actor.id,now).all<{token_hash:string;created_at:string;expires_at:string}>(),db.prepare('SELECT COUNT(*) count FROM arena_recovery_codes WHERE account_id=? AND used_at IS NULL').bind(actor.id).first<{count:number}>()]);
    return json({actor:{id:actor.id,role:actor.role,email_verified_at:actor.email_verified_at},codes_remaining:codes?.count??0,sessions:await Promise.all(sessions.results.map(async s=>({id:await tokenHash(s.token_hash),current:s.token_hash===actor.session_hash,created_at:s.created_at,expires_at:s.expires_at})))});
  }
  if(p==='/api/arena/superadmin/security/sessions'&&m==='POST'){
    recentAuth(actor);const d=await body(request);checkFields(d,['id','others','confirm']);if(d.confirm!=='REVOKE')fail(400,'Bekräfta sessionernas avslut.');
    const rows=await db.prepare('SELECT token_hash FROM arena_superadmin_sessions WHERE account_id=? AND revoked_at IS NULL').bind(actor.id).all<{token_hash:string}>();
    const selected=[];for(const s of rows.results)if(d.others===true?s.token_hash!==actor.session_hash:await tokenHash(s.token_hash)===d.id)selected.push(s.token_hash);
    if(!selected.length)return json({ok:true});await db.batch([...selected.map(hash=>db.prepare('UPDATE arena_superadmin_sessions SET revoked_at=? WHERE token_hash=? AND account_id=?').bind(now,hash,actor.id)),auditStatement(db,actor,'sessions.revoked','superadmin',actor.id,null,{count:selected.length})]);return json({ok:true});
  }
  if(p==='/api/arena/superadmin/security/recovery-codes'&&m==='POST'){
    ownerOnly(actor);recentAuth(actor);const d=await body(request);checkFields(d,['confirm']);if(d.confirm!=='REGENERATE')fail(400,'Bekräfta nya recovery-koder.');
    const codes=Array.from({length:10},()=>randomToken().slice(0,32).toUpperCase()),statements=[db.prepare('DELETE FROM arena_recovery_codes WHERE account_id=?').bind(actor.id)];
    for(const code of codes)statements.push(db.prepare('INSERT INTO arena_recovery_codes(id,account_id,code_hash,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),actor.id,await tokenHash(code),now));
    await db.batch([...statements,auditStatement(db,actor,'recovery.regenerated','superadmin',actor.id,null,{count:10})]);
    return json({codes:codes.map(c=>c.match(/.{4}/g)!.join('-'))},200,{'Cache-Control':'no-store'});
  }
  if(p==='/api/arena/superadmin/security/transfer'&&m==='POST'){
    ownerOnly(actor);recentAuth(actor);const d=await body(request);checkFields(d,['target_id','confirm']);if(d.confirm!=='TRANSFER OWNERSHIP')fail(400,'Bekräfta överföring av ownership.');
    const target=await db.prepare("SELECT id,display_name FROM arena_superadmins WHERE id=? AND role='superadmin' AND status='active' AND email_verified_at IS NOT NULL").bind(text(d.target_id,'Ny Owner',120)).first<{id:string;display_name:string}>();if(!target)fail(400,'Välj ett aktivt verifierat Superadmin-konto.');
    await db.batch([
      db.prepare("UPDATE arena_superadmins SET role='superadmin',auth_epoch=auth_epoch+1,updated_at=? WHERE id=? AND role='owner'").bind(now,actor.id),
      db.prepare("UPDATE arena_superadmins SET role='owner',auth_epoch=auth_epoch+1,updated_at=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM arena_superadmins WHERE role='owner')").bind(now,target!.id),
      db.prepare('UPDATE arena_superadmin_sessions SET revoked_at=? WHERE account_id IN (?,?)').bind(now,actor.id,target!.id),
      db.prepare('DELETE FROM arena_recovery_codes WHERE account_id IN (?,?)').bind(actor.id,target!.id),
      auditStatement(db,actor,'owner.transferred','superadmin',target!.id,{owner:actor.id},{owner:target!.id}),
    ]);return json({ok:true},200,{'Set-Cookie':securityCookie(request,'',0)});
  }
  return null;
}
