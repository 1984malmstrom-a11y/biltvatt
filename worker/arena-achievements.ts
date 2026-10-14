import { roundedPoints, type ArenaGoal } from "../shared/arena";
import type { AchievementSnapshot, AchievementScope } from "../shared/arena-achievements";
import { arenaRange, goalBounds } from "./arena-model";
import { currentCampaign } from "./arena-stats";
import { checkFields, fail } from "./http";
import { stockholmDay } from "./stats";

type Scope = { id:string; label:string; kind:AchievementScope["kind"] | "goal"; from:string; to:string; activity:string | null; seller:string | null; goal?:ArenaGoal; goalKind?:AchievementSnapshot["goals"][number]["kind"]; metric?:"points" | "count" | "tb" };
type Score = { scope_id:string; id:string; name:string; active:number; points:number; count:number; tb_ore:number };

export async function achievementScopes(db:D1Database, station:string, activityId:string, context:unknown, now:Date, sellerId:string) {
  const scopes:Scope[]=[];
  for (const [period,label] of [["today","Idag"],["week","Den här veckan"],["month","Den här månaden"]]) {
    const r=arenaRange(new URL(`https://arena.test/?period=${period}`),now);
    scopes.push({id:`${period}:${r.start}`,label,kind:"period",from:r.from,to:r.to,activity:null,seller:null});
  }
  if (context !== undefined) {
    if (!context || typeof context !== "object" || Array.isArray(context)) fail(400,"Ogiltig achievement-period.");
    const data=context as Record<string,unknown>; checkFields(data,["period","start","end","metric"]);
    const u=new URL("https://arena.test/");
    for (const [name,value] of Object.entries(data)) { if (typeof value !== "string") fail(400,"Ogiltig achievement-period."); u.searchParams.set(name,value as string); }
    const r=arenaRange(u,now);
    if (data.period === "custom") scopes.push({id:`custom:${r.start}:${r.end}`,label:"Vald period",kind:"period",from:r.from,to:r.to,activity:null,seller:null});
  }
  const metric=(context && typeof context==="object" ? (context as Record<string,unknown>).metric : undefined) ?? "points";
  for(const scope of scopes) {scope.metric=metric as Scope["metric"];scope.id+=`:${metric}`;if(metric!=="points")scope.label+=metric==="tb" ? " · TB" : " · antal";}
  const day=stockholmDay(now);
  const [activity,campaign,personal,stationGoals]=await Promise.all([
    db.prepare("SELECT name FROM arena_activities WHERE id=? AND station_id=?").bind(activityId,station).first<{name:string}>(),
    currentCampaign(db,station,now.toISOString()),
    db.prepare("SELECT id,seller_id,period_type,start_date,end_date,target_points FROM arena_personal_goals WHERE station_id=? AND seller_id=? AND start_date<=? AND end_date>=?").bind(station,sellerId,day,day).all<ArenaGoal>(),
    db.prepare("SELECT id,period_type,start_date,end_date,target_points FROM arena_station_goals WHERE station_id=? AND start_date<=? AND end_date>=?").bind(station,day,day).all<ArenaGoal>(),
  ]);
  const monthly=scopes[2];
  scopes.push({...monthly,id:`activity:${activityId}:${monthly.from}`,label:activity?.name ?? "Aktivitet",kind:"activity",activity:activityId});
  if (campaign) {
    scopes.push({id:`focus:${campaign.id}:${metric}`,label:"Aktuellt fokus",kind:"focus",from:campaign.start_at,to:campaign.end_at,activity:campaign.activity_id,seller:null,metric:metric as Scope["metric"]});
    for (const [metric,target] of [["points",campaign.target_points],["count",campaign.target_count]] as const) if (target && target>0) {
      const goal:ArenaGoal={id:`${campaign.id}:${metric}`,period_type:"custom",start_date:campaign.start_at.slice(0,10),end_date:campaign.end_at.slice(0,10),target_points:target,points:0};
      scopes.push({id:`goal:${goal.id}`,label:campaign.name,kind:"goal",from:campaign.start_at,to:campaign.end_at,activity:campaign.activity_id,seller:null,goal,goalKind:"focus-goal",metric});
    }
  }
  for (const [kind,goals] of [["personal-goal",personal.results],["station-goal",stationGoals.results]] as const) for (const goal of goals) {
    const [from,to]=goalBounds(goal.start_date,goal.end_date);
    scopes.push({id:`goal:${goal.id}`,label:goal.id,kind:"goal",from,to,activity:null,seller:goal.seller_id ?? null,goal,goalKind:kind,metric:"points"});
  }
  // Keep each statement below D1's 100-bound-parameter limit, even with many active goals.
  const blocks:Array<Scope[]>=[];for(let at=0;at<scopes.length;at+=19)blocks.push(scopes.slice(at,at+19));
  const sql=(block:Scope[])=>`WITH scopes(scope_id,from_at,to_at,activity_id,seller_id) AS (VALUES ${block.map(()=>"(?,?,?,?,?)").join(",")})
    SELECT c.scope_id,s.id,s.name,s.active,COALESCE(SUM(r.points_awarded),0) points,COUNT(r.id) count,COALESCE(SUM(r.tb_ore_awarded),0) tb_ore
    FROM scopes c CROSS JOIN arena_sellers s
    LEFT JOIN arena_registrations r ON r.station_id=s.station_id AND r.seller_id=s.id AND r.voided_at IS NULL
      AND r.registered_at>=c.from_at AND r.registered_at<c.to_at AND (c.activity_id IS NULL OR r.activity_id=c.activity_id)
    WHERE s.station_id=? AND (c.seller_id IS NULL OR s.id=c.seller_id)
    GROUP BY c.scope_id,s.id`;
  return {
    statements:()=>blocks.map(block=>db.prepare(sql(block)).bind(...block.flatMap(s=>[s.id,s.from,s.to,s.activity,s.seller]),station)),
    snapshot:(rows:Score[]):AchievementSnapshot=>({
      scopes:scopes.filter(s=>s.kind!=="goal").map(s=>({id:s.id,label:s.label,kind:s.kind as AchievementScope["kind"],metric:s.metric,board:rows.filter(r=>r.scope_id===s.id && (r.active || r.count)).map(r=>({id:r.id,name:r.name,points:roundedPoints(r.points),count:r.count,tb_ore:r.tb_ore}))})),
      goals:scopes.filter(s=>s.goal).map(s=>({id:s.id,kind:s.goalKind!,metric:s.metric as "points" | "count",goal:{...s.goal!,points:roundedPoints(rows.filter(r=>r.scope_id===s.id).reduce((total,r)=>total+(s.metric==="count" ? r.count : r.points),0))}})),
    }),
  };
}
