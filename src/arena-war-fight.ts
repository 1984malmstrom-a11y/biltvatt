import type {ArenaActivity,ArenaStats,ArenaFightActivity} from '../shared/arena';
import type {ArenaFightSummary} from '../shared/arena-fights';
import {arenaNumber} from '../shared/arena';
import {arenaMoney} from '../shared/arena-money';
export function fightMetricLabel(fight:ArenaFightSummary){return fight.scoring_mode==='daily'?'MATCHPOÄNG':fight.metric==='tb'?'TB · kr':fight.metric==='count'?'ANTAL':'POÄNG';}
export function fightDifference(fight:ArenaFightSummary,gap:number){
 const value=Math.abs(gap);
 return fight.scoring_mode==='daily'?`${arenaNumber(value)} matchpoäng`:fight.metric==='tb'?`${arenaMoney(value)} TB`:`${arenaNumber(value)} ${fight.metric==='count'?(value===1?'registrering':'registreringar'):'poäng'}`;
}
export function fightScopeLabel(fightId:string,objective:ArenaStats['fight_objective'],activities:ArenaActivity[]=[],temporary:ReadonlyArray<Pick<ArenaFightActivity,'fight_id'|'name'|'active'>>=[]){
 const extra=temporary.filter(a=>a.fight_id===fightId&&a.active===1).map(a=>a.name);
 const withTemporary=(label:string)=>[label,...extra].filter(Boolean).join(' · ');
 if(!objective||objective.fight_id!==fightId)return withTemporary('Se fightens regler');
 // The V2 builder starts from scope=all, then freezes a narrower category set.
 // Only call it all when the authoritative local IDs cover the active products.
 const ids=objective.activity_ids??[],selected=new Set(ids),active=activities.filter(a=>a.active===1);
 if(objective.scope==='all'&&(objective.activity_ids===null||active.length>0&&active.every(a=>selected.has(a.id))))return withTemporary('ALLA KATEGORIER');
 if(objective.scope==='focus')return withTemporary('MÅNADENS FOKUS');
 const names=ids.map(id=>activities.find(a=>a.id===id)?.name);
 if(!ids.length)return extra.length?withTemporary(''):'INGA AKTIVA AKTIVITETER';
 if(names.some(n=>!n))return withTemporary(`${ids.length} VALDA AKTIVITETER`);
 return withTemporary(names.join(' · '));
}
export function stationInitials(name:string){return name.trim().split(/[\s-]+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toLocaleUpperCase('sv-SE')||'–';}
