// A fresh, local-only import is mandatory. Never reads a remote DB or reuses old state.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,readdirSync,rmSync,renameSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {prepareArenaPilotConfig} from './arena-pilot-config.mjs';
import {verifyArenaPilotBackup} from './arena-pilot-backup.mjs';
import {inspectArenaDatabase} from './arena-pilot-database.mjs';
export const sha256=data=>createHash('sha256').update(data).digest('hex');
export function migrationDigest(root){return sha256(JSON.stringify(readdirSync(join(root,'migrations-arena')).filter(n=>/^\d{4}_.+\.sql$/.test(n)).sort().map(n=>[n,sha256(readFileSync(join(root,'migrations-arena',n)))])));}
export function runLocalWrangler(root,args){
 if(!args.includes('--local')||args.includes('--remote')||!args.includes('--config'))throw Error('Local restore runner refuses remote or implicit config.');
 const p=spawnSync(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),...args],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 if(p.status!==0)throw Error('Local Wrangler step failed; restore is NOT verified. No automatic retry.');
 return JSON.parse(p.stdout);
}
export function verifyLocalArenaRestore({root,backupPath,expectedSha256,allowEmpty=false,reportPath,run=runLocalWrangler}){
 const privateDir=join(root,'.arena-pilot');mkdirSync(privateDir,{recursive:true});
 const report=reportPath??join(privateDir,'restore-proof.json');
 // A failed rerun must not leave a previous green receipt usable by migration.
 rmSync(report,{force:true});
 if(!/^[a-f0-9]{64}$/i.test(expectedSha256??''))throw Error('Explicit backup SHA-256 required.');
 if(statSync(backupPath).size>128*1024*1024)throw Error('Backup exceeds local verifier limit.');
 const raw=readFileSync(backupPath),backupHash=sha256(raw);
 if(backupHash!==expectedSha256.toLowerCase())throw Error('Backup SHA-256 mismatch.');
 const {restoreSql,report:source}=verifyArenaPilotBackup(new TextDecoder('utf-8',{fatal:true}).decode(raw),{allowEmpty});
 const directory=mkdtempSync(join(privateDir,'restore-check-'));
 const configPath=join(directory,'local.json'),restorePath=join(directory,'restore-private.sql'),state=join(directory,'state');
 const config=prepareArenaPilotConfig(JSON.parse(readFileSync(join(root,'wrangler.arena-pilot.jsonc'),'utf8')),{root,local:true});
 writeFileSync(configPath,JSON.stringify(config),{mode:0o600});writeFileSync(restorePath,restoreSql,{mode:0o600});
 const base=['d1','execute','ARENA_DB','--local','--config',configPath,'--persist-to',state];
 try{
  const imported=run(root,[...base,'--file',restorePath,'--json']);
  if(!Array.isArray(imported)||!imported.length||imported.some(r=>r.success!==true))throw Error('Local import did not acknowledge success.');
  const quick=run(root,[...base,'--command','PRAGMA quick_check','--json']);
  if(quick.length!==1||quick[0].success!==true||quick[0].results?.length!==1||quick[0].results[0].quick_check!=='ok')throw Error('D1 quick_check failed.');
  const foreign=run(root,[...base,'--command','PRAGMA foreign_key_check','--json']);
  if(foreign.length!==1||foreign[0].success!==true||foreign[0].results?.length!==0)throw Error('D1 foreign_key_check failed.');
  const folder=join(state,'v3/d1/miniflare-D1DatabaseObject');
  const files=readdirSync(folder).filter(n=>n.endsWith('.sqlite')&&n!=='metadata.sqlite');
  if(files.length!==1)throw Error('Fresh local D1 file is missing or ambiguous; import cannot be proved.');
  const db=new DatabaseSync(join(folder,files[0]),{readOnly:true});
  let restored;try{restored=inspectArenaDatabase(db,{allowEmpty});}finally{db.close();}
  if(restored.fingerprint!==source.fingerprint)throw Error('Restored schema/rows differ from backup. Import is NOT verified.');
  const result={status:'PASS',backupSha256:backupHash,importExecuted:true,freshLocalState:true,fullIntegrity:'ok',foreignKeys:'ok',quickCheck:'ok',schemaAndRowsEqual:true,...restored,migrationsDigest:migrationDigest(root),remoteActions:0};
  const temporary=report+'.tmp';writeFileSync(temporary,JSON.stringify(result,null,2)+'\n',{mode:0o600});renameSync(temporary,report);
  return result;
 }finally{rmSync(restorePath,{force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const args=process.argv.slice(2),options={root:resolve(import.meta.dirname,'..')};
  for(let i=0;i<args.length;i++){
   if(args[i]==='--allow-empty'){options.allowEmpty=true;continue;}
   const key={'--backup':'backupPath','--expected-sha256':'expectedSha256','--report':'reportPath'}[args[i]];
   if(!key||!args[i+1])throw Error('Usage: --backup <private.sql> --expected-sha256 <hash> [--allow-empty] [--report <local.json>]');options[key]=resolveKey(key,args[++i]);
  }
  if(!options.backupPath)throw Error('Private backup path required.');console.log(JSON.stringify(verifyLocalArenaRestore(options),null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
function resolveKey(key,value){return key==='expectedSha256'?value:resolve(value);}
