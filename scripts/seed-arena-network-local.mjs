// Local-only demo. This command cannot select a remote database or a live station config.
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync} from "node:fs";
import {resolve,join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {stripTypeScriptTypes} from "node:module";
const root=resolve(import.meta.dirname,"..");
const args=process.argv.slice(2);
if(args.length && (args.length!==2 || args[0]!=="--persist-to"))throw new Error("Endast --persist-to för en lokal arbetskatalog är tillåtet.");
const config=JSON.parse(readFileSync(join(root,"wrangler.jsonc"),"utf8"));
if(config.vars?.STATION_ID!=="mastertest" || !config.d1_databases.some(d=>d.binding==="ARENA_DB" && d.database_name==="arena-master-test"))throw new Error("Demon kräver mastertest-konfigurationen.");
const persist=resolve(args[1]??join(root,".wrangler/state"));
const cryptoCode=stripTypeScriptTypes(readFileSync(join(root,"shared/arena-crypto.ts"),"utf8"));
const {randomToken,passwordHash}=await import(`data:text/javascript;base64,${Buffer.from(cryptoCode).toString("base64")}`);
const password=randomToken(),credential=await passwordHash(password),now=new Date().toISOString();
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const day=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const month=day.slice(0,7),first=new Date(`${month}-01T12:00:00Z`),next=new Date(first);next.setUTCMonth(next.getUTCMonth()+1);
const midnight=d=>{const text=d.toISOString().slice(0,10),base=Date.parse(`${text}T00:00:00Z`),hour=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Stockholm",hour:"2-digit",hourCycle:"h23"}).format(new Date(base-7200000)));return new Date(base-((hour+2)%24)*3600000).toISOString();};
const products=["Biltvätt","Korv med mos","Två för 25","Kaffe + bulle","Spolarvätska","Räksallad","Två för 30"];
const stations=[["tingsryd","Tingsryd","integrated"],["karlshamn","Karlshamn","integrated"],["karlskrona","Karlskrona","integrated"],["malmo","Malmö","arena"]];
const sql=[];
for(const [key,name,kind] of stations){
  const station=`local-demo-${key}`;
  sql.push(`INSERT OR IGNORE INTO arena_stations(id,station_key,name,status,kind,created_at,updated_at) VALUES(${quote(station)},${quote(station)},${quote(`${name} · lokal demo`)},'active',${quote(kind)},${quote(now)},${quote(now)});`);
  for(const [i,seller] of ["Peter","Alva","Jonas"].entries())sql.push(`INSERT OR IGNORE INTO arena_sellers(id,station_id,external_staff_id,source,name,color,active,created_at,updated_at) VALUES(${quote(`${station}:seller-${i}`)},${quote(station)},${kind==="arena" ? "NULL":quote(`${key}:demo-${i}`)},${quote(kind==="arena" ? "arena":"station")},${quote(seller)},'#49caff',1,${quote(now)},${quote(now)});`);
  for(const [i,name] of products.entries())sql.push(`INSERT OR IGNORE INTO arena_activities(id,station_id,name,offer_text,price_text,points,tb_ore,display_mode,category,sort_order,active,created_at,updated_at) VALUES(${quote(`${station}:activity-${i}`)},${quote(station)},${quote(name)},${quote(i===0 ? "Finast Plus":"")},'',${i===0 ? 2:1},${i===0 ? 3500:1250},'points',${quote(i%2 ? "Mat":"Bilvård")},${i},1,${quote(now)},${quote(now)});`);
  for(let i=0;i<18+stations.findIndex(s=>s[0]===key)*2;i++){
    const activity=i%7,at=new Date(Date.now()-(i+1)*60000).toISOString(),id=`${station}:sale:${day}:${i}`;
    sql.push(`INSERT OR IGNORE INTO arena_registrations(id,station_id,seller_id,activity_id,request_id,points_awarded,tb_ore_awarded,registered_at,created_at) VALUES(${quote(id)},${quote(station)},${quote(`${station}:seller-${i%3}`)},${quote(`${station}:activity-${activity}`)},${quote(id)},${activity===0 ? 2:1},${activity===0 ? 3500:1250},${quote(at)},${quote(at)});`);
  }
  sql.push(`INSERT OR IGNORE INTO arena_campaigns(id,station_id,name,activity_id,start_at,end_at,target_count,target_points,active,created_at,updated_at) VALUES(${quote(`${station}:focus:${month}`)},${quote(station)},'MÅNADENS FOKUS',${quote(`${station}:activity-0`)},${quote(midnight(first))},${quote(midnight(next))},100,200,1,${quote(now)},${quote(now)});`);
  sql.push(`INSERT OR IGNORE INTO arena_station_goals(id,station_id,period_type,start_date,end_date,target_points,created_at,updated_at) VALUES(${quote(`${station}:goal:${month}`)},${quote(station)},'month',${quote(`${month}-01`)},${quote(new Date(next.getTime()-86400000).toISOString().slice(0,10))},1000,${quote(now)},${quote(now)});`);
}
sql.push(`INSERT INTO arena_station_accounts(station_id,email_normalized,password_hash,password_salt,password_iterations,created_at) VALUES('local-demo-malmo','arena-demo-malmo@example.test',${quote(credential.hash)},${quote(credential.salt)},${credential.iterations},${quote(now)}) ON CONFLICT(station_id) DO UPDATE SET password_hash=excluded.password_hash,password_salt=excluded.password_salt,password_iterations=excluded.password_iterations;`);
sql.push(`INSERT OR IGNORE INTO arena_groups(id,name,created_at,updated_at) VALUES('local-demo-sydost','Sydost · lokal demo',${quote(now)},${quote(now)});`);
for(const [key] of stations)sql.push(`INSERT OR IGNORE INTO arena_group_members(group_id,station_id,joined_at) VALUES('local-demo-sydost',${quote(`local-demo-${key}`)},${quote(now)});`);
const scratch=mkdtempSync(join(tmpdir(),"arena-network-demo-"));
try{const file=join(scratch,"demo.sql");writeFileSync(file,sql.join("\n"),{mode:0o600});const result=spawnSync(process.execPath,["node_modules/wrangler/wrangler-dist/cli.js","d1","execute","ARENA_DB","--local","--persist-to",persist,"--config","wrangler.jsonc","--file",file],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:"false"},stdio:"inherit"});if(result.status!==0)process.exitCode=result.status||1;else{mkdirSync(persist,{recursive:true});const credentials=join(persist,"arena-demo-credentials.json");writeFileSync(credentials,JSON.stringify({email:"arena-demo-malmo@example.test",password}),{mode:0o600});console.log(`Fyra lokala demostationer skapade. Lokalt Malmö-konto: ${credentials}. Ingen remote seed.`);}}finally{rmSync(scratch,{recursive:true,force:true});}
