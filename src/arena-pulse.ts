import type {ArenaStats} from '../shared/arena';
import {roundedPoints} from '../shared/arena';
const dayTime=(day:string)=>Date.parse(`${day}T12:00:00Z`);
export function arenaPulse(stats:ArenaStats|null){
 const goal=stats?.station_goals.find(g=>g.target_points>0&&g.start_date<=stats.range.end&&g.end_date>=stats.range.end);
 let pace:null|{percent:number;difference:number;elapsed:number;days:number}=null;
 if(goal&&stats){const days=Math.round((dayTime(goal.end_date)-dayTime(goal.start_date))/86400000)+1,elapsed=Math.min(days,Math.round((dayTime(stats.range.end)-dayTime(goal.start_date))/86400000)+1);
  if(days>0&&elapsed>0){const plan=goal.target_points*elapsed/days;pace={percent:Math.round(100*goal.points/plan),difference:roundedPoints(goal.points-plan),elapsed,days};}
 }
 const activities=new Map<string,{id:string;name:string;count:number}>();
 for(const person of stats?.leaderboard??[])for(const a of person.activities){const row=activities.get(a.id)??{id:a.id,name:a.name,count:0};row.count+=a.count;activities.set(a.id,row);}
 const strongest=[...activities.values()].filter(a=>a.count>0).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'sv'))[0]??null;
 return {pace,strongest,lastActivity:stats?.recent?.[0]??null,goal};
}
