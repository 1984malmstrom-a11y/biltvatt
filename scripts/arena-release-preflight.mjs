// Read-only pilot configuration review. Never runs Wrangler, fetch, Git mutations,
// migration commands or deployment. Remote ownership/existence remains manual.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const protectedWorkers=new Set(['tvattligan','tvattligan-master-test']);
const protectedDatabases=new Set(['695033b7-6bb2-47a3-a9c3-08d4ca818088','ca2d4bb8-0c28-47b7-9514-8c893ea47c09','767b5a12-6b40-4516-9f7c-e072c1130480']);
export function inspectArenaPilotConfig(config,{worker,arenaDatabaseId}={}){
 const errors=[];const need=(ok,message)=>{if(!ok)errors.push(message);};
 const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
 need(typeof worker==='string'&&/^[a-z0-9][a-z0-9-]{2,62}$/.test(worker),'Expected Worker identity must be explicit.');
 need(typeof arenaDatabaseId==='string'&&uuid.test(arenaDatabaseId)&&!/^0{8}-/.test(arenaDatabaseId),'Expected Arena D1 UUID must be explicit and non-placeholder.');
 need(config.name===worker&&!protectedWorkers.has(config.name),'Worker must match the separately approved pilot, never an existing station/MASTER Worker.');
 need(config.vars?.ARENA_ONLY==='1','Pilot must set ARENA_ONLY=1.');
 need(config.vars?.ARENA_AUTH_DEV===undefined,'ARENA_AUTH_DEV must be absent.');
 for(const name of ['ADMIN_PIN','ARENA_SUPERADMIN_SECRET','VAPID_PRIVATE_KEY','CLOUDFLARE_API_TOKEN'])need(config.vars?.[name]===undefined,`${name} must not be a plaintext configuration variable.`);
 const bindings=config.d1_databases??[],arena=bindings.filter(x=>x.binding==='ARENA_DB');
 need(arena.length===1,'Exactly one ARENA_DB binding is required.');
 need(bindings.length===1,'Standalone pilot must not bind the station DB or integrated station databases.');
 need(arena[0]?.database_id===arenaDatabaseId&&!protectedDatabases.has(arena[0]?.database_id),'Arena D1 must match the approved UUID and never a protected station or integrated Arena database.');
 need(arena[0]?.migrations_dir?.replace(/\\/g,'/').replace(/\/$/,'').split('/').at(-1)==='migrations-arena','ARENA_DB must use migrations-arena.');
 const first=config.assets?.run_worker_first;
 need(Array.isArray(first)&&first.includes('/')&&first.includes('/api/*'),'Assets must run the Worker first for / and /api/*.');
 need(config.assets?.not_found_handling==='single-page-application','SPA fallback is required.');
 need(config.assets?.binding==='ASSETS'&&typeof config.assets?.directory==='string','ASSETS directory/binding is required.');
 need(!(config.routes?.length),'Pilot preflight expects no custom domain/routes before separate domain approval.');
 need(!(config.triggers?.crons?.length),'No automatic maintenance cron is approved.');
 need(!(config.r2_buckets?.length)&&!(config.queues?.producers?.length)&&!(config.queues?.consumers?.length),'No additional storage or queue resources are approved.');
 need((config.services??[]).some(x=>x.binding==='ARENA_MAILER'&&typeof x.service==='string'&&x.service.length>0),'Verified ARENA_MAILER service binding is required for recovery/invitations.');
 return {ok:errors.length===0,errors,remoteVerified:false,mutationsPerformed:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1];
  if(args.length!==5||args[1]!=='--expected-worker'||args[3]!=='--expected-arena-db')throw Error('Usage: node scripts/arena-release-preflight.mjs <strict-JSON-config> --expected-worker <approved-name> --expected-arena-db <approved-UUID>');
  const result=inspectArenaPilotConfig(JSON.parse(readFileSync(resolve(args[0]),'utf8')),{worker:value('--expected-worker'),arenaDatabaseId:value('--expected-arena-db')});
  console.log(JSON.stringify(result,null,2));process.exitCode=result.ok?0:1;
 }catch(error){console.error(error instanceof SyntaxError?'Configuration must be strict JSON; failed closed.':error.message);process.exitCode=1;}
}
