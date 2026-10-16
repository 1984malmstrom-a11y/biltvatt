import type {ArenaBootstrap,ArenaStats,ArenaRegistration,ArenaActivity,ArenaPerson} from '../shared/arena';
import type {ArenaFightSummary} from '../shared/arena-fights';
import {fightLeaders} from '../shared/arena-fights';
import {evaluateArenaAchievements,type AchievementSnapshot} from '../shared/arena-achievements';
import {contestSalePoints,type ContestRules} from '../shared/arena-contest';
import {arenaLocalSale} from './arena-local-sale';
import {HttpError} from './api';

export const showtimeScenes=['ARENAN VAKNAR','VARJE FÖRSÄLJNING RÄKNAS','NY ETTA','BUTIKSFIGHT STARTAR','SLUTSPURTEN','VINNAREN'] as const;
export const showtimeEpoch=Date.parse('2026-10-19T09:00:00Z');
export const showtimeStation='demo-tingsryd',showtimeOpponent='demo-ronneby';
const productNames=['Biltvätt','Korv med mos','Två för 25','Kaffe + bulle','Spolarvätska','Räksallad','Två för 30'];
const categories=['wash','food','drink','fika','car-care','other','campaign'];
const cast=['Alva','Peter','Maja','Erik','Jonas'];
export const showtimeBootstrap:ArenaBootstrap={station:{id:showtimeStation,name:'Tingsryd · DEMO',kind:'arena'},sellers:cast.map((name,i)=>({id:`demo-${name.toLowerCase()}`,name,external_staff_id:null,color:'#b9d5bf',active:1,avatar_index:i,source:'arena'})),activities:productNames.map((name,i)=>({id:`demo-product-${i}`,name,offer_text:'',price_text:'',points:i===0?2:1,tb_ore:i===0?3500:600,image_key:null,category:categories[i],arena_category_id:categories[i],sort_order:i,active:1,display_mode:'points'})),campaign:{id:'demo-focus',name:'Månadens fokus · Biltvätt',activity_id:'demo-product-0',start_at:'2026-10-01T00:00:00Z',end_at:'2026-11-01T00:00:00Z',target_count:null,target_points:300,active:1}};
type Sale=ArenaRegistration&{request_id:string;station_id:string};
export type ShowtimeReceipt={id:string;seller:string;product:string;internal:number;nationalIndividual:number;nationalStation:number;fight:number};
const national:ContestRules={kind:'station',organization_id:'demo-only',level:'national',categories:[{id:'wash',name:'Biltvätt',points_milli:2000},{id:'fika',name:'Kaffe + bulle',points_milli:1000}],fair_play:{reference_milli:800000,max_factor_milli:4000,confirmed:true},flows:[{id:'demo-flow',station_id:showtimeStation,customers_milli:200000,source:'SIMULERAT EXEMPEL',period_start:'2026-09-01',period_end:'2026-09-30',recorded_at:'2026-10-01T00:00:00Z'}]};
export function showtimeContribution(a:ArenaActivity,station=showtimeStation){const base=national.categories.find(c=>c.id===a.arena_category_id)?.points_milli??0;return {internal:a.points,nationalIndividual:base/1000,nationalStation:base?contestSalePoints(national,station,base)/1000:0};}
// No database, fetch, push, storage, global clock mutation, or hidden production
// fallback. The same receipt, achievement and fixed-point scoring functions used
// by Arena drive this session's wholly synthetic in-memory ledger.
export function createShowtime(){
 let scene=0,now=showtimeEpoch,playing=false,elapsed=0,nextAuto=6000,revision=0,generation=0,disposed=false,serial=0;
 let sales:Sale[]=[],fightStart:number|null=null,fightEnd=0,frozen:ArenaFightSummary|null=null,last:ShowtimeReceipt|null=null;
 const listeners=new Set<()=>void>(),requests=new Map<string,{registration:ArenaRegistration;achievements:ReturnType<typeof evaluateArenaAchievements>}>();
 const emit=()=>{revision++;for(const listener of listeners)listener();};
 const activity=(id:string)=>showtimeBootstrap.activities.find(a=>a.id===id);
 const activeSales=()=>sales.filter(s=>!s.voided_at);
 const qualifies=(a:ArenaActivity)=>['wash','fika','car-care'].includes(a.arena_category_id??'');
 function append(seller:string,a:ArenaActivity,station=showtimeStation,at=now){const id=`demo-sale-${++serial}`,s:Sale={id,request_id:id,station_id:station,seller_id:seller,activity_id:a.id,points_awarded:a.points,tb_ore_awarded:a.tb_ore??null,registered_at:new Date(at).toISOString(),voided_at:null};sales.push(s);return s;}
 const ownRows=(list:Sale[],query=new URLSearchParams())=>{
  const day=new Date(now).toISOString().slice(0,10),start=query.get('period')==='custom'?query.get('start')??day:query.get('period')==='month'?'2026-10-01':query.get('period')==='week'?'2026-10-19':day,end=query.get('period')==='custom'?query.get('end')??day:day;
  let stats:ArenaStats={range:{start,end,from:`${start}T00:00:00Z`,to:`${end}T23:59:59Z`},metric:(query.get('metric')??'points') as ArenaStats['metric'],points:0,count:0,tb_ore:0,today:{count:0,points:0,sellers:0},leaderboard:showtimeBootstrap.sellers.map(s=>({...s,rank:1,points:0,count:0,tb_ore:0,activities:[]})),recent:[],campaign:{...showtimeBootstrap.campaign!,count:0,points:0},personal_goals:[],station_goals:[{id:'demo-monthly-goal',period_type:'month',start_date:'2026-10-01',end_date:'2026-10-31',target_points:500,points:0}]};
  for(const s of [...list].sort((a,b)=>a.registered_at.localeCompare(b.registered_at))){const seller=showtimeBootstrap.sellers.find(p=>p.id===s.seller_id),a=activity(s.activity_id);if(seller&&a)stats=arenaLocalSale(stats,seller,a,s,{activityId:query.get('activity_id')??'',category:query.get('category')??''},new Date(now))!;}
  // The authoritative demo snapshot uses the same rank tie breakers as local sales.
  stats.leaderboard.sort((a,b)=>(stats.metric==='tb'?(b.tb_ore??0)-(a.tb_ore??0):stats.metric==='count'?b.count-a.count:b.points-a.points)||b.points-a.points||b.count-a.count||a.name.localeCompare(b.name,'sv')||a.id.localeCompare(b.id));stats.leaderboard.forEach((p,i)=>p.rank=i+1);
  return stats;
 };
 function fight():ArenaFightSummary|null{
  if(frozen)return structuredClone(frozen);if(fightStart===null)return null;
  const rows=[showtimeStation,showtimeOpponent].map(id=>{const list=activeSales().filter(s=>s.station_id===id&&Date.parse(s.registered_at)>=fightStart!&&Date.parse(s.registered_at)<fightEnd&&qualifies(activity(s.activity_id)!));return {id,name:id===showtimeStation?'Tingsryd':'Ronneby',rank:0,count:list.length,points:list.reduce((n,s)=>n+s.points_awarded,0),tb_ore:list.reduce((n,s)=>n+(s.tb_ore_awarded??0),0),unknown_tb_count:0};}).sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name));rows.forEach((r,i)=>r.rank=i+1);
  const f:ArenaFightSummary={id:'demo-fight',name:'Tingsryd VS Ronneby · DEMO',metric:'points',phase:now>=fightEnd?'finished':'active',standings:rows,version:revision+1,start_at:new Date(fightStart).toISOString(),end_at:new Date(fightEnd).toISOString(),snapshot_at:new Date(now).toISOString(),winner_ids:[],leader_ids:[]};f.leader_ids=fightLeaders(rows,'points');if(f.phase==='finished')f.winner_ids=f.leader_ids;return f;
 }
 function stats(query=new URLSearchParams()){
  const list=activeSales(),s=ownRows(list.filter(s=>s.station_id===showtimeStation),query),f=fight();if(!f)return s;
  const eligible=list.filter(s=>Date.parse(s.registered_at)>=fightStart!&&Date.parse(s.registered_at)<fightEnd&&qualifies(activity(s.activity_id)!));
  const people:ArenaPerson[]=[...ownRows(eligible.filter(s=>s.station_id===showtimeStation)).leaderboard.filter(p=>p.count).map(p=>({...p,station_id:showtimeStation,station_name:'Tingsryd'})),...['demo-sofia','demo-anton'].map((id,i)=>{const rows=eligible.filter(s=>s.station_id===showtimeOpponent&&s.seller_id===id);return {id,name:i?'Anton':'Sofia',station_id:showtimeOpponent,station_name:'Ronneby',external_staff_id:null,color:'#d6c695',active:1,rank:0,count:rows.length,points:rows.reduce((n,r)=>n+r.points_awarded,0),activities:[]};}).filter(p=>p.count)].sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name));people.forEach((p,i)=>p.rank=i+1);
  const recent=eligible.slice(-10).reverse().map(row=>({id:row.id,seller_id:row.seller_id,seller_name:cast.find(n=>`demo-${n.toLowerCase()}`===row.seller_id)??(row.seller_id==='demo-sofia'?'Sofia':'Anton'),station_id:row.station_id,station_name:row.station_id===showtimeStation?'Tingsryd':'Ronneby',activity_name:activity(row.activity_id)!.name,points_awarded:row.points_awarded,registered_at:row.registered_at}));
  return {...s,fight:f,fight_dashboard:{fight_id:f.id,station_ids:[showtimeStation,showtimeOpponent],metric:'points' as const,leaderboard:people,recent},fight_objective:{fight_id:f.id,scope:'category' as const,activity_ids:showtimeBootstrap.activities.filter(qualifies).map(a=>a.id)},battle:{fight_id:f.id,label:'EXEMPELDUELL',categories:showtimeBootstrap.activities.filter(qualifies).map(a=>{const rows=eligible.filter(s=>s.station_id===showtimeStation&&s.activity_id===a.id);return {id:a.arena_category_id!,name:a.name,activities:[a],count:rows.length,points_milli:rows.reduce((n,s)=>n+s.points_awarded*1000,0),tb_ore:rows.reduce((n,s)=>n+(s.tb_ore_awarded??0),0),base_milli:a.points*1000,reward_milli:a.points*1000};})}};
 }
 const achievements=(s:ArenaStats):AchievementSnapshot=>({scopes:[{id:'today:demo',label:'Idag · DEMO',kind:'period',board:s.leaderboard}],goals:[]});
 function register(request_id:string,seller_id:string,activity_id:string){
  if(disposed)throw new HttpError('Demosessionen har avslutats.',410);
  const previous=requests.get(request_id);if(previous){if(previous.registration.seller_id!==seller_id||previous.registration.activity_id!==activity_id)throw new HttpError('Demo-ID används redan.',409);return structuredClone(previous);}
  const a=activity(activity_id);if(!a||!showtimeBootstrap.sellers.some(s=>s.id===seller_id))throw new HttpError('Välj en demosäljare och produkt.',400);
  const before=stats(),registration=append(seller_id,a),after=stats(),result={registration,achievements:evaluateArenaAchievements(achievements(before),achievements(after),seller_id)};
  requests.set(request_id,result);last={id:registration.id,seller:showtimeBootstrap.sellers.find(s=>s.id===seller_id)!.name,product:a.name,...showtimeContribution(a),fight:fightStart!==null&&now<fightEnd&&qualifies(a)?a.points:0};emit();return structuredClone(result);
 }
 function startFight(){if(fightStart!==null)return;fightStart=now;fightEnd=now+2*3600000;for(let i=0;i<62;i++)append('demo-peter',showtimeBootstrap.activities[0],showtimeStation);for(let i=0;i<61;i++)append('demo-sofia',showtimeBootstrap.activities[0],showtimeOpponent);append('demo-anton',showtimeBootstrap.activities[3],showtimeOpponent);emit();}
 function reset(target=0){generation++;scene=Math.max(0,Math.min(5,target));now=showtimeEpoch;elapsed=0;nextAuto=6000;sales=[];serial=0;requests.clear();fightStart=null;fightEnd=0;frozen=null;last=null;
  for(const [i,n] of [17,16,12,10,8].entries())for(let j=0;j<n;j++)append(showtimeBootstrap.sellers[i].id,showtimeBootstrap.activities[0],showtimeStation,now-(n-j)*60000-i*5000);
  if(scene===2)append('demo-peter',showtimeBootstrap.activities[3]);
  if(scene>=4){now+=60000;startFight();now=fightEnd-600000;if(scene===5)append('demo-sofia',showtimeBootstrap.activities[0],showtimeOpponent);}
  emit();
 }
 const totals=()=>{const list=activeSales().filter(s=>s.station_id===showtimeStation);return list.reduce((total,s)=>{const c=showtimeContribution(activity(s.activity_id)!);return {internal:total.internal+c.internal,nationalIndividual:total.nationalIndividual+c.nationalIndividual,nationalStation:total.nationalStation+c.nationalStation};},{internal:0,nationalIndividual:0,nationalStation:0});};
 reset();
 return {subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},get revision(){return revision;},get generation(){return generation;},get scene(){return scene;},get playing(){return playing;},get receipt(){return last?{...last}:null;},get now(){return now;},stats,totals,fight,register,
  play(){if(disposed)return;playing=true;emit();},pause(){playing=false;emit();},go(target:number){if(disposed)return;const was=playing;playing=false;reset(target);playing=was;emit();},restart(){if(disposed)return;playing=false;reset();},startFight,
  urgency(minutes:number){if(fightStart===null||frozen)return;now=fightEnd-Math.max(1,Math.min(120,minutes))*60000;emit();},
  tick(ms:number){if(disposed||!playing||!Number.isFinite(ms)||ms<=0)return;const step=Math.min(ms,1000);now+=step;elapsed+=step;if((scene===1||scene===4)&&elapsed>=nextAuto){const i=Math.floor(nextAuto/6000)-1;nextAuto+=6000;if(scene===4){append('demo-sofia',showtimeBootstrap.activities[i%2?3:0],showtimeOpponent);}else register(`auto:${nextAuto}`,['demo-maja','demo-erik','demo-jonas'][i%3],showtimeBootstrap.activities[i%7].id);}if(fightStart!==null&&now>=fightEnd&&!frozen)frozen=fight();emit();},
  finish(){if(fightStart===null||frozen)return;register('demo-finale','demo-peter',showtimeBootstrap.activities[0].id);now=fightEnd;frozen=fight();playing=false;emit();},
  async request<T>(path:string,options:RequestInit={}):Promise<T>{if(disposed)throw new HttpError('Demosessionen har avslutats.',410);const url=new URL(path,'https://demo.invalid'),method=options.method??'GET';let result:unknown;
   if(method==='GET'&&url.pathname==='/arena/bootstrap')result=showtimeBootstrap;
   else if(method==='GET'&&url.pathname==='/arena/stats')result=stats(url.searchParams);
   else if(method==='POST'&&url.pathname==='/arena/registrations'){const d=JSON.parse(String(options.body??'{}'));if(typeof d.request_id!=='string'||!d.request_id)throw new HttpError('Demo-ID krävs.',400);result=register(d.request_id,d.seller_id,d.activity_id);}
   else if(method==='POST'&&/^\/arena\/registrations\/demo-sale-\d+\/void$/.test(url.pathname)){const d=JSON.parse(String(options.body??'{}')),id=url.pathname.split('/')[3],row=sales.find(s=>s.id===id),receipt=requests.get(d.request_id);if(!row||receipt?.registration.id!==id)throw new HttpError('Demokvittot saknas.',403);if(now-Date.parse(row.registered_at)>300000)throw new HttpError('Ångra inom fem demominuter.',409);row.voided_at=new Date(now).toISOString();receipt!.registration.voided_at=row.voided_at;last=null;emit();result={ok:true};}
   else throw new HttpError('Den här funktionen är inte tillgänglig i demoläge. Inget produktionsanrop gjordes.',403);
   return structuredClone(result) as T;
  },
  dispose(){disposed=true;playing=false;listeners.clear();sales=[];requests.clear();frozen=null;last=null;},
 };
}
export type ShowtimeEngine=ReturnType<typeof createShowtime>;
