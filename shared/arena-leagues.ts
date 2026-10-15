import {arenaInstant,stockholmInstant} from './arena-clock';
import type {ArenaMetric} from './arena-network';
export type ArenaRoundRobinMatch={round:number;day:string;home:string;away:string};
export type ArenaLeagueRow={id:string;name:string;rank:number;match_points:number;played:number;won:number;drawn:number;lost:number};
export type ArenaLeagueFixture={fight_id:string;round:number;day:string;home:{id:string;name:string};away:{id:string;name:string};phase:'scheduled'|'active'|'finished';home_points:number;away_points:number;winner_ids:string[]};
export type ArenaLeague={id:string;name:string;metric:ArenaMetric;start_day:string;day_win_points:number;day_tie_points:number;phase:'scheduled'|'active'|'finished';standings:ArenaLeagueRow[];fixtures:ArenaLeagueFixture[]};
export function arenaNextDay(day:string,amount=1){arenaInstant(`${day}T12:00:00Z`);const date=new Date(`${day}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+amount);return date.toISOString().slice(0,10);}
export const arenaDayStart=(day:string)=>stockholmInstant(`${day}T00:00`);
export function roundRobin(stations:string[],startDay:string):ArenaRoundRobinMatch[]{
 if(stations.length<2 || stations.length>16 || new Set(stations).size!==stations.length || stations.some(id=>!id))throw new Error('Välj 2–16 olika stationer för serien.');
 arenaNextDay(startDay,0);const wheel:(string|null)[]=[...stations];if(wheel.length%2)wheel.push(null);
 const fixtures:ArenaRoundRobinMatch[]=[];
 for(let round=1;round<wheel.length;round++){
  for(let i=0;i<wheel.length/2;i++){const a=wheel[i],b=wheel[wheel.length-1-i];if(a&&b)fixtures.push({round,day:arenaNextDay(startDay,round-1),home:round%2?a:b,away:round%2?b:a});}
  wheel.splice(1,0,wheel.pop()!);
 }
 return fixtures;
}
