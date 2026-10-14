import {fightScore,uniqueFightLeader,type ArenaFightSummary} from "../shared/arena-fights";
export type FightFeedback={kind:"lead"|"tie"|"final";key:string;fight:ArenaFightSummary;stationId:string;previousLeader?:string};
export function fightTransition(before:ArenaFightSummary|null|undefined,after:ArenaFightSummary|null|undefined,stationId:string):FightFeedback|null {
  if(!before || !after || before.id!==after.id || before.phase!=="active" || after.phase!=="active" || after.metric!==before.metric || after.version<=before.version)return null;
  const own=after.standings.find(s=>s.id===stationId),was=before.standings.find(s=>s.id===stationId);
  if(!own || !was || fightScore(own,after.metric)<=fightScore(was,before.metric))return null;
  const leader=uniqueFightLeader(after.standings,after.metric),previous=uniqueFightLeader(before.standings,before.metric);
  const key=`${after.id}:${after.version}`;
  if(leader===stationId && previous!==stationId)return {kind:"lead",key:`${key}:lead`,fight:after,stationId,previousLeader:before.standings.find(s=>s.id===previous)?.name ?? before.standings.find(s=>s.id!==stationId && s.rank===1)?.name};
  const high=after.standings[0] && fightScore(after.standings[0],after.metric);
  if(!leader && high>0 && fightScore(own,after.metric)===high && previous!==stationId && previous)return {kind:"tie",key:`${key}:tie`,fight:after,stationId};
  return null;
}
export function fightUrgency(end:string|undefined,now:number):"calm"|"hour"|"quarter"|"final" {
  const remaining=end ? Date.parse(end)-now:Infinity;
  return remaining<=0 ? "calm":remaining<5*60000 ? "final":remaining<15*60000 ? "quarter":remaining<60*60000 ? "hour":"calm";
}
export function fightTime(end:string|undefined,now:number):string {
  if(!end)return "LIVE";
  const seconds=Math.max(0,Math.floor((Date.parse(end)-now)/1000));
  const days=Math.floor(seconds/86400),hours=Math.floor(seconds/3600)%24,minutes=Math.floor(seconds/60)%60;
  return `${days ? `${days} d `:""}${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
}
