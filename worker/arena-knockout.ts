import type {ArenaFight} from '../shared/arena-fights';
import type {ArenaMetric} from '../shared/arena-network';
import {competitionAudit,systemActor} from './arena-competition-model';
const score=(r:{points:number;tb_ore:number;count:number},m:ArenaMetric)=>m==='tb'?r.tb_ore:m==='count'?r.count:r.points;
export async function resolveKnockout(db:D1Database,f:{id:string;end_at:string;knockout_json?:string|null},view:ArenaFight,now:string){
 if(!f.knockout_json||view.phase!=='finished')return;
 const rule=JSON.parse(f.knockout_json) as {secondary:ArenaMetric;tie_rule:string;seeds:Record<string,number>;format:string};
 let winners=view.winner_ids;
 if(winners.length!==1&&rule.tie_rule!=='sudden-death'&&rule.tie_rule!=='seed'){
  const best=Math.max(...view.standings.map(r=>score(r,rule.secondary)));winners=view.standings.filter(r=>score(r,rule.secondary)===best).map(r=>r.id);
  if(winners.length===1)view.tie_break_reason=`Sekundärt mått: ${rule.secondary}`;
 }
 if(winners.length!==1&&(rule.tie_rule==='seed'||(rule.tie_rule==='secondary'&&rule.format==='playoffs'))){winners=[view.standings.slice().sort((a,b)=>rule.seeds[a.id]-rule.seeds[b.id])[0].id];view.tie_break_reason='Högre seed från den frysta ligatabellen';}
 if(winners.length!==1){
  const sale=await db.prepare(`SELECT r.id,r.station_id,r.registered_at FROM arena_registrations r JOIN arena_fight_stations m ON m.station_id=r.station_id WHERE m.fight_id=? AND r.registered_at>=? AND r.registered_at<=? AND r.voided_at IS NULL AND EXISTS(SELECT 1 FROM arena_fight_activity_rules a WHERE a.fight_id=m.fight_id AND a.station_id=r.station_id AND a.activity_id=r.activity_id) ORDER BY r.registered_at,r.rowid LIMIT 1`).bind(f.id,f.end_at,now).first<{id:string;station_id:string;registered_at:string}>();
  if(!sale){view.phase='active';view.winner_ids=[];view.sudden_death=true;return;}
  winners=[sale.station_id];view.tie_break_reason='Sudden death · nästa giltiga registrering';view.sudden_death_sale=sale.id;view.sudden_death_ended_at=sale.registered_at;
 }
 view.winner_ids=winners;view.leader_ids=winners;
 await db.batch([competitionAudit(db,systemActor,'knockout.resolved',f.id,{winner_ids:winners,tie_break:view.tie_break_reason,sudden_death_sale:view.sudden_death_sale},`knockout:${f.id}`)]);
}
