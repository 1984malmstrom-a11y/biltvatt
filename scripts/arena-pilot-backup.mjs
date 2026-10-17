// Trusted operator-owned D1 exports only. All validation is in disposable memory.
// Never accesses remote D1; never changes the input dump; output contains private data.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const identifier=value=>'"'+value.replaceAll('"','""')+'"';
export function verifyArenaPilotBackup(sql,{allowEmpty=false}={}){
 const db=new DatabaseSync(':memory:');
 try{
  // Export table order is not guaranteed. Validate references AFTER full load.
  db.exec('PRAGMA foreign_keys=OFF');db.exec(sql);
  const tables=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name").all();
  if(tables.some(t=>!t.name.startsWith('arena_')&&t.name!=='d1_migrations'))throw Error('Non-Arena business tables are not approved.');
  if(!tables.some(t=>t.name==='arena_stations')&&!(allowEmpty&&tables.every(t=>t.name==='d1_migrations')))throw Error('Not an Arena backup (or explicitly empty new pilot).');
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Backup integrity or foreign keys failed.');
  const restore=['PRAGMA defer_foreign_keys=ON;',...tables.map(t=>t.sql+';')];
  let rowCount=0;
  for(const table of tables){
   const columns=db.prepare(`PRAGMA table_xinfo(${identifier(table.name)})`).all().filter(c=>c.hidden===0).map(c=>identifier(c.name));
   // SQLite quote(TEXT) truncates at NUL. Hex-encoded TEXT preserves all UTF-8 bytes.
   const rows=db.prepare(`SELECT ${columns.map(c=>`CASE WHEN typeof(${c})='text' THEN 'CAST(X''' || hex(${c}) || ''' AS TEXT)' ELSE quote(${c}) END`).join(',')} FROM ${identifier(table.name)}`).all();
   for(const row of rows)restore.push(`INSERT INTO ${identifier(table.name)} (${columns.join(',')}) VALUES (${Object.values(row).join(',')});`);
   rowCount+=rows.length;
  }
  const objects=db.prepare("SELECT sql FROM sqlite_master WHERE type IN ('index','trigger','view') AND sql IS NOT NULL ORDER BY CASE type WHEN 'view' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,name").all();
  restore.push(...objects.map(o=>o.sql+';'),'PRAGMA defer_foreign_keys=OFF;');
  return {restoreSql:restore.join('\n')+'\n',report:{status:'PASS',tables:tables.length,rows:rowCount,integrity:'ok',foreignKeys:'ok',remoteActions:0}};
 }finally{db.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const args=process.argv.slice(2);
  if(![3,4].includes(args.length)||args[1]!=='--restore-output'||(args.length===4&&args[3]!=='--allow-empty'))throw Error('Usage: node scripts/arena-pilot-backup.mjs <trusted-private-export.sql> --restore-output <NEW-private-restore.sql> [--allow-empty]');
  if(resolve(args[0])===resolve(args[2]))throw Error('Never overwrite the original backup.');
  const {restoreSql,report}=verifyArenaPilotBackup(readFileSync(args[0],'utf8'),{allowEmpty:args.includes('--allow-empty')});
  writeFileSync(args[2],restoreSql,{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({...report,privateRestoreFile:resolve(args[2]),originalUnchanged:true}));
 }catch(error){console.error('Backup validation/output failed; STOP. '+(error.code==='EEXIST'?'Output already exists.':'Check trusted input, schema, FK and private output path.'));process.exitCode=1;}
}
