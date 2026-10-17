import {afterEach,expect,it,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectArenaBackup,inspectArenaDatabase} from '../scripts/arena-pilot-database.mjs';
import {verifyLocalArenaRestore,sha256,runLocalWrangler} from '../scripts/arena-pilot-restore-check.mjs';
const roots:string[]=[];
const sql='CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT UNIQUE);';
afterEach(()=>{roots.splice(0).forEach(p=>rmSync(p,{recursive:true,force:true}));});
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'arena-restore-test-'));roots.push(root);mkdirSync(join(root,'migrations-arena'));writeFileSync(join(root,'migrations-arena/0001_test.sql'),'-- fixture');writeFileSync(join(root,'wrangler.arena-pilot.jsonc'),readFileSync(new URL('../wrangler.arena-pilot.jsonc',import.meta.url)));
 const backupPath=join(root,'source.sql');writeFileSync(backupPath,sql);return {root,backupPath,expectedSha256:sha256(sql),allowEmpty:true};
}
function runner(mode='normal'){
 return vi.fn((_root:string,args:string[])=>{
  expect(args).toContain('--local');expect(args).not.toContain('--remote');
  if(args.includes('--file')){
   if(mode==='import-error')throw Error('failed import');
   const state=args[args.indexOf('--persist-to')+1],folder=join(state,'v3/d1/miniflare-D1DatabaseObject');mkdirSync(folder,{recursive:true});
   const db=new DatabaseSync(join(folder,'local.sqlite'));try{
    if(mode==='normal')db.exec(readFileSync(args[args.indexOf('--file')+1],'utf8'));
    if(mode==='mismatch')db.exec(sql+"INSERT INTO d1_migrations VALUES(1,'unexpected');");
   }finally{db.close();}
   if(mode==='corrupt-file')writeFileSync(join(folder,'local.sqlite'),'broken SQLite file');
   return [{success:true,results:[]}];
  }
  return [{success:true,results:args.includes('PRAGMA quick_check')?[{quick_check:mode==='bad-quick'?'corrupt':'ok'}]:mode==='bad-fk'?[{table:'synthetic',rowid:1}]:[]}];
 });
}
it('requires an actual import into fresh state, full integrity and equal schema/rows before recording PASS',()=>{
 const f=fixture(),run=runner();const proof=verifyLocalArenaRestore({...f,run});expect(proof).toMatchObject({importExecuted:true,fullIntegrity:'ok',foreignKeys:'ok',schemaAndRowsEqual:true,tables:1,rows:0,remoteActions:0});
 expect(run.mock.calls[0][1]).toContain('--file');expect(run).toHaveBeenCalledTimes(3);expect(existsSync(join(f.root,'.arena-pilot/restore-proof.json'))).toBe(true);
});
it.each(['omitted','mismatch','bad-quick','bad-fk','import-error','corrupt-file'])('refuses %s, never treats an automatically created empty D1 as a successful restore',mode=>{
 const f=fixture();expect(()=>verifyLocalArenaRestore({...f,run:runner(mode)})).toThrow();expect(existsSync(join(f.root,'.arena-pilot/restore-proof.json'))).toBe(false);
});
it('refuses changed source hash before running Wrangler and removes an old green receipt',()=>{
 const f=fixture();mkdirSync(join(f.root,'.arena-pilot'));writeFileSync(join(f.root,'.arena-pilot/restore-proof.json'),'old pass');const run=runner();expect(()=>verifyLocalArenaRestore({...f,expectedSha256:'0'.repeat(64),run})).toThrow(/SHA-256/);expect(run).not.toHaveBeenCalled();expect(existsSync(join(f.root,'.arena-pilot/restore-proof.json'))).toBe(false);
});
it('keeps fingerprints independent of insertion order but detects changed data or constraints',()=>{
 const schema='CREATE TABLE arena_stations(id TEXT PRIMARY KEY,name TEXT);',a=inspectArenaBackup(schema+"INSERT INTO arena_stations VALUES('a','Åsa'),('b','Bo');"),b=inspectArenaBackup(schema+"INSERT INTO arena_stations VALUES('b','Bo'),('a','Åsa');");
 expect(a.fingerprint).toBe(b.fingerprint);expect(inspectArenaBackup(schema+"INSERT INTO arena_stations VALUES('a','changed'),('b','Bo');").fingerprint).not.toBe(a.fingerprint);
 expect(inspectArenaBackup(schema.replace('PRIMARY KEY','UNIQUE')+"INSERT INTO arena_stations VALUES('a','Åsa'),('b','Bo');").fingerprint).not.toBe(a.fingerprint);
});
it('full offline checks reject foreign-key corruption even with foreign_keys disabled during loading',()=>{
 const db=new DatabaseSync(':memory:');try{db.exec("PRAGMA foreign_keys=OFF;CREATE TABLE arena_stations(id TEXT PRIMARY KEY);CREATE TABLE arena_children(id TEXT REFERENCES arena_stations(id));INSERT INTO arena_children VALUES('missing');");expect(()=>inspectArenaDatabase(db)).toThrow(/foreign/);}finally{db.close();}
});
it('local runner rejects remote and implicit configuration before spawning a command',()=>{
 expect(()=>runLocalWrangler('.', ['d1','execute','ARENA_DB','--remote'])).toThrow();expect(()=>runLocalWrangler('.', ['d1','execute','ARENA_DB','--local'])).toThrow();
});
