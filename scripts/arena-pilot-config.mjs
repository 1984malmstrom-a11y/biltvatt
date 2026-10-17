// LOCAL ONLY: prepares an explicit config. Never contacts Cloudflare or runs commands.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectArenaPilotConfig} from './arena-release-preflight.mjs';

export function prepareArenaPilotConfig(template,{root,local=false,accountId,arenaDatabaseId,mailer,mailerEntrypoint}={}){
 const config=structuredClone(template);
 if(config.name!=='arenan-pilot-vd-20261019'||config.d1_databases?.[0]?.database_name!==config.name)throw Error('Unexpected pilot template identity.');
 if(!root)throw Error('Explicit repository root required.');
 config.main=resolve(root,config.main);
 config.assets.directory=resolve(root,config.assets.directory);
 config.d1_databases[0].migrations_dir=resolve(root,config.d1_databases[0].migrations_dir);
 if(local){
  if(accountId||arenaDatabaseId||mailer||mailerEntrypoint)throw Error('Local rehearsal cannot accept remote identities.');
  delete config.account_id;
  config.name+='-local';
  config.d1_databases[0].database_id='00000000-0000-4000-8000-000000000001';
  config.d1_databases[0].database_name+='-local';
  delete config.services; // localhost auth uses the existing private local outbox, never email.
  config.workers_dev=false;
  config.observability.enabled=false;
  return config;
 }
 if(typeof accountId!=='string'||!/^[a-f0-9]{32}$/i.test(accountId)||/^0+$/.test(accountId))throw Error('Explicit verified Cloudflare account ID required (32 hex).');
 if(typeof mailer!=='string'||!/^[a-z0-9][a-z0-9-]{2,62}$/.test(mailer)||['tvattligan','tvattligan-master-test',config.name].includes(mailer))throw Error('Separate approved mailer service required.');
 config.account_id=accountId;
 config.d1_databases[0].database_id=arenaDatabaseId;
 config.services=[{binding:'ARENA_MAILER',service:mailer}];
 if(mailerEntrypoint!==undefined){
  if(mailerEntrypoint!=='ArenaMailer')throw Error('Only the reviewed ArenaMailer entrypoint is supported.');
  config.services[0].entrypoint=mailerEntrypoint;
  config.services[0].props={caller:config.name};
 }
 const result=inspectArenaPilotConfig(config,{worker:config.name,arenaDatabaseId});
 if(!result.ok)throw Error(result.errors.join('\n'));
 return config;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const args=process.argv.slice(2),options={root:resolve(import.meta.dirname,'..')};
  for(let i=0;i<args.length;i++){
   const key=args[i];
   if(key==='--local'){if(options.local)throw Error('Duplicate local flag.');options.local=true;continue;}
   const field={'--account-id':'accountId','--arena-db':'arenaDatabaseId','--mailer':'mailer','--mailer-entrypoint':'mailerEntrypoint'}[key];
   if(!field||options[field]!==undefined||!args[i+1]||args[i+1].startsWith('--'))throw Error('Usage: node scripts/arena-pilot-config.mjs --local OR --account-id <verified-id> --arena-db <NEW-uuid> --mailer <approved-service> [--mailer-entrypoint ArenaMailer]');
   options[field]=args[++i];
  }
  const template=JSON.parse(readFileSync(resolve(options.root,'wrangler.arena-pilot.jsonc'),'utf8'));
  const config=prepareArenaPilotConfig(template,options);
  const file=resolve(options.root,'.arena-pilot',options.local?'local.json':'pilot.json');
  mkdirSync(dirname(file),{recursive:true});
  writeFileSync(file,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(`LOCAL config written: ${file}. No remote action. ${options.local?'Rehearsal only; NOT deployable.':'Remote resources/ownership still require verification.'}`);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
