import type {Competition,CompetitionRules} from '../shared/arena-competitions';
import type {ContestRules,ContestEntry,CustomerFlow} from '../shared/arena-contest';
import {contestSalePoints,fairPlayScore} from '../shared/arena-contest';
import {arenaDayStart,arenaNextDay} from '../shared/arena-leagues';
import type {ActivitySnapshot} from './arena-competition-model';
import {fail,text} from './http';
export const isBoardContest=(r:CompetitionRules)=>!!r.contest&&['individual','station'].includes(r.contest.kind);
export function contestInput(value:unknown):ContestRules{
 if(!value||typeof value!=='object'||Array.isArray(value))return fail(400,'Välj giltiga tävlingsregler.');const d=value as Record<string,unknown>;
 if(Object.keys(d).some(k=>!['kind','organization_id','level','region_id','district_id','seller_ids','categories','fair_play'].includes(k)))fail(400,'Frysta deltagare och kunddata får bara sättas av servern.');
 if(!['individual','station','fight','championship'].includes(String(d.kind))||!['local','district','region','national','selected'].includes(String(d.level)))fail(400,'Välj tävlingstyp och nivå.');
 if(!Array.isArray(d.categories)||!d.categories.length||d.categories.length>7)fail(400,'Välj 1–7 matchkategorier.');
 const categories=(d.categories as any[]).map((v:any)=>{if(!v||Object.keys(v).some(k=>!['id','name','points_milli'].includes(k))||!Number.isSafeInteger(v.points_milli)||v.points_milli<0||v.points_milli>10000000)fail(400,'Ange kategori och grundpoäng 0–10 000 med högst tre decimaler.');return {id:text(v.id,'Kategori',120),name:'',points_milli:v.points_milli as number};});
 if(new Set(categories.map(c=>c.id)).size!==categories.length)fail(400,'En kategori får bara förekomma en gång.');
 const r:ContestRules={kind:d.kind as ContestRules['kind'],organization_id:text(d.organization_id,'Organisation',120),level:d.level as ContestRules['level'],categories};
 if(d.region_id)r.region_id=text(d.region_id,'Region',120);if(d.district_id)r.district_id=text(d.district_id,'Distrikt',120);
 if(d.seller_ids!==undefined){if(r.kind!=='individual'||!Array.isArray(d.seller_ids)||!d.seller_ids.length||d.seller_ids.length>5000||d.seller_ids.some(id=>typeof id!=='string'||!id||id.length>120)||new Set(d.seller_ids).size!==d.seller_ids.length)fail(400,'Välj 1–5 000 olika säljare inom deltagarstationerna.');r.seller_ids=d.seller_ids as string[];}
 if(d.fair_play!==undefined){const f=d.fair_play as any;if(r.kind==='individual')fail(400,'Kundflödesjustering stöds inte för individuella tävlingar.');if(!f||Object.keys(f).some(k=>!['reference_milli','max_factor_milli','confirmed'].includes(k))||f.confirmed!==true)fail(400,'Bekräfta tävlingens referenskundflöde och maxfaktor.');try{fairPlayScore(1000,1000,f.reference_milli,f.max_factor_milli);}catch(e){fail(400,(e as Error).message);}r.fair_play={reference_milli:f.reference_milli,max_factor_milli:f.max_factor_milli,confirmed:true};}
 return r;
}
export async function freezeContestRules(db:D1Database,r:CompetitionRules,activities:ActivitySnapshot[]){
 const c=r.contest!;c.locked_at=new Date().toISOString();const categories=(await db.prepare('SELECT id,name FROM arena_activity_categories').all<{id:string;name:string}>()).results;
 for(const cat of c.categories){const canonical=categories.find(v=>v.id===cat.id);if(!canonical)fail(400,'En kategori är inte en kanonisk Arena-kategori.');cat.name=canonical!.name;}
 const selected=activities.filter(a=>c.categories.some(cat=>cat.id===a.arena_category_id));if(selected.length>5000)fail(400,'Tävlingsmappningen får innehålla högst 5 000 lokala aktiviteter.');
 if(r.station_ids.some(station=>c.categories.some(cat=>!selected.some(a=>a.station_id===station&&a.arena_category_id===cat.id))))fail(400,'Varje station måste ha en aktiv lokal mappning för varje vald kategori.');
 if(c.fair_play){
  const flows=(await db.prepare('SELECT * FROM arena_customer_flow f WHERE station_id IN (SELECT value FROM json_each(?)) AND id=(SELECT id FROM arena_customer_flow WHERE station_id=f.station_id ORDER BY recorded_at DESC,id DESC LIMIT 1)').bind(JSON.stringify(r.station_ids)).all<CustomerFlow>()).results;
  if(flows.length!==r.station_ids.length)fail(400,'Verifierat kundsnitt saknas för en deltagarstation.');c.flows=flows;
 }
 if(c.kind==='individual'){
  const people=(await db.prepare("SELECT id,name,station_id FROM arena_sellers WHERE active=1 AND station_id IN (SELECT value FROM json_each(?)) ORDER BY id LIMIT 5001").bind(JSON.stringify(r.station_ids)).all<{id:string;name:string;station_id:string}>()).results;
  c.people=c.seller_ids?people.filter(p=>c.seller_ids!.includes(p.id)):people;
  if(!c.people.length||c.people.length>5000||c.seller_ids&&c.people.length!==c.seller_ids.length)fail(400,'Välj högst 5 000 aktiva säljare som tillhör deltagarstationerna.');
 }
 return selected.map(a=>{const base=c.categories.find(cat=>cat.id===a.arena_category_id)!.points_milli;return {...a,contest_base_milli:base,contest_points_milli:contestSalePoints(c,a.station_id,base)};});
}
export type ContestAggregate={station_id:string;seller_id:string;activity_id:string;count:number;raw_points:number;tb_ore:number;unknown_tb_count:number};
// One grouped ledger query, independent of participant count. Membership and local
// activity IDs come exclusively from the immutable competition snapshot.
export async function contestAggregates(db:D1Database,r:CompetitionRules,activities:ActivitySnapshot[],from:string,to:string,now:string,finished:boolean):Promise<ContestAggregate[]>{
 const seller=r.contest?.kind==='individual'?'r.seller_id':"''";
 return (await db.prepare(`WITH rules AS (SELECT json_extract(value,'$.station_id') station_id,json_extract(value,'$.id') activity_id,json_extract(value,'$.arena_category_id') category_id FROM json_each(?)) SELECT r.station_id,${seller} seller_id,MIN(r.activity_id) activity_id,COUNT(*) count,COALESCE(SUM(r.points_awarded),0) raw_points,COALESCE(SUM(r.tb_ore_awarded),0) tb_ore,SUM(r.tb_ore_awarded IS NULL) unknown_tb_count FROM rules a JOIN arena_registrations r ON r.station_id=a.station_id AND r.activity_id=a.activity_id AND r.registered_at>=? AND r.registered_at<? AND r.registered_at<=? AND (r.voided_at IS NULL OR (?=1 AND r.voided_at>=?)) GROUP BY r.station_id,${seller},a.category_id`).bind(JSON.stringify(activities),from,to,now,finished?1:0,to).all<ContestAggregate>()).results;
}
export function contestEntries(r:CompetitionRules,activities:ActivitySnapshot[],members:{id:string;name:string}[],rows:ContestAggregate[]){
 const c=r.contest!,people=c.kind==='individual'?c.people!:members.map(p=>({...p,station_id:p.id}));
 const entries:ContestEntry[]=people.map(p=>({...p,station_name:members.find(m=>m.id===p.station_id)?.name??'',rank:0,count:0,points:0,raw_points:0,base_milli:0,adjusted_milli:0,tb_ore:0,unknown_tb_count:0}));
 const byId=new Map(entries.map(e=>[e.id,e])),byActivity=new Map(activities.map(a=>[`${a.station_id}:${a.id}`,a]));
 for(const row of rows){const e=byId.get(c.kind==='individual'?row.seller_id:row.station_id),a=byActivity.get(`${row.station_id}:${row.activity_id}`),cat=c.categories.find(c=>c.id===a?.arena_category_id);if(!e||!cat)continue;
  e.count+=row.count;e.raw_points+=row.raw_points;e.tb_ore+=row.tb_ore;e.unknown_tb_count+=row.unknown_tb_count;e.base_milli+=row.count*cat.points_milli;e.adjusted_milli+=row.count*contestSalePoints(c,row.station_id,cat.points_milli);
 }
 for(const e of entries){if(!Number.isSafeInteger(e.adjusted_milli)||!Number.isSafeInteger(e.base_milli))throw Error('Tävlingspoängen överskrider säker heltalsgräns.');e.points=e.adjusted_milli/1000;}
 const score=(e:ContestEntry)=>r.metric==='count'?e.count:r.metric==='tb'?e.tb_ore:e.adjusted_milli;
 entries.sort((a,b)=>score(b)-score(a)||a.name.localeCompare(b.name,'sv')||a.id.localeCompare(b.id));entries.forEach((e,i)=>e.rank=i&&score(e)===score(entries[i-1])?entries[i-1].rank:i+1);return entries;
}
export async function boardCompetitionView(db:D1Database,row:{id:string;name:string;status:string;rules_json:string},now:Date):Promise<Competition>{
 const r=JSON.parse(row.rules_json) as CompetitionRules&{activities:ActivitySnapshot[]},start=r.contest?.locked_at&&r.contest.locked_at>arenaDayStart(r.start_day)?r.contest.locked_at:arenaDayStart(r.start_day),end=arenaDayStart(arenaNextDay(r.end_day)),finished=now.toISOString()>=end;
 const members=(await db.prepare('SELECT station_id id,snapshot_name name FROM arena_league_members WHERE league_id=? ORDER BY seed').bind(row.id).all<{id:string;name:string}>()).results;
 const entries=contestEntries(r,r.activities,members,await contestAggregates(db,r,r.activities,start,end,now.toISOString(),finished));
 const phase=row.status==='cancelled'?'cancelled':finished?'finished':now.toISOString()>=start?'active':'scheduled';
 const champions=phase==='finished'?entries.filter(e=>e.rank===1&&e.count>0).map(e=>e.id):[];
 return {id:row.id,name:row.name,format:r.format,rules:r,phase,frozen:phase==='finished'||phase==='cancelled',champion_ids:champions,entries,entry_count:entries.length,standings:entries.map((e,i)=>({id:e.id,name:e.name,rank:e.rank,seed:i+1,played:0,won:0,drawn:0,lost:0,match_points:0,metric_for:r.metric==='count'?e.count:r.metric==='tb'?e.tb_ore:e.points,metric_against:0})),matches:[],bracket:[]};
}
