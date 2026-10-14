import type { ArenaMetric, ArenaStationStanding } from "./arena-network";
export type ArenaFightEvent={id:string;kind:"sale"|"lead"|"tie";station_id:string;station_name:string;created_at:string;seller_id?:string;seller_name?:string;activity_name?:string;points_awarded?:number;tb_ore_awarded?:number|null;display_mode?:"points"|"tb"};
export type ArenaFight={
  id:string;name:string;description:string;start_at:string;end_at:string;metric:ArenaMetric;
  phase:"scheduled" | "active" | "finished" | "cancelled";snapshot_at:string;version:number;
  standings:ArenaStationStanding[];winner_ids:string[];leader_ids:string[];
  latest_lead_change?:{version:number;station_id:string;station_name:string;created_at:string} | null;
  events?:ArenaFightEvent[];
};
export type ArenaFightSummary=Pick<ArenaFight,"id" | "name" | "metric" | "phase" | "standings" | "version"> & Partial<Pick<ArenaFight,"start_at"|"end_at"|"snapshot_at"|"leader_ids"|"winner_ids"|"latest_lead_change">>;
export type ArenaFightListing={id:string;name:string;start_at:string;end_at:string;metric:ArenaMetric;status:string;participants?:{id:string;name:string}[];leader_names?:string[]};
export const fightScore=(s:ArenaStationStanding,metric:ArenaMetric)=>metric==="tb" ? s.tb_ore : metric==="count" ? s.count:s.points;
export function fightPhase(start:string,end:string,status:string,now=new Date()):ArenaFight["phase"] {
  if(status==="cancelled")return "cancelled";
  return now.getTime()>=Date.parse(end) ? "finished" : now.getTime()<Date.parse(start) ? "scheduled":"active";
}
export const fightLeaders=(rows:ArenaStationStanding[],metric:ArenaMetric)=>rows.length ? rows.filter(s=>fightScore(s,metric)===fightScore(rows[0],metric)).map(s=>s.id):[];
export function uniqueFightLeader(rows:ArenaStationStanding[],metric:ArenaMetric) {
  const leaders=fightLeaders(rows,metric);return leaders.length===1 && fightScore(rows[0],metric)>0 ? leaders[0]:"";
}
