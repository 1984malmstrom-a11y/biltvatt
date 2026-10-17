import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// Use a labelled synthetic backup; never read the operator's actual private export.
vi.mock('../scripts/arena-pilot-restore-check.mjs',async original=>{
 const actual=await original<any>();return {...actual,sha256:(value:any)=>value.toString()==='synthetic-approved-backup'?'12b4d609d563571a2bbe9615dadd52fa835ee6f0e29cdf77ef6c64ca8ec3cb68':actual.sha256(value)};
});
import {PILOT,STEPS,assertPilotReleaseConfig,runPilotStep,command,assertPilotOrigin,assertMailerReleaseConfig} from '../scripts/arena-pilot-release.mjs';
import {prepareArenaPilotConfig} from '../scripts/arena-pilot-config.mjs';
import {migrationDigest,sha256} from '../scripts/arena-pilot-restore-check.mjs';
const roots:string[]=[];
const head='35cfdc6ee7d768bb911204633d28b55a9083b386';
const repo=new URL('../',import.meta.url);
afterEach(()=>{roots.splice(0).forEach(p=>rmSync(p,{recursive:true,force:true}));});
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'arena release test '));roots.push(root);mkdirSync(join(root,'.arena-pilot'));mkdirSync(join(root,'migrations-arena'));
 const names=readdirSync(new URL('migrations-arena',repo)).filter(n=>n.endsWith('.sql')).sort();
 for(const name of names)writeFileSync(join(root,'migrations-arena',name),readFileSync(new URL('migrations-arena/'+name,repo)));
 writeFileSync(join(root,'wrangler.arena-mailer.jsonc'),readFileSync(new URL('wrangler.arena-mailer.jsonc',repo)));
 const config=prepareArenaPilotConfig(JSON.parse(readFileSync(new URL('wrangler.arena-pilot.jsonc',repo),'utf8')),{root,accountId:PILOT.account,arenaDatabaseId:PILOT.database,mailer:PILOT.mailer,mailerEntrypoint:'ArenaMailer'});
 const put=(name:string,value:any)=>writeFileSync(join(root,'.arena-pilot',name),JSON.stringify(value));put('pilot.json',config);
 const backupPath=join(root,'private backup.sql');writeFileSync(backupPath,'synthetic-approved-backup');
 const proof={status:'PASS',head,backupSha256:PILOT.backupSha256,importExecuted:true,freshLocalState:true,quickCheck:'ok',fullIntegrity:'ok',foreignKeys:'ok',schemaAndRowsEqual:true,migrationsDigest:migrationDigest(root),rows:0,tableDetails:[{name:'d1_migrations'}]};
 let ledger:string[]=[],tables=['d1_migrations'],dirty=false,account=PILOT.account,database=PILOT.database,workerExists=false,mailerExists=false,pilotExists=false,secretPresent=true,owners=0,migrationFailure=false;
 const run=vi.fn((kind:string,args:string[])=>{
  if(kind==='git'){
   if(args[0]==='rev-parse')return head;if(args[0]==='branch')return 'feat/arena-v1';if(args[0]==='status')return dirty?' M source.ts':'';return '';
  }
  if(kind==='node'){
   if(args[0]==='scripts/arena-owner-maintenance.mjs')writeFileSync(args[args.indexOf('--output')+1],'-- synthetic private Owner SQL only');
   else expect(args[0]).toBe('scripts/arena-mailer-smoke.mjs');return '';
  }
  expect(kind).toBe('wrangler');expect(args).toContain('--config');const path=args[args.indexOf('--config')+1];expect([join(root,'.arena-pilot/pilot.json'),join(root,'.arena-pilot/mailer.json'),join(root,'wrangler.arena-mailer.jsonc')]).toContain(path);if(path===join(root,'wrangler.arena-mailer.jsonc'))expect(args).toContain('--dry-run');
  expect(args.join(' ')).not.toMatch(/d1 create|delete|rollback|dns|migrations-master/);
  if(args[0]==='whoami')return JSON.stringify({loggedIn:true,accounts:[{id:account}]});
  if(args[0]==='versions'){
   if(workerExists||(args[args.indexOf('--name')+1]===PILOT.mailer?mailerExists:pilotExists))return JSON.stringify([{id:'test-version'}]);const e:any=Error('not found');e.cfCode=10007;throw e;
  }
  if(args[1]==='info')return JSON.stringify({uuid:database,name:PILOT.worker});
  if(args[1]==='migrations'){
   if(migrationFailure)throw Error('synthetic migration failure');ledger=names;tables=['arena_stations','d1_migrations'];return '';
  }
  if(args[1]==='execute'){
   if(args.includes('--file')){expect(owners).toBe(0);owners=1;return JSON.stringify([{success:true,results:[]}]);}
   const sql=args[args.indexOf('--command')+1];let results:any[]=[];
   if(sql.includes('sqlite_master'))results=tables.map(name=>({name}));
   else if(sql.includes('FROM d1_migrations'))results=ledger.map(name=>({name}));
   else if(sql.includes("FROM arena_superadmins WHERE role='owner'"))results=[{n:owners}];
   else if(sql==='PRAGMA quick_check')results=[{quick_check:'ok'}];
   else if(sql!=='PRAGMA foreign_key_check')throw Error('Unexpected query: '+sql);
   return JSON.stringify([{success:true,results}]);
  }
  if(args[0]==='secret'){
   if(args[1]==='list'){expect(args).toContain('--format');expect(args).not.toContain('--json');return JSON.stringify(secretPresent?[{name:'RESEND_API_KEY',type:'secret_text'}]:[]);}
   mailerExists=true;return '';
  }
  if(args[0]==='deploy'){
   if(!args.includes('--dry-run')){if(path.endsWith('mailer.json'))mailerExists=true;else pilotExists=true;}return '';
  }
  throw Error('Unexpected operation '+args.join(' '));
 });
 const confirm=vi.fn(async(_summary:any,required:string)=>required);
 const options={root,backupPath};const deps={run,confirm};
 const writes=()=>run.mock.calls.filter(([kind,args])=>kind==='wrangler'&&(args[0]==='secret'&&args[1]==='put'||args[0]==='deploy'&&!args.includes('--dry-run')||args[1]==='migrations'||args.includes('--file')));
 const readyMailer=()=>{
  const c=JSON.parse(readFileSync(join(root,'wrangler.arena-mailer.jsonc'),'utf8'));c.main=join(root,'worker/arena-mailer.ts');c.vars={RESEND_DOMAIN_VERIFIED:'1',ARENA_ALLOWED_ORIGINS:JSON.stringify(['https://'+PILOT.worker+'.example.workers.dev'])};put('mailer.json',c);
  put('release-state.json',{mailerPrepared:{head,configSha256:sha256(readFileSync(join(root,'.arena-pilot/mailer.json'))),origin:'https://'+PILOT.worker+'.example.workers.dev'}});
 };
 return {root,config,put,proof,run,confirm,options,deps,writes,readyMailer,names,set:(x:any)=>{if(x.dirty!==undefined)dirty=x.dirty;if(x.account)account=x.account;if(x.database)database=x.database;if(x.ledger)ledger=x.ledger;if(x.tables)tables=x.tables;if(x.workerExists!==undefined)workerExists=x.workerExists;if(x.migrationFailure!==undefined)migrationFailure=x.migrationFailure;if(x.mailerExists!==undefined)mailerExists=x.mailerExists;if(x.pilotExists!==undefined)pilotExists=x.pilotExists;if(x.secretPresent!==undefined)secretPresent=x.secretPresent;if(x.owners!==undefined)owners=x.owners;}};
}
it('defaults to offline Plan and never infers restore success from file presence alone',async()=>{
 const f=fixture();f.put('restore-proof.json',{status:'PASS'});const result=await runPilotStep('Plan',f.options,f.deps);expect(result.restoreVerified).toBe(false);expect(result.remoteActions).toBe(0);expect(f.run.mock.calls.every(([kind])=>kind==='git')).toBe(true);
});
it.each(['dirty','account','database'])('stops on wrong %s without a mutation',async problem=>{
 const f=fixture();f.set(problem==='dirty'?{dirty:true}:{[problem]:'wrong'});await expect(runPilotStep('Inspect',f.options,f.deps)).rejects.toThrow();expect(f.writes()).toEqual([]);
});
it.each(['account_id','name','database','binding','paths','routes'])('refuses unapproved config change: %s',problem=>{
 const f=fixture(),c=structuredClone(f.config);if(problem==='database')c.d1_databases[0].database_id='695033b7-6bb2-47a3-a9c3-08d4ca818088';else if(problem==='binding')c.services[0].entrypoint='default';else if(problem==='paths')c.main='/other/worker.ts';else if(problem==='routes')c.routes=['example.test/*'];else c[problem]='wrong';expect(()=>assertPilotReleaseConfig(c,f.root)).toThrow();
});
it('read-only inspection verifies both worker identities and refuses unexpected private business tables',async()=>{
 const f=fixture();expect((await runPilotStep('Inspect',f.options,f.deps)).remoteMutations).toBe(0);expect(f.run.mock.calls.filter(([,args])=>args[0]==='versions').map(([,args])=>args[args.indexOf('--name')+1])).toEqual([PILOT.worker,PILOT.mailer]);f.set({tables:['staff']});await expect(runPilotStep('Inspect',f.options,f.deps)).rejects.toThrow(/non-Arena/);expect(f.writes()).toEqual([]);
});
it('does not mistake an authentication failure for a missing Worker',async()=>{
 const f=fixture();const base=f.run.getMockImplementation()!;f.run.mockImplementation((kind,args)=>{if(args[0]==='versions'){const e:any=Error('denied');e.cfCode=10000;throw e;}return base(kind,args);});await expect(runPilotStep('Inspect',f.options,f.deps)).rejects.toThrow('denied');expect(f.writes()).toEqual([]);
});
it.each(['missing','no-import','partial','changed-backup','changed-migration'])('refuses migration with %s evidence',async mode=>{
 const f=fixture();if(mode!=='missing')f.put('restore-proof.json',{...f.proof,...(mode==='no-import'?{importExecuted:false}:{})});if(mode==='partial')f.set({ledger:[f.names[0]]});if(mode==='changed-backup')writeFileSync(f.options.backupPath,'changed');if(mode==='changed-migration')writeFileSync(join(f.root,'migrations-arena',f.names[0]),'changed');await expect(runPilotStep('Migrate',f.options,f.deps)).rejects.toThrow();expect(f.writes()).toEqual([]);
});
it('refuses absent or incorrect explicit approval and performs no write',async()=>{
 const f=fixture();f.put('restore-proof.json',f.proof);f.confirm.mockResolvedValue('yes');await expect(runPilotStep('Migrate',f.options,f.deps)).rejects.toThrow(/approved/);expect(f.writes()).toEqual([]);
});
it('applies exactly once after explicit summary/approval and records complete only after ledger + quick/FK checks',async()=>{
 const f=fixture();f.put('restore-proof.json',f.proof);expect(await runPilotStep('Migrate',f.options,f.deps)).toMatchObject({status:'complete',migrationCount:13});expect(f.writes()).toHaveLength(1);expect(f.confirm.mock.calls[0][0]).toMatchObject({database:PILOT.database,migrationCount:13});expect(JSON.parse(readFileSync(join(f.root,'.arena-pilot/release-state.json'),'utf8')).MIGRATE.status).toBe('complete');expect(await runPilotStep('Migrate',f.options,f.deps)).toMatchObject({status:'already-complete',remoteMutations:0});expect(f.writes()).toHaveLength(1);
});
it('records a failed migration and never blindly retries or continues to deploy',async()=>{
 const f=fixture();f.put('restore-proof.json',f.proof);f.set({migrationFailure:true});await expect(runPilotStep('Migrate',f.options,f.deps)).rejects.toThrow('synthetic migration failure');f.set({migrationFailure:false});await expect(runPilotStep('Migrate',f.options,f.deps)).rejects.toThrow(/previous attempt/);expect(f.writes()).toHaveLength(1);expect(JSON.parse(readFileSync(join(f.root,'.arena-pilot/release-state.json'),'utf8')).MIGRATE.status).toBe('failed-or-unknown');
});
it('requires full Resend readiness and exact origin before local preparation; does not create secrets or send mail',async()=>{
 const f=fixture();f.confirm.mockResolvedValue('Partially Verified');await expect(runPilotStep('PrepareMailer',{...f.options,origin:'https://'+PILOT.worker+'.example.workers.dev'},f.deps)).rejects.toThrow(/readiness/);expect(f.writes()).toEqual([]);f.confirm.mockImplementation(async(_s,r)=>r);expect(await runPilotStep('PrepareMailer',{...f.options,origin:'https://'+PILOT.worker+'.example.workers.dev'},f.deps)).toMatchObject({localOnly:true});expect(f.writes()).toEqual([]);
});
it.each(['MailerSecret','DeployMailer','OwnerBootstrap','DeployPilot'])('keeps %s blocked without its prerequisites',async step=>{
 const f=fixture();await expect(runPilotStep(step,f.options,f.deps)).rejects.toThrow();expect(f.writes()).toEqual([]);
});
it('never overwrites a previously existing mailer secret or Worker',async()=>{
 const f=fixture();f.readyMailer();f.set({workerExists:true});await expect(runPilotStep('MailerSecret',f.options,f.deps)).rejects.toThrow(/existing mailer/);expect(f.writes()).toEqual([]);
});
it('puts only the dedicated mailer secret interactively, with no value in arguments or environment',async()=>{
 const f=fixture();f.readyMailer();expect(await runPilotStep('MailerSecret',f.options,f.deps)).toMatchObject({status:'complete'});expect(f.writes()).toHaveLength(1);const args=f.writes()[0][1];expect(args).toEqual(['secret','put','RESEND_API_KEY','--config',join(f.root,'.arena-pilot/mailer.json')]);expect(STEPS).not.toContain('CreateDatabase');
});

it('refuses a conflicting Cloudflare account environment before spawning Wrangler',()=>{
 vi.stubEnv('CLOUDFLARE_ACCOUNT_ID','unapproved-account');try{expect(()=>command('/no-repo','wrangler',['deploy'])).toThrow(/account environment/);}finally{vi.unstubAllEnvs();}
});

it('rechecks after approval and refuses a Worker created by somebody else while the prompt was open',async()=>{
 const f=fixture();f.readyMailer();f.confirm.mockImplementation(async(_s,r)=>{f.set({workerExists:true});return r;});await expect(runPilotStep('MailerSecret',f.options,f.deps)).rejects.toThrow(/appeared during approval/);expect(f.writes()).toEqual([]);
});
it('rechecks the checkout after approval and refuses a code change before a write',async()=>{
 const f=fixture();f.put('restore-proof.json',f.proof);f.confirm.mockImplementation(async(_s,r)=>{f.set({dirty:true});return r;});await expect(runPilotStep('Migrate',f.options,f.deps)).rejects.toThrow(/Checkout changed/);expect(f.writes()).toEqual([]);
});

it('rejects an origin containing an extra preview/namespace label',async()=>{
 const f=fixture();await expect(runPilotStep('PrepareMailer',{...f.options,origin:`https://${PILOT.worker}.preview.example.workers.dev`},f.deps)).rejects.toThrow(/origin/i);expect(f.writes()).toEqual([]);
});
it('Verify cannot succeed before both dedicated Workers exist',async()=>{
 const f=fixture();f.set({ledger:f.names});await expect(runPilotStep('Verify',f.options,f.deps)).rejects.toThrow(/Worker/i);expect(f.writes()).toEqual([]);
});
it('Plan reflects the updated operator report without claiming a live verification or recommending migration retry',async()=>{
 const f=fixture();f.put('release-state.json',{MIGRATE:{status:'complete',head}});const p=await runPilotStep('Plan',f.options,f.deps);expect(p.resend).not.toContain('Partially Verified');expect(p.operatorReported?.migrationCount).toBe(13);expect(p.next).not.toMatch(/Restore.*Migrate/);expect(p.remoteActions).toBe(0);
});

const origin=`https://${PILOT.worker}.example.workers.dev`;
async function preparedChain(){
 const f=fixture();f.set({ledger:f.names,tables:['arena_stations','d1_migrations']});
 await runPilotStep('PrepareMailer',{...f.options,origin},f.deps);
 await runPilotStep('MailerSecret',f.options,f.deps);
 await runPilotStep('DeployMailer',f.options,f.deps);
 await runPilotStep('OwnerSql',{...f.options,ownerInput:JSON.stringify({email:'synthetic-owner@example.test',display_name:'Syntetisk Owner',password:'synthetic-test-password-only'})},f.deps);
 return f;
}
it('the complete remaining release chain has no circular dependency and no automatic continuation',async()=>{
 const f=await preparedChain();expect(f.writes()).toHaveLength(2);
 await runPilotStep('OwnerBootstrap',f.options,f.deps);expect(f.writes()).toHaveLength(3);
 await runPilotStep('DeployPilot',f.options,f.deps);expect(f.writes()).toHaveLength(4);
 const verified=await runPilotStep('Verify',f.options,f.deps);expect(verified).toMatchObject({status:'METADATA_VERIFIED_ONLY',remoteMutations:0,inboxVerified:false});expect(f.writes()).toHaveLength(4);
 expect(f.confirm).toHaveBeenCalledTimes(5); // one local attestation + four separate remote approvals
 expect(f.writes().some(([,args])=>args[1]==='migrations')).toBe(false);
 const state=JSON.parse(readFileSync(join(f.root,'.arena-pilot/release-state.json'),'utf8'));expect(state['DEPLOY-PILOT'].status).toBe('complete');
});
it('refuses Owner SQL tampering while the approval prompt is open',async()=>{
 const f=await preparedChain();f.confirm.mockImplementation(async(_s,r)=>{writeFileSync(join(f.root,'.arena-pilot/owner-bootstrap-private.sql'),'changed after private review');return r;});
 await expect(runPilotStep('OwnerBootstrap',f.options,f.deps)).rejects.toThrow(/unchanged Owner SQL/);expect(f.writes()).toHaveLength(2);
});
it('refuses a second Owner that appears during approval',async()=>{
 const f=await preparedChain();f.confirm.mockImplementation(async(_s,r)=>{f.set({owners:1});return r;});await expect(runPilotStep('OwnerBootstrap',f.options,f.deps)).rejects.toThrow(/Owner appeared/);expect(f.writes()).toHaveLength(2);
});
it('refuses mailer publication without its created Worker or secret metadata',async()=>{
 const f=fixture();f.readyMailer();const path=join(f.root,'.arena-pilot/release-state.json'),state=JSON.parse(readFileSync(path,'utf8'));state['MAILER-SECRET']={status:'complete',head};f.put('release-state.json',state);
 await expect(runPilotStep('DeployMailer',f.options,f.deps)).rejects.toThrow(/Worker is missing/);f.set({mailerExists:true,secretPresent:false});await expect(runPilotStep('DeployMailer',f.options,f.deps)).rejects.toThrow(/metadata is missing/);expect(f.writes()).toEqual([]);
});
it('Preflight validates and dry-runs locally without any remote call or secret access',async()=>{
 const f=fixture();for(const file of ['dist/client/index.html','worker/index.ts','worker/arena-mailer.ts','scripts/arena-mailer-smoke.mjs']){const folder=join(f.root,file,'..');mkdirSync(folder,{recursive:true});writeFileSync(join(f.root,file),'synthetic input');}
 const result=await runPilotStep('Preflight',f.options,f.deps);expect(result).toMatchObject({status:'PASS_LOCAL_ONLY',remoteVerified:false,remoteActions:0,secretValuesRead:false});expect(f.writes()).toEqual([]);expect(f.confirm).not.toHaveBeenCalled();
 expect(f.run.mock.calls.filter(([kind])=>kind==='wrangler').every(([,args])=>args[0]==='deploy'&&args.includes('--dry-run'))).toBe(true);
 expect(f.run.mock.calls.some(([kind,args])=>kind==='node'&&args[0]==='scripts/arena-mailer-smoke.mjs')).toBe(true);
});
it.each(['http://'+PILOT.worker+'.example.workers.dev',origin+'/',origin+':8443',origin+'/arena','https://other.example.workers.dev',`https://${PILOT.worker}.preview.example.workers.dev`])('refuses wrong/ambiguous origin %s',bad=>{
 expect(()=>assertPilotOrigin(bad)).toThrow();expect(assertPilotOrigin(origin)).toBe(origin);
});
it.each(['services','assets','d1_databases','env','vars'])('rejects unexpected mailer resource or variable: %s',key=>{
 const f=fixture(),c=JSON.parse(readFileSync(join(f.root,'wrangler.arena-mailer.jsonc'),'utf8'));c.main=join(f.root,'worker/arena-mailer.ts');if(key==='vars')c.vars.EXTRA='not approved';else c[key]=[];expect(()=>assertMailerReleaseConfig(c,f.root)).toThrow();
});
it('preserves the completed operator migration receipt when preparing mailer on a later code checkpoint',async()=>{
 const f=fixture();f.put('release-state.json',{MIGRATE:{status:'complete',head:'older-approved-checkpoint'}});await runPilotStep('PrepareMailer',{...f.options,origin},f.deps);expect(JSON.parse(readFileSync(join(f.root,'.arena-pilot/release-state.json'),'utf8')).MIGRATE).toEqual({status:'complete',head:'older-approved-checkpoint'});expect(f.writes()).toEqual([]);
});
