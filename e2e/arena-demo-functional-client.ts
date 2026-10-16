import {fork} from 'node:child_process';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import type {demoFunctionalFixture} from '../tests/arena-demo-functional-fixture';
import type {Competition} from '../shared/arena-competitions';
import type {ArenaStats} from '../shared/arena';

type Local=Awaited<ReturnType<typeof demoFunctionalFixture>>;
export async function isolatedDemoBackend(){
 const root='/workspace/work/arena-demo-functional-qa/runtime';await mkdir(root,{recursive:true});
 const entry=new URL('../tests/arena-demo-functional-server.ts',import.meta.url).pathname;
 // Both reused SQLite fixtures resolve ../migrations relative to tests/.
 await build({entryPoints:[entry],outfile:`${root}/server.mjs`,bundle:true,platform:'node',format:'esm',packages:'external',define:{'import.meta.url':JSON.stringify(new URL('../tests/arena-fixture.ts',import.meta.url).href)},logLevel:'silent'});
 const child=fork(`${root}/server.mjs`,[],{stdio:['ignore','ignore','inherit','ipc']});
 let sequence=0;const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
 child.on('message',(m:any)=>{const p=pending.get(m.id);if(!p)return;pending.delete(m.id);if(m.error)p.reject(new Error(m.error));else p.resolve(m.result);});
 child.on('exit',code=>{for(const p of pending.values())p.reject(new Error(`Isolated test backend exited: ${code}`));pending.clear();});
 const request=(kind:string,args:unknown={})=>new Promise<any>((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});child.send({id,kind,args});});
 let data;try{data=await request('init');}catch(error){child.disconnect();child.kill();throw error;}
 return {...data,cookies:{[data.station]:'station',[data.opponent]:'opponent'},owner:'owner',stationAdmin:'stationAdmin',now:()=>data.now as number,
  setNow:(value:string|number)=>request('time',{value}),
  stats:()=>request('stats') as ReturnType<Local['stats']>,all:()=>request('all') as ReturnType<Local['all']>,view:(id:string)=>request('view',{id}) as Promise<Competition>,
  person:(c:Competition,id=data.viktor)=>c.entries!.find(e=>e.id===id)!,team:(c:Competition,id=data.station)=>c.entries!.find(e=>e.id===id)!,
  inspect:(kind:string,id?:string)=>request('inspect',{kind,id}),
  call:async(path:string,method='GET',body?:unknown,role='station',_headers?:unknown)=>{const r=await request('call',{path,method,data:body,role});return new Response(Buffer.from(r.body,'base64'),{status:r.status,headers:{'Content-Type':r.contentType??'application/json'}});},
  close:async()=>{try{await request('close');}finally{child.disconnect();child.kill();}},
 };
}
