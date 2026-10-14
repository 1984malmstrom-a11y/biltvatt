import { DatabaseSync } from "node:sqlite";
import { readFileSync,readdirSync } from "node:fs";
import { fixture } from "./fixture";
import { randomToken } from "../shared/arena-crypto";

export function arenaFixture() {
  const base=fixture(),arena=new DatabaseSync(":memory:");arena.exec("PRAGMA foreign_keys=ON");
  for(const name of readdirSync(new URL("../migrations-arena/",import.meta.url)).filter(n=>n.endsWith(".sql")).sort())arena.exec(readFileSync(new URL(`../migrations-arena/${name}`,import.meta.url),"utf8"));
  const prepare=(sql:string)=>{
    let values:(string|number|null|Uint8Array)[]=[];
    const statement={bind:(...v:(string|number|null|ArrayBuffer)[])=>{if(v.length>100)throw new Error("D1 parameter limit exceeded");values=v.map(x=>x instanceof ArrayBuffer ? new Uint8Array(x):x);return statement;},first:async()=>arena.prepare(sql).get(...values)??null,all:async()=>({results:arena.prepare(sql).all(...values),success:true,meta:{}}),run:async()=>/^\s*(SELECT|WITH)\b/i.test(sql) ? {results:arena.prepare(sql).all(...values),meta:{changes:0},success:true}:{results:[],meta:{changes:Number(arena.prepare(sql).run(...values).changes)},success:true}};
    return statement;
  };
  let queue:Promise<unknown>=Promise.resolve();base.env.STATION_ID="mastertest";base.env.ARENA_SUPERADMIN_SECRET=randomToken();
  base.env.ARENA_DB={prepare,batch:(statements:ReturnType<typeof prepare>[])=>{const task=queue.then(async()=>{arena.exec("BEGIN");try{const result=[];for(const s of statements)result.push(await s.run());arena.exec("COMMIT");return result;}catch(e){arena.exec("ROLLBACK");throw e;}});queue=task.catch(()=>undefined);return task;}} as unknown as D1Database;
  const cookie=(response:Response)=>response.headers.get("Set-Cookie")?.split(";")[0]??"";
  const superLogin=async()=>{const r=await base.call("/arena/auth/superadmin/login","POST",{secret:base.env.ARENA_SUPERADMIN_SECRET});if(r.status!==200)throw new Error(`Superadmin fixture login: ${r.status}`);return cookie(r);};
  return {...base,arena,cookie,superLogin,close:()=>{base.db.close();arena.close();}};
}
