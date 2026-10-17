// Full offline integrity/FK + deterministic, non-PII schema/row fingerprints.
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const hash=value=>createHash('sha256').update(value).digest('hex');
const ident=value=>'"'+value.replaceAll('"','""')+'"';
function encode(value){
 if(value===null)return ['null'];
 if(typeof value==='bigint')return ['integer',value.toString()];
 if(value instanceof Uint8Array)return ['blob',Buffer.from(value).toString('hex')];
 return [typeof value,value];
}
export function inspectArenaDatabase(db,{allowEmpty=false}={}){
 const integrity=db.prepare('PRAGMA integrity_check').all();
 if(integrity.length!==1||integrity[0].integrity_check!=='ok')throw Error('Full SQLite integrity check failed.');
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Backup foreign keys failed.');
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name").all();
 if(tables.some(t=>!t.name.startsWith('arena_')&&t.name!=='d1_migrations'))throw Error('Non-Arena business tables are not approved.');
 if(!tables.some(t=>t.name==='arena_stations')&&!(allowEmpty&&tables.every(t=>t.name==='d1_migrations')))throw Error('Not an Arena backup (or explicitly empty new pilot).');
 const details=tables.map(({name})=>{
  const statement=db.prepare(`SELECT * FROM ${ident(name)}`);statement.setReadBigInts(true);
  const rows=statement.all().map(row=>hash(JSON.stringify(Object.entries(row).map(([key,value])=>[key,encode(value)])))).sort();
  return {name,rows:rows.length,digest:hash(JSON.stringify(rows))};
 });
 const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY type,name").all();
 return {status:'PASS',tables:tables.length,rows:details.reduce((n,t)=>n+t.rows,0),integrity:'ok',foreignKeys:'ok',fingerprint:hash(JSON.stringify({schema,details})),tableDetails:details};
}
export function inspectArenaBackup(sql,options={}){
 const db=new DatabaseSync(':memory:');
 try{db.exec('PRAGMA foreign_keys=OFF');db.exec(sql);return inspectArenaDatabase(db,options);}finally{db.close();}
}
