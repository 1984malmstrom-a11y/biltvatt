// Offline infrastructure tool. No HTTP endpoint, no static password, no remote execution.
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const mode=option('--mode'),environment=option('--environment'),confirmation=option('--confirm'),out=option('--output');
const allowed=new Set(['--mode','--environment','--confirm','--output','--persist-to','--emit-only']);
for(let i=0;i<args.length;i++){if(!allowed.has(args[i]))throw Error('Okänt argument.');if(args[i]!=='--emit-only')i++;}
if(!['bootstrap','recover'].includes(mode)||!environment||confirmation!==`ARENA ${environment} ${mode?.toUpperCase()}`||!out)throw Error('Kräver --mode bootstrap|recover --environment <namn> --confirm "ARENA <namn> BOOTSTRAP|RECOVER" --output <privat.sql>. Läs JSON via stdin.');
const emitOnly=args.includes('--emit-only');
if(environment!=='local-mastertest'&&!emitOnly)throw Error('Verktyget kan ENDAST köra lokalt. Andra miljöer kräver --emit-only och separat infra-review.');
const root=resolve(import.meta.dirname,'..'),config=JSON.parse(readFileSync(resolve(root,'wrangler.jsonc'),'utf8'));
if(!emitOnly&&config.vars.STATION_ID!=='mastertest')throw Error('Lokal mastertest-konfiguration krävs.');
const input=JSON.parse(readFileSync(0,'utf8')),email=String(input.email??'').trim().toLowerCase(),name=String(input.display_name??'').trim(),password=input.password;
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name||name.length>80||typeof password!=='string'||password.length<12||password.length>256)throw Error('Ogiltig Owner-input.');
const {passwordHash,randomToken}=await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(readFileSync(resolve(root,'shared/arena-crypto.ts'),'utf8'))).toString('base64')}`);
const h=await passwordHash(password),now=new Date().toISOString(),id=crypto.randomUUID(),quote=v=>`'${String(v).replaceAll("'","''")}'`,qemail=quote(email);
const guard=mode==='bootstrap'?`NOT EXISTS(SELECT 1 FROM arena_superadmins WHERE role='owner')`:`EXISTS(SELECT 1 FROM arena_superadmins WHERE email_normalized=${qemail} AND role='owner')`;
// A failing JSON expression aborts before writes if the environment/account guard fails.
// D1 disallows TEMP tables; CASE evaluates only its selected branch.
const statements=[`SELECT CASE WHEN ${guard} THEN 1 ELSE json_extract('ARENA_OWNER_GUARD_FAILED','$') END;`];
if(mode==='bootstrap')statements.push(`INSERT INTO arena_superadmins(id,email_normalized,display_name,role,status,password_hash,password_salt,password_iterations,email_verified_at,created_at,updated_at) VALUES(${quote(id)},${qemail},${quote(name)},'owner','active',${quote(h.hash)},${quote(h.salt)},${h.iterations},NULL,${quote(now)},${quote(now)});`);
else statements.push(`UPDATE arena_superadmins SET password_hash=${quote(h.hash)},password_salt=${quote(h.salt)},password_iterations=${h.iterations},status='active',auth_epoch=auth_epoch+1,updated_at=${quote(now)} WHERE email_normalized=${qemail} AND role='owner';`,`UPDATE arena_superadmin_sessions SET revoked_at=${quote(now)} WHERE account_id=(SELECT id FROM arena_superadmins WHERE role='owner' AND email_normalized=${qemail});`,`DELETE FROM arena_recovery_codes WHERE account_id=(SELECT id FROM arena_superadmins WHERE role='owner' AND email_normalized=${qemail});`,`UPDATE arena_security_tokens SET used_at=${quote(now)} WHERE realm='superadmin' AND account_id=(SELECT id FROM arena_superadmins WHERE role='owner' AND email_normalized=${qemail}) AND used_at IS NULL;`);
// Email stays unverified until an actual verification link is consumed.
statements.push(`INSERT INTO arena_audit_log(id,actor_id,actor_display,actor_role,action,resource_type,resource_id,metadata_json,created_at) SELECT ${quote(randomToken())},'infra','Infrastructure operator','system',${quote(mode==='bootstrap'?'owner.bootstrapped':'owner.break_glass')},'superadmin',id,${quote(JSON.stringify({environment,manual_infrastructure:true}))},${quote(now)} FROM arena_superadmins WHERE role='owner' AND email_normalized=${qemail};`);
const file=resolve(out);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,statements.join('\n'),{mode:0o600,flag:'wx'});
if(emitOnly)console.log(`SQL skapat för separat infra-review: ${file}. Ingen databas ändrad. Filen innehåller lösenordshash och ska hanteras privat och raderas efter användning.`);
else{try{const persist=option('--persist-to')??resolve(root,'.wrangler/state'),r=spawnSync(process.execPath,['node_modules/wrangler/wrangler-dist/cli.js','d1','execute','ARENA_DB','--local','--config','wrangler.jsonc','--persist-to',persist,'--file',file],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:'inherit'});if(r.status!==0)process.exitCode=r.status||1;else console.log('Lokal Owner-operation klar. Verifiera recovery-mejl och generera nya recovery-koder.');}finally{unlinkSync(file);}}
