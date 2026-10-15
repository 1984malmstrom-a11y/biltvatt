import type { ArenaMetric, ArenaStationStanding } from "./arena-network";
export type ArenaFightMode='total'|'daily';
export type ArenaFightDay={day:string;start_at:string;end_at:string;closed:boolean;standings:ArenaStationStanding[];winner_ids:string[]};
export type ArenaFightEvent={id:string;kind:"sale"|"lead"|"tie";station_id:string;station_name:string;created_at:string;profile_url?:string|null;avatar_index?:number|null; seller_id?:string;seller_name?:string;activity_name?:string;points_awarded?:number;tb_ore_awarded?:number|null;display_mode?:"points"|"tb"};
export type ArenaFight={
  blocked_by_sudden_death?:string;effective_start_at?:string;sudden_death_ended_at?:string;sudden_death?:boolean;sudden_death_sale?:string;tie_break_reason?:string;competition_id?:string|null;cancelled?:{reason:string;at:string;actor:string};
  id:string;name:string;description:string;start_at:string;end_at:string;metric:ArenaMetric;
  phase:"scheduled" | "active" | "finished" | "cancelled";snapshot_at:string;version:number;
  standings:ArenaStationStanding[];winner_ids:string[];leader_ids:string[];
  latest_lead_change?:{version:number;station_id:string;station_name:string;created_at:string} | null;
  events?:ArenaFightEvent[];
  scoring_mode?:ArenaFightMode;day_win_points?:number;day_tie_points?:number;
  days?:ArenaFightDay[];current_day?:ArenaFightDay|null;
};
export type ArenaFightSummary=Pick<ArenaFight,"id" | "name" | "metric" | "phase" | "standings" | "version"> & Partial<Pick<ArenaFight,"start_at"|"end_at"|"snapshot_at"|"leader_ids"|"winner_ids"|"latest_lead_change"|"scoring_mode"|"day_win_points"|"day_tie_points"|"current_day"|"sudden_death"|"tie_break_reason"|"competition_id">>;
export type ArenaFightListing={id:string;name:string;start_at:string;end_at:string;metric:ArenaMetric;status:string;scoring_mode?:ArenaFightMode;participants?:{id:string;name:string}[];leader_names?:string[]};
export const fightScore=(s:ArenaStationStanding,metric:ArenaMetric,mode:ArenaFightMode='total')=>mode==='daily' ? s.match_points??0 : metric==="tb" ? s.tb_ore : metric==="count" ? s.count:s.points;
export function fightPhase(start:string,end:string,status:string,now=new Date()):ArenaFight["phase"] {
  if(status==="cancelled")return "cancelled";
  return now.getTime()>=Date.parse(end) ? "finished" : now.getTime()<Date.parse(start) ? "scheduled":"active";
}
export const fightLeaders=(rows:ArenaStationStanding[],metric:ArenaMetric,mode:ArenaFightMode='total')=>rows.length ? rows.filter(s=>fightScore(s,metric,mode)===fightScore(rows[0],metric,mode)).map(s=>s.id):[];
export function uniqueFightLeader(rows:ArenaStationStanding[],metric:ArenaMetric,mode:ArenaFightMode='total') {
  const leaders=fightLeaders(rows,metric,mode);return leaders.length===1 && fightScore(rows[0],metric,mode)>0 ? leaders[0]:"";
}
