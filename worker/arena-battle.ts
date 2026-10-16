import type {ArenaStats,ArenaActivity} from '../shared/arena';
import type {BattleContext,BattleCategory} from '../shared/arena-battle';
import type {ContestRules} from '../shared/arena-contest';
import type {ActivitySnapshot} from './arena-competition-model';
import {categories as canonical} from './arena-competition-model';
export async function battleContext(db:D1Database,station:string,fight:ArenaStats['fight'],now:Date):Promise<BattleContext|undefined>{
 if(fight?.phase!=='active'||fight.standings.length!==2||!fight.start_at||!fight.end_at)return;
 const [config,rows]=await Promise.all([
  db.prepare(`SELECT l.rules_json,l.format,b.round_no,(SELECT MAX(round_no) FROM arena_bracket_slots WHERE competition_id=l.id) last_round FROM arena_fights f LEFT JOIN arena_leagues l ON l.id=f.competition_id LEFT JOIN arena_bracket_slots b ON b.fight_id=f.id WHERE f.id=?`).bind(fight.id).first<{rules_json:string|null;format:string;round_no:number|null;last_round:number|null}>(),
  db.prepare(`SELECT q.snapshot_json,a.active,COUNT(r.id) count,COALESCE(SUM(r.points_awarded),0) raw_points,COALESCE(SUM(r.tb_ore_awarded),0) tb_ore FROM arena_fight_activity_rules q JOIN arena_activities a ON a.id=q.activity_id AND a.station_id=q.station_id LEFT JOIN arena_registrations r ON r.station_id=q.station_id AND r.activity_id=q.activity_id AND r.registered_at>=? AND r.registered_at<? AND r.registered_at<=? AND r.voided_at IS NULL WHERE q.fight_id=? AND q.station_id=? GROUP BY q.activity_id ORDER BY q.activity_id`).bind(fight.scoring_mode==='daily'&&fight.current_day?fight.current_day.start_at:fight.effective_start_at??fight.start_at,fight.scoring_mode==='daily'&&fight.current_day?fight.current_day.end_at:fight.sudden_death?new Date(now.getTime()+1).toISOString():fight.end_at,now.toISOString(),fight.id,station).all<{snapshot_json:string;active:number;count:number;raw_points:number;tb_ore:number}>()
 ]);
 const c=(config?.rules_json?JSON.parse(config.rules_json).contest:undefined) as ContestRules|undefined;
 const groups=new Map<string,BattleCategory>();for(const cat of c?.categories??[])groups.set(cat.id,{id:cat.id,name:cat.name,activities:[],count:0,points_milli:0,base_milli:cat.points_milli,reward_milli:0});
 for(const row of rows.results){const a=JSON.parse(row.snapshot_json) as ActivitySnapshot,id=a.arena_category_id??a.id;
  const group=groups.get(id)??{id,name:canonical.find(v=>v[0]===id)?.[1]??a.name,activities:[],count:0,points_milli:0,base_milli:Math.round(a.points*1000),reward_milli:0};
  const activity:ArenaActivity={...a,offer_text:'',price_text:'',display_mode:a.display_mode==='tb'?'tb':'points',sort_order:0,active:row.active,tb_ore:a.tb_ore??undefined};group.activities.push(activity);group.count+=row.count;group.tb_ore=(group.tb_ore??0)+row.tb_ore;group.points_milli+=a.contest_points_milli!=null?row.count*a.contest_points_milli:Math.round(row.raw_points*1000);group.reward_milli=a.contest_points_milli??Math.round(a.points*1000);groups.set(id,group);
 }
 const label=config?.round_no===config?.last_round&&config?.round_no?'FINAL':config?.round_no&&config.last_round&&config.round_no===config.last_round-1?'SEMIFINAL':config?.format==='cup'?'CUPMATCH':config?.format==='league'||config?.format==='playoffs'?'LIGAOMGÅNG':config?.format==='daily'?'DAGSSERIE · IDAG':'FRISTÅENDE MATCH';
 const flow=c?.flows?.find(f=>f.station_id===station);
 return {fight_id:fight.id,label,categories:groups.size<=7?[...groups.values()]:[],...(!groups.size?{unavailable_reason:'Äldre match utan frysta kategorier. Stationsregistrering är tillgänglig.'}:{}),...(groups.size>7?{unavailable_reason:'Den äldre matchen har fler än sju kategorier. Stationsläget behålls.'}:{}),...(c?.fair_play&&flow?{fair_play:{...c.fair_play,customers_milli:flow.customers_milli,source:flow.source,period_start:flow.period_start,period_end:flow.period_end}}:{})};
}
