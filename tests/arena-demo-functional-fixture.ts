import {contestFixture,contestDraft} from './arena-contest-v2-fixture';
import {competitionView} from '../worker/arena-competitions';
import type {CompetitionInput,Competition} from '../shared/arena-competitions';
import type {ArenaStats} from '../shared/arena';

/* Real Worker handlers and the existing D1 adapter, exclusively SQLite :memory:.
   Only time, synthetic initial records and authentication sessions are fixtures. */
export async function demoFunctionalFixture() {
 const RealDate=globalThis.Date;
 let instant=RealDate.parse('2026-10-16T08:00:00.000Z');
 globalThis.Date=new Proxy(RealDate,{
  construct:(target,args)=>Reflect.construct(target,args.length?args:[instant]),
  get:(target,key)=>key==='now'?()=>instant:Reflect.get(target,key),
 });
 let f:Awaited<ReturnType<typeof contestFixture>>|undefined;
 try {
  f=await contestFixture();const base=f;
  const station='o1:s0',opponent='o1:s1',viktor=`${station}:person`,alva=`${station}:alva`;
  const at=()=>new Date().toISOString();
  const setNow=(value:string|number)=>{instant=typeof value==='number'?value:RealDate.parse(value);};
  base.arena.prepare('UPDATE arena_stations SET name=? WHERE id=?').run('Tingsryd',station);
  base.arena.prepare('UPDATE arena_stations SET name=? WHERE id=?').run('Ronneby',opponent);
  base.arena.prepare('UPDATE arena_sellers SET name=? WHERE id=?').run('Viktor',viktor);
  base.arena.prepare("INSERT INTO arena_sellers(id,station_id,name,source,created_at,updated_at) VALUES(?,?,?,'arena',?,?)").run(alva,station,'Alva',at(),at());
  const products=[['wash','Biltvätt'],['food','Korv med mos'],['drink','Två för 25'],['fika','Kaffe + bulle'],['car-care','Spolarvätska'],['other','Räksallad'],['campaign','Två för 30']] as const;
  for(const sid of Object.keys(base.cookies))for(const [i,[cat,name]] of products.entries()){
   base.arena.prepare('INSERT INTO arena_activities(id,station_id,name,points,tb_ore,arena_category_id,sort_order,created_at,updated_at) VALUES(?,?,?,1,3500,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,points=1,arena_category_id=excluded.arena_category_id,sort_order=excluded.sort_order').run(`${sid}:${cat}`,sid,name,cat,i,at(),at());
  }
  async function create(d:CompetitionInput){
   const r=await base.call('/arena/superadmin/competitions','POST',d,base.owner);
   if(r.status!==201)throw Error(`Create synthetic contest: ${r.status} ${await r.text()}`);
   return (await r.json() as {id:string}).id;
  }
  const internalDraft=contestDraft('individual');Object.assign(internalDraft,{name:'TEST · Tingsryd biltvätt oktober',station_ids:[station],start_day:'2026-10-16',end_day:'2026-10-31'});Object.assign(internalDraft.contest!,{level:'local',categories:[{id:'wash',name:'',points_milli:1000}]});
  const internal=await create(internalDraft);
  const nationalDraft=contestDraft('individual');Object.assign(nationalDraft,{name:'TEST · Nationell individ',station_ids:['o1:s0','o1:s1','o1:s2','o1:s3'],start_day:'2026-10-16',end_day:'2026-10-31'});Object.assign(nationalDraft.contest!,{level:'national',categories:[{id:'wash',name:'',points_milli:2000},{id:'fika',name:'',points_milli:1000},{id:'food',name:'',points_milli:1000}]});
  const nationalPerson=await create(nationalDraft);
  const stationDraft=structuredClone(nationalDraft);stationDraft.name='TEST · Nationella stationer FAIR PLAY';stationDraft.request_id=crypto.randomUUID();stationDraft.contest!.kind='station';stationDraft.contest!.fair_play={reference_milli:800000,max_factor_milli:4000,confirmed:true};
  const nationalStation=await create(stationDraft);
  // Historical setup only. All sales exercised by the browser use POST handlers.
  for(const [seller,n] of [[alva,98],[viktor,96]] as const)for(let i=0;i<n;i++){
   const id=crypto.randomUUID(),time=`2026-10-16T09:${String(Math.floor(i/60)).padStart(2,'0')}:${String(i%60).padStart(2,'0')}.000Z`;
   base.arena.prepare('INSERT INTO arena_registrations(id,station_id,seller_id,activity_id,request_id,points_awarded,tb_ore_awarded,registered_at,created_at) VALUES(?,?,?,?,?,1,3500,?,?)').run(id,station,seller,`${station}:wash`,id,time,time);
  }
  setNow('2026-10-16T09:55:00.000Z');
  const stationAdmin=await base.stationAdmin(base.cookies[station]);
  const challengeResponse=await base.call('/admin/arena/challenges','POST',{request_id:crypto.randomUUID(),opponent_id:opponent,day:'2026-10-16',metric:'points',scope:{kind:'category',category_id:'wash'}},stationAdmin);
  const challenge={status:challengeResponse.status,body:await challengeResponse.json()};
  const d=contestDraft('fight');Object.assign(d,{name:'TEST · Tingsryd mot Ronneby',start_day:'2026-10-16',end_day:'2026-10-16'});d.contest!.categories=[{id:'wash',name:'',points_milli:1000},{id:'fika',name:'',points_milli:1000}];
  const duel=await create(d);
  setNow('2026-10-16T09:56:00.000Z');
  const r=await base.call('/arena/registrations','POST',{request_id:crypto.randomUUID(),activity_id:`${opponent}:wash`,seller_id:`${opponent}:person`},base.cookies[opponent]);
  if(r.status!==200)throw Error(`Opponent seed sale: ${r.status} ${await r.text()}`);
  setNow('2026-10-16T10:00:00.000Z');
  const stats=async()=>{const r=await base.call('/arena/stats?period=today','GET',undefined,base.cookies[station]);if(r.status!==200)throw Error(`Stats: ${r.status} ${await r.text()}`);return await r.json() as ArenaStats;};
  const view=(id:string)=>competitionView(base.env.ARENA_DB!,id,station);
  const all=async()=>({internal:await view(internal),nationalPerson:await view(nationalPerson),nationalStation:await view(nationalStation),duel:await view(duel),stats:await stats()});
  const person=(c:Competition,id=viktor)=>c.entries!.find(e=>e.id===id)!;
  const team=(c:Competition,id=station)=>c.entries!.find(e=>e.id===id)!;
  return {...base,station,opponent,viktor,alva,stationAdmin,ids:{internal,nationalPerson,nationalStation,duel},challenge,now:()=>instant,setNow,stats,all,view,person,team,close:()=>{base.close();globalThis.Date=RealDate;}};
 }catch(error){f?.close();globalThis.Date=RealDate;throw error;}
}
