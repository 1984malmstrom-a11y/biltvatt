// Trusted SQL aliases only. NULL preserves all legacy raw-point behaviour.
// Frozen milli-points are integers, summed before division for presentation.
export function weightedFightPointsSQL(registration:string,fightId:string){
 const field=(key:string)=>`SUM(CASE WHEN ${registration}.id IS NULL THEN NULL ELSE (SELECT json_extract(q.snapshot_json,'$.${key}') FROM arena_fight_activity_rules q WHERE q.fight_id=${fightId} AND q.station_id=${registration}.station_id AND q.activity_id=${registration}.activity_id) END)`;
 return `${field('contest_points_milli')} points_milli,${field('contest_base_milli')} base_milli`;
}
