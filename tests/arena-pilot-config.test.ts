import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {expect,it} from 'vitest';
import {prepareArenaPilotConfig} from '../scripts/arena-pilot-config.mjs';
import {inspectArenaPilotConfig} from '../scripts/arena-release-preflight.mjs';
const template=JSON.parse(readFileSync(new URL('../wrangler.arena-pilot.jsonc',import.meta.url),'utf8'));
const options={root:process.cwd(),accountId:'1234567890abcdef1234567890abcdef',arenaDatabaseId:'12345678-1234-4234-8234-123456789abc',mailer:'arenan-approved-mailer'};
it('prepares only the standalone pilot with explicit identities, without changing template or MASTER',()=>{
 const original=JSON.stringify(template),master=readFileSync('wrangler.jsonc','utf8');
 const c=prepareArenaPilotConfig(template,options);
 expect(c.name).toBe('arenan-pilot-vd-20261019');expect(c.account_id).toBe(options.accountId);
 expect(c.d1_databases).toHaveLength(1);expect(c.d1_databases[0].binding).toBe('ARENA_DB');
 expect(c.main).toBe(resolve('worker/index.ts'));expect(c.assets.directory).toBe(resolve('dist/client'));
 expect(inspectArenaPilotConfig(c,{worker:c.name,arenaDatabaseId:options.arenaDatabaseId}).ok).toBe(true);
 expect(JSON.stringify(template)).toBe(original);expect(readFileSync('wrangler.jsonc','utf8')).toBe(master);
});
it('fails closed on unresolved identities and every known existing D1',()=>{
 expect(()=>prepareArenaPilotConfig(template,{root:process.cwd()})).toThrow();
 for(const arenaDatabaseId of ['REQUIRED_NEW_PILOT_D1_UUID','00000000-0000-4000-8000-000000000001','695033b7-6bb2-47a3-a9c3-08d4ca818088','ca2d4bb8-0c28-47b7-9514-8c893ea47c09','767b5a12-6b40-4516-9f7c-e072c1130480'])expect(()=>prepareArenaPilotConfig(template,{...options,arenaDatabaseId})).toThrow();
 for(const mailer of ['REQUIRED_APPROVED_MAILER_SERVICE','tvattligan-master-test','arenan-pilot-vd-20261019'])expect(()=>prepareArenaPilotConfig(template,{...options,mailer})).toThrow();
});
it('local rehearsal has no account, remote ID or service, and cannot pass deploy preflight',()=>{
 const c=prepareArenaPilotConfig(template,{root:process.cwd(),local:true});
 expect(c.account_id).toBeUndefined();expect(c.services).toBeUndefined();expect(c.vars.ARENA_ONLY).toBe('1');
 expect(c.d1_databases).toHaveLength(1);expect(inspectArenaPilotConfig(c,{worker:c.name,arenaDatabaseId:c.d1_databases[0].database_id}).ok).toBe(false);
 expect(()=>prepareArenaPilotConfig(template,{...options,local:true})).toThrow();
});
it('supports the isolated named mailer without changing generic existing mailer bindings',()=>{
 const config=prepareArenaPilotConfig(template,{...options,mailer:'arenan-mailer-pilot',mailerEntrypoint:'ArenaMailer'});
 expect(config.services).toEqual([{binding:'ARENA_MAILER',service:'arenan-mailer-pilot',entrypoint:'ArenaMailer',props:{caller:'arenan-pilot-vd-20261019'}}]);
 expect(prepareArenaPilotConfig(template,options).services).toEqual([{binding:'ARENA_MAILER',service:options.mailer}]);
 expect(()=>prepareArenaPilotConfig(template,{...options,mailerEntrypoint:'Unreviewed'})).toThrow();
});
