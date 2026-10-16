import { DatabaseSync } from "node:sqlite";
import { readFileSync,readdirSync } from "node:fs";
import { fixture } from "./fixture";
import { randomToken } from "../shared/arena-crypto";

export function arenaFixture() {
  const base=fixture(),arena=new DatabaseSync(":memory:");arena.exec("PRAGMA foreign_keys=ON");
  // SQLite trigger clocks otherwise bypass Vitest/fixture time and make valid
  // synthetic invitations expire as the host date advances. Only this memory
  // schema substitutes the clock; shipped migration SQL stays unchanged.
  arena.function('arena_test_now',()=>new Date().toISOString());
  for(const name of readdirSync(new URL("../migrations-arena/",import.meta.url)).filter(n=>n.endsWith(".sql")).sort())arena.exec(readFileSync(new URL(`../migrations-arena/${name}`,import.meta.url),"utf8").replaceAll("strftime('%Y-%m-%dT%H:%M:%fZ','now')",'arena_test_now()'));
  const prepare=(sql:string)=>{
    // Vitest's fake clock also controls the SQLite clock at statement execution.
    const compile=()=>arena.prepare(sql.replaceAll("strftime('%Y-%m-%dT%H:%M:%fZ','now')",`'${new Date().toISOString()}'`));
    let values:(string|number|null|Uint8Array)[]=[];
    const statement={bind:(...v:(string|number|null|ArrayBuffer)[])=>{if(v.length>100)throw new Error("D1 parameter limit exceeded");values=v.map(x=>x instanceof ArrayBuffer ? new Uint8Array(x):x);return statement;},first:async()=>compile().get(...values)??null,all:async()=>({results:compile().all(...values),success:true,meta:{}}),run:async()=>/^\s*(SELECT|WITH)\b/i.test(sql) ? {results:compile().all(...values),meta:{changes:0},success:true}:{results:[],meta:{changes:Number(compile().run(...values).changes)},success:true}};
    return statement;
  };
  let queue:Promise<unknown>=Promise.resolve();base.env.STATION_ID="mastertest";base.env.ARENA_AUTH_DEV="1";base.env.ARENA_SUPERADMIN_SECRET=randomToken();
  base.env.ARENA_DB={prepare,batch:(statements:ReturnType<typeof prepare>[])=>{const task=queue.then(async()=>{arena.exec("BEGIN");try{const result=[];for(const s of statements)result.push(await s.run());arena.exec("COMMIT");return result;}catch(e){arena.exec("ROLLBACK");throw e;}});queue=task.catch(()=>undefined);return task;}} as unknown as D1Database;
  const cookie=(response:Response)=>response.headers.get("Set-Cookie")?.split(";")[0]??"";
  const superLogin=async()=>{const r=await base.call("/arena/auth/superadmin/login","POST",{secret:base.env.ARENA_SUPERADMIN_SECRET});if(r.status!==200)throw new Error(`Superadmin fixture login: ${r.status}`);return cookie(r);};
  const stationAdmin=async(displayCookie:string,superCookie?:string)=>{const session=await base.call('/arena/auth/session','GET',undefined,displayCookie);const station=(await session.json() as {station:{id:string}}).station.id;const sa=superCookie??await superLogin(),pin='483921';const reset=await base.call(`/arena/superadmin/stations/${station}/admin-pin`,'POST',{new_pin:pin,confirm_pin:pin},sa);if(reset.status!==200)throw Error(`Fixture PIN reset: ${reset.status}`);const unlock=await base.call('/arena/auth/admin-access/unlock','POST',{pin},displayCookie);if(unlock.status!==200)throw Error(`Fixture PIN unlock: ${unlock.status}`);return displayCookie+'; '+cookie(unlock);};
  return {...base,arena,cookie,superLogin,stationAdmin,close:()=>{base.db.close();arena.close();}};
}
