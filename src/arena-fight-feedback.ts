import {fightScore,uniqueFightLeader,type ArenaFightSummary} from "../shared/arena-fights";
export type FightFeedback={kind:"lead"|"tie"|"final";key:string;fight:ArenaFightSummary;stationId:string;daily?:boolean;previousLeader?:string};
export function fightTransition(before:ArenaFightSummary|null|undefined,after:ArenaFightSummary|null|undefined,stationId:string):FightFeedback|null {
  if(!before || !after || before.id!==after.id || before.phase!=="active" || after.phase!=="active" || after.metric!==before.metric || after.version<=before.version)return null;
  const daily=after.scoring_mode==="daily";
  if((before.scoring_mode??"total")!==(after.scoring_mode??"total") || (daily && (!before.current_day || !after.current_day || before.current_day.day!==after.current_day.day)))return null;
  const rows=daily ? after.current_day!.standings:after.standings,previousRows=daily ? before.current_day!.standings:before.standings;
  const own=rows.find(s=>s.id===stationId),was=previousRows.find(s=>s.id===stationId);
  if(!own || !was || fightScore(own,after.metric)<=fightScore(was,before.metric))return null;
  const leader=uniqueFightLeader(rows,after.metric),previous=uniqueFightLeader(previousRows,before.metric);
  const key=`${after.id}:${after.version}`;
  if(leader===stationId && previous!==stationId)return {kind:"lead",key:`${key}:lead`,fight:after,stationId,daily,previousLeader:previousRows.find(s=>s.id===previous)?.name ?? previousRows.find(s=>s.id!==stationId && s.rank===1)?.name};
  const high=rows[0] && fightScore(rows[0],after.metric);
  if(!leader && high>0 && fightScore(own,after.metric)===high && previous!==stationId && previous)return {kind:"tie",key:`${key}:tie`,fight:after,stationId,daily};
  return null;
}
export function fightUrgency(end:string|undefined,now:number):"calm"|"hour"|"quarter"|"final" {
  const remaining=end ? Date.parse(end)-now:Infinity;
  return remaining<=0 ? "calm":remaining<=5*60000 ? "final":remaining<=15*60000 ? "quarter":remaining<=60*60000 ? "hour":"calm";
}
export function fightTime(end:string|undefined,now:number,hoursOnly=false):string {
  if(!end||!Number.isFinite(Date.parse(end)))return "LIVE";
  const seconds=Math.max(0,Math.floor((Date.parse(end)-now)/1000));
  const days=Math.floor(seconds/86400),hours=hoursOnly?Math.floor(seconds/3600):Math.floor(seconds/3600)%24,minutes=Math.floor(seconds/60)%60;
  return `${days&&!hoursOnly ? `${days} d `:""}${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
}
