import type {ArenaActivity,ArenaStats} from '../shared/arena';

// Presentation follows the scoring engine's frozen local IDs. Do not infer
// scope from a current campaign, category label, product name or missing data.
export function arenaFightQualifies(stats:ArenaStats|null,activity:ArenaActivity|null){
 const objective=stats?.fight_objective;
 return !!activity&&activity.active===1&&stats?.fight?.phase==='active'&&objective?.fight_id===stats.fight.id&&
  (objective.activity_ids===null||objective.activity_ids.includes(activity.id));
}
