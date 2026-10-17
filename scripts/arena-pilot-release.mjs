// Single-step release controller. Default Plan is offline. No creation of D1,
// DNS changes, e-mail sends, blind retries or implicit continuation are possible.
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {pathToFileURL} from 'node:url';
import {inspectArenaPilotConfig} from './arena-release-preflight.mjs';
import {verifyLocalArenaRestore,sha256,migrationDigest} from './arena-pilot-restore-check.mjs';

export const PILOT={account:'aff95af21a7f160722dd524471fc25b0',worker:'arenan-pilot-vd-20261019',database:'8044ee1b-9185-4644-954f-d5455330a7a7',mailer:'arenan-mailer-pilot',backupSha256:'12b4d609d563571a2bbe9615dadd52fa835ee6f0e29cdf77ef6c64ca8ec3cb68'};
export const STEPS=['Plan','Restore','Inspect','Migrate','PrepareMailer','MailerSecret','DeployMailer','OwnerSql','OwnerBootstrap','DeployPilot','Verify'];
const fail=message=>{throw Error(message);};
const samePath=(a,b)=>process.platform==='win32'?resolve(a).toLowerCase()===resolve(b).toLowerCase():resolve(a)===resolve(b);
export function assertPilotReleaseConfig(c,root){
 const p=inspectArenaPilotConfig(c,{worker:PILOT.worker,arenaDatabaseId:PILOT.database});
 if(!p.ok||c.account_id!==PILOT.account||c.vars?.STATION_ID!==PILOT.worker)fail('Pilot config/account/UUID mismatch. STOP.');
 if(!samePath(c.main,join(root,'worker/index.ts'))||!samePath(c.assets.directory,join(root,'dist/client'))||!samePath(c.d1_databases[0].migrations_dir,join(root,'migrations-arena')))fail('Pilot paths must belong to this checkout.');
 if(c.d1_databases[0].database_name!==PILOT.worker||c.services?.length!==1||c.services[0].service!==PILOT.mailer||c.services[0].entrypoint!=='ArenaMailer'||c.services[0].props?.caller!==PILOT.worker)fail('Wrong dedicated mailer binding.');
 const allowed=['name','account_id','main','compatibility_date','workers_dev','preview_urls','assets','vars','d1_databases','services','observability','$schema'];
 if(Object.keys(c).some(k=>!allowed.includes(k))||Object.keys(c.vars).some(k=>!['ARENA_ONLY','STATION_ID'].includes(k))||c.workers_dev!==true||c.preview_urls!==false)fail('Unreviewed pilot settings/resources.');
 return c;
}
export function command(root,kind,args,{interactive=false,input}={}){
 if(kind==='wrangler'&&[process.env.CLOUDFLARE_ACCOUNT_ID,process.env.CF_ACCOUNT_ID].some(id=>id&&id!==PILOT.account))fail('Cloudflare account environment conflicts with the approved pilot.');
 const program=kind==='git'?'git':process.execPath;
 const actual=kind==='wrangler'?[join(root,'node_modules/wrangler/bin/wrangler.js'),...args]:args;
 const p=spawnSync(program,actual,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,stdio:interactive?'inherit':['pipe','pipe','pipe'],input,env:{...process.env,WRANGLER_SEND_METRICS:'false',...(interactive?{}:{CI:'true'})}});
 if(p.status!==0){
  const code=Number((String(p.stderr)+String(p.stdout)).match(/(?:\[code:\s*|"code"\s*:\s*)(\d+)/)?.[1]);
  const error=Error(`${kind} step failed. STOP; no retry. Check authentication/permissions or the private local input.`);error.cfCode=code;throw error;
 }
 return p.stdout?.trim()??'';
}
async function prompt(summary,required){
 if(!process.stdin.isTTY)fail('Interactive terminal required for approval. No unattended remote mutation.');
 console.log(JSON.stringify(summary,null,2));const rl=createInterface({input:process.stdin,output:process.stdout});
 try{return await rl.question(`Type exactly ${required}: `);}finally{rl.close();}
}
function save(path,data){const tmp=path+'.tmp';writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600});renameSync(tmp,path);}
export async function runPilotStep(step,options={},dependencies={}){
 if(!STEPS.includes(step))fail('Unknown release step.');
 const root=options.root??resolve(import.meta.dirname,'..'),run=dependencies.run??((kind,args,extra)=>command(root,kind,args,extra)),confirm=dependencies.confirm??prompt;
 const privateDir=join(root,'.arena-pilot');
 const git=(...args)=>run('git',args).trim(),head=git('rev-parse','HEAD'),branch=git('branch','--show-current'),clean=!git('status','--porcelain');
 const configPath=join(privateDir,'pilot.json'),mailerPath=join(privateDir,'mailer.json'),proofPath=join(privateDir,'restore-proof.json'),statePath=join(privateDir,'release-state.json');
 const existingProof=existsSync(proofPath)?JSON.parse(readFileSync(proofPath,'utf8')):null;
 if(step==='Plan')return {step,branch,head,clean,remoteActions:0,pilotConfigExists:existsSync(configPath),restoreVerified:existingProof?.head===head&&existingProof?.status==='PASS'&&existingProof?.importExecuted===true&&existingProof?.fullIntegrity==='ok',resend:'Operator reports Partially Verified; no e-mail or publication before real Verified',next:'Restore (offline), Inspect (read-only), Migrate (explicit approval). Mailer/Owner/publish remain separately gated.',steps:STEPS};
 if(branch!=='feat/arena-v1'||!clean)fail('Requires feat/arena-v1 with clean working tree.');
 git('merge-base','--is-ancestor','35cfdc6ee7d768bb911204633d28b55a9083b386','HEAD');
 mkdirSync(privateDir,{recursive:true});
 const state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{};
 const read=path=>JSON.parse(readFileSync(path,'utf8'));
 const wr=(args,path=configPath,extra)=>run('wrangler',[...args,'--config',path],extra);
 const json=(args,path=configPath)=>JSON.parse(wr([...args,'--json'],path));
 const sql=query=>{const r=json(['d1','execute','ARENA_DB','--remote','--command',query]);if(!Array.isArray(r)||r.length!==1||r[0].success!==true||!Array.isArray(r[0].results))fail('Unexpected D1 query response.');return r[0].results;};
 const config=()=>assertPilotReleaseConfig(read(configPath),root);
 const workerState=name=>{
  try{const r=json(['versions','list','--name',name]);const list=Array.isArray(r)?r:r.items;if(!Array.isArray(list))fail('Unexpected Worker version response.');return {exists:true,versions:list.map(x=>x.id)};}
  catch(error){if(error.cfCode===10007)return {exists:false,versions:[]};throw error;}
 };
 const inspect=()=>{
  config();const auth=json(['whoami']);
  if(auth.loggedIn!==true||!auth.accounts?.some(a=>a.id===PILOT.account))fail('Authenticated account is not the approved pilot account.');
  const info=json(['d1','info','ARENA_DB']);
  if(info.uuid!==PILOT.database||info.name!==PILOT.worker)fail('Remote D1 identity mismatch.');
  const tables=sql("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name").map(x=>x.name);
  if(tables.some(n=>n!=='d1_migrations'&&!n.startsWith('arena_')))fail('Unexpected non-Arena tables in target.');
  const ledger=tables.includes('d1_migrations')?sql('SELECT name FROM d1_migrations ORDER BY id').map(x=>x.name):[];
  return {account:PILOT.account,database:PILOT.database,tables,ledger,pilot:workerState(PILOT.worker),mailer:workerState(PILOT.mailer)};
 };
 const health=()=>{const q=sql('PRAGMA quick_check');if(q.length!==1||q[0].quick_check!=='ok'||sql('PRAGMA foreign_key_check').length)fail('Remote quick/FK checks failed.');};
 const expectedMigrations=()=>{
  const names=readdirSync(join(root,'migrations-arena')).filter(n=>/^\d{4}_.+\.sql$/.test(n)).sort();
  if(names.length!==13||names.some((n,i)=>!n.startsWith(String(i+1).padStart(4,'0')+'_')))fail('Expected original migrations 0001-0013 before any write.');
  return names;
 };
 const requireFullLedger=remote=>{
  if(JSON.stringify(remote.ledger)!==JSON.stringify(expectedMigrations()))fail('Expected complete original 0001-0013 ledger. No blind retry.');
 };
 async function mutate(key,summary,operation){
  if(state[key])fail('This mutation has a previous attempt recorded. Inspect its result before any new decision; no automatic retry.');
  const required=`GODKANN ${key} ${PILOT.account}`;
  if(await confirm({...summary,step:key,account:PILOT.account,worker:PILOT.worker,mailer:PILOT.mailer,database:PILOT.database,head},required)!==required)fail('Not explicitly approved. No remote mutation.');
  if(git('rev-parse','HEAD')!==head||git('status','--porcelain'))fail('Checkout changed during approval. STOP.');
  config();
  state[key]={status:'started',head};save(statePath,state);
  try{const result=await operation();state[key]={status:'complete',head};save(statePath,state);return result;}
  catch(error){state[key]={status:'failed-or-unknown',head};save(statePath,state);throw error;}
 }
 if(step==='Restore'){
  if(!options.backupPath)fail('Private Windows backup path is required.');
  const verify=dependencies.restore??verifyLocalArenaRestore;
  const proof=verify({root,backupPath:options.backupPath,expectedSha256:PILOT.backupSha256,allowEmpty:true,reportPath:proofPath});
  save(proofPath,{...proof,head});return {...proof,head,step};
 }
 if(step==='PrepareMailer'){
  config();if(existsSync(mailerPath))fail('Mailer config already exists. Review it; never overwrite automatically.');
  let u;try{u=new URL(options.origin);}catch{fail('Supply the actually verified pilot HTTPS origin.');}
  if(u.origin!==options.origin||u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.startsWith(PILOT.worker+'.')||!u.hostname.endsWith('.workers.dev'))fail('Only the exact verified pilot workers.dev origin is approved here; no DNS/custom-domain changes.');
  const required=`VERIFIED eu-west-1 TRACKING-OFF ${options.origin}`;
  if(await confirm({localOnly:true,required:'Confirm actual Resend Verified, EU domain region, tracking off and verified account namespace; Partially Verified is not enough.'},required)!==required)fail('Resend/origin readiness not confirmed.');
  const c=read(join(root,'wrangler.arena-mailer.jsonc'));c.main=join(root,'worker/arena-mailer.ts');c.vars={RESEND_DOMAIN_VERIFIED:'1',ARENA_ALLOWED_ORIGINS:JSON.stringify([options.origin])};
  writeFileSync(mailerPath,JSON.stringify(c,null,2)+'\n',{mode:0o600,flag:'wx'});
  wr(['deploy','--dry-run','--outdir',join(privateDir,'mailer-dry-run')],mailerPath);
  state.mailerPrepared={head,configSha256:sha256(readFileSync(mailerPath)),origin:options.origin};save(statePath,state);return {step,localOnly:true,origin:options.origin};
 }
 const mailerReady=()=>{
  const p=state.mailerPrepared;if(!p||p.head!==head||p.configSha256!==sha256(readFileSync(mailerPath)))fail('Prepare and attest the mailer/origin after full Resend Verified first.');
  const c=read(mailerPath);
  if(c.name!==PILOT.mailer||c.account_id!==PILOT.account||c.workers_dev!==false||c.preview_urls!==false||c.routes?.length||c.d1_databases?.length||!samePath(c.main,join(root,'worker/arena-mailer.ts'))||c.vars.RESEND_DOMAIN_VERIFIED!=='1'||c.vars.RESEND_API_KEY!==undefined||c.vars.ARENA_ALLOWED_ORIGINS!==JSON.stringify([p.origin]))fail('Mailer config is not the isolated reviewed target.');
 };
 if(step==='OwnerSql'){
  config();if(!options.ownerInput)fail('Owner input must come from hidden PowerShell input via stdin.');
  const output=join(privateDir,'owner-bootstrap-private.sql');
  run('node',['scripts/arena-owner-maintenance.mjs','--mode','bootstrap','--environment',PILOT.worker,'--confirm',`ARENA ${PILOT.worker} BOOTSTRAP`,'--output',output,'--emit-only'],{input:options.ownerInput});
  state.ownerSql={head,sha256:sha256(readFileSync(output))};save(statePath,state);return {step,localOnly:true,privateSqlPrepared:true};
 }
 const remote=inspect();
 if(step==='Inspect')return {step,...remote,remoteMutations:0};
 if(step==='Migrate'){
  expectedMigrations();
  const proof=read(proofPath);
  if(proof.status!=='PASS'||proof.freshLocalState!==true||proof.quickCheck!=='ok'||proof.head!==head||proof.backupSha256!==PILOT.backupSha256||proof.importExecuted!==true||proof.fullIntegrity!=='ok'||proof.foreignKeys!=='ok'||proof.schemaAndRowsEqual!==true||proof.migrationsDigest!==migrationDigest(root)||!options.backupPath||sha256(readFileSync(options.backupPath))!==PILOT.backupSha256)fail('A fresh matching Windows backup/restore proof is required before migration.');
  if(remote.ledger.length===13){requireFullLedger(remote);health();return {step,status:'already-complete',remoteMutations:0};}
  if(remote.ledger.length||remote.tables.some(n=>n!=='d1_migrations')||proof.rows!==0||JSON.stringify(remote.tables)!==JSON.stringify(proof.tableDetails.map(t=>t.name)))fail('Target is not the proved empty baseline, or migrations are partial. STOP; investigate, never retry blindly.');
  health();
  return mutate('MIGRATE',{backupSha256:proof.backupSha256,migrationsDigest:proof.migrationsDigest,migrationCount:13,action:'Apply only migrations-arena 0001-0013 to the existing isolated ARENA_DB; no D1 creation.'},()=>{
   const fresh=inspect();if(fresh.ledger.length||JSON.stringify(fresh.tables)!==JSON.stringify(remote.tables))fail('Target changed during approval; migration cancelled.');health();
   wr(['d1','migrations','apply','ARENA_DB','--remote']);const after=inspect();requireFullLedger(after);health();return {step,status:'complete',migrationCount:13};
  });
 }
 if(step==='MailerSecret'){
  mailerReady();if(remote.mailer.exists)fail('Unexpected existing mailer Worker. No secret overwrite; inspect separately.');
  return mutate('MAILER-SECRET',{currentMailer:remote.mailer,action:'Interactive secret put RESEND_API_KEY in mailer only. If absent, an EMPTY mailer Worker may be created; no public app or email.'},()=>{mailerReady();if(workerState(PILOT.mailer).exists)fail('Mailer appeared during approval; no secret overwrite.');wr(['secret','put','RESEND_API_KEY'],mailerPath,{interactive:true});return {step,status:'complete'};});
 }
 if(step==='DeployMailer'){
  mailerReady();if(state['MAILER-SECRET']?.status!=='complete')fail('The separately approved secret step is required first.');
  wr(['deploy','--dry-run','--outdir',join(privateDir,'mailer-dry-run')],mailerPath);
  return mutate('DEPLOY-MAILER',{currentMailer:remote.mailer,action:'Deploy only arenan-mailer-pilot; no public routes, no database, no mail send.'},()=>{mailerReady();if(JSON.stringify(workerState(PILOT.mailer))!==JSON.stringify(remote.mailer))fail('Mailer changed during approval; no overwrite.');wr(['deploy'],mailerPath);return {step,status:'complete'};});
 }
 if(step==='OwnerBootstrap'){
  requireFullLedger(remote);health();mailerReady();if(state['DEPLOY-MAILER']?.status!=='complete'||!remote.mailer.exists)fail('Deploy and verify the private mailer before remote Owner bootstrap.');
  const path=join(privateDir,'owner-bootstrap-private.sql');if(state.ownerSql?.head!==head||state.ownerSql.sha256!==sha256(readFileSync(path)))fail('Generate and privately review the Owner SQL first.');
  if(sql("SELECT COUNT(*) n FROM arena_superadmins WHERE role='owner'")[0]?.n!==0)fail('Owner already exists; no bootstrap or overwrite.');
  return mutate('BOOTSTRAP-OWNER',{sqlSha256:state.ownerSql.sha256,action:'Insert one unverified individual Owner from privately reviewed offline SQL; no email and no automatic verification.'},()=>{const applied=JSON.parse(wr(['d1','execute','ARENA_DB','--remote','--file',path,'--json']));if(!Array.isArray(applied)||!applied.length||applied.some(r=>r.success!==true)||sql("SELECT COUNT(*) n FROM arena_superadmins WHERE role='owner'")[0]?.n!==1)fail('Owner bootstrap result is uncertain; stop and investigate.');return {step,status:'complete',privateSql:'Remove securely after review/use.'};});
 }
 if(step==='DeployPilot'){
  requireFullLedger(remote);health();mailerReady();if(state['DEPLOY-MAILER']?.status!=='complete'||state['BOOTSTRAP-OWNER']?.status!=='complete'||!remote.mailer.exists||remote.pilot.exists)fail('Requires approved mailer + Owner and a still-unpublished pilot Worker. No unexpected overwrite.');
  if(sql("SELECT COUNT(*) n FROM arena_superadmins WHERE role='owner'")[0]?.n!==1)fail('Exactly one Owner is required.');
  wr(['deploy','--dry-run','--outdir',join(privateDir,'app-dry-run')]);
  return mutate('DEPLOY-PILOT',{origin:state.mailerPrepared.origin,action:'First publish of the isolated pilot Worker only, ARENA_DB + named mailer; no DNS, email or station DB.'},()=>{mailerReady();if(workerState(PILOT.worker).exists)fail('Pilot Worker appeared during approval; no overwrite.');wr(['deploy']);return {step,status:'complete',origin:state.mailerPrepared.origin};});
 }
 if(step==='Verify'){
  requireFullLedger(remote);health();return {step,...remote,next:'Manual approved Owner login/email verification, recovery, PIN, Showtime/Battle demo and inbox/edge checks. No email or mutations automated.',remoteMutations:0};
 }
 fail('Unhandled step.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const args=process.argv.slice(2),options={};let step='Plan';
  for(let i=0;i<args.length;i++){const key=args[i],value=args[++i];if(!value)fail('Missing option value.');if(key==='--step')step=value;else if(key==='--backup')options.backupPath=resolve(value);else if(key==='--origin')options.origin=value;else fail('Unknown option.');}
  if(step==='OwnerSql')options.ownerInput=readFileSync(0,'utf8');
  console.log(JSON.stringify(await runPilotStep(step,options),null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
