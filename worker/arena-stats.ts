import {fightDashboard} from './arena-dashboard-context';
import {temporaryFightActivities} from './arena-temporary-activities';
import {fightNoticeState} from './arena-challenges';
import type { ArenaCampaign, ArenaGoal, ArenaPerson, ArenaRecentActivity, ArenaSeller, ArenaStats } from "../shared/arena";
import { roundedPoints } from "../shared/arena";
import { fail, text } from "./http";
import { arenaRange, goalBounds } from "./arena-model";
import { stockholmDay } from "./stats";
import { arenaFightSummary } from "./arena-fights";

export async function currentCampaign(db: D1Database, key: string, now: string) {
  return db.prepare(`SELECT c.id,c.name,c.activity_id,c.start_at,c.end_at,c.target_count,c.target_points,c.active
    FROM arena_campaigns c JOIN arena_activities a ON a.id=c.activity_id AND a.station_id=c.station_id
    WHERE c.station_id=? AND c.active=1 AND a.active=1 AND c.start_at<=? AND c.end_at>?
    ORDER BY c.start_at DESC,c.id LIMIT 1`).bind(key, now, now).first<ArenaCampaign>();
}
export async function arenaStats(db: D1Database, key: string, url: URL, now = new Date()): Promise<ArenaStats> {
  const range = arenaRange(url, now);
  const metric=(url.searchParams.get("metric")??"points") as "points" | "tb" | "count";
  const activity = url.searchParams.get("activity_id");
  const category = url.searchParams.get("category");
  if (activity && !await db.prepare("SELECT id FROM arena_activities WHERE id=? AND station_id=?").bind(text(activity, "Aktivitet", 80), key).first()) fail(404, "Aktiviteten finns inte.");
  if (category) text(category, "Kategori", 40);
  const day = stockholmDay(now);
  const todayRange = arenaRange(new URL("https://arena.test/?period=today"), now);
  const [sellers, grouped, today, campaign, stationGoals, personalGoals, recent] = await Promise.all([
    db.prepare("SELECT id,external_staff_id,name,color,active,avatar_index,CASE WHEN profile_image_id IS NOT NULL THEN '/api/arena/portraits/'||profile_image_id END profile_url FROM arena_sellers WHERE station_id=?").bind(key).all<ArenaSeller>(),
    db.prepare(`SELECT r.seller_id,a.id,a.name,a.category,COUNT(*) count,SUM(r.points_awarded) points,COALESCE(SUM(r.tb_ore_awarded),0) tb_ore,SUM(r.tb_ore_awarded IS NULL) unknown_tb_count
      FROM arena_registrations r JOIN arena_activities a ON r.activity_id=a.id AND a.station_id=r.station_id
      WHERE r.station_id=? AND r.voided_at IS NULL AND r.registered_at>=? AND r.registered_at<?
      AND (? IS NULL OR r.activity_id=?) AND (? IS NULL OR a.category=?)
      GROUP BY r.seller_id,a.id`).bind(key, range.from, range.to, activity, activity, category, category)
      .all<{ seller_id: string; id: string; name: string; category: string; count: number; points: number; tb_ore:number; unknown_tb_count:number }>(),
    db.prepare(`SELECT COUNT(*) count,COALESCE(SUM(points_awarded),0) points,COUNT(DISTINCT seller_id) sellers
      FROM arena_registrations WHERE station_id=? AND voided_at IS NULL AND registered_at>=? AND registered_at<?`)
      .bind(key, todayRange.from, todayRange.to).first<ArenaStats["today"]>(),
    currentCampaign(db, key, now.toISOString()),
    db.prepare("SELECT id,period_type,start_date,end_date,target_points FROM arena_station_goals WHERE station_id=? AND start_date<=? AND end_date>=? ORDER BY start_date DESC,id").bind(key, day, day).all<ArenaGoal>(),
    db.prepare("SELECT id,seller_id,period_type,start_date,end_date,target_points FROM arena_personal_goals WHERE station_id=? AND start_date<=? AND end_date>=? ORDER BY start_date DESC,id").bind(key, day, day).all<ArenaGoal>(),
    // A bounded, station-scoped feed follows today's sales independently of leaderboard filters.
    db.prepare(`SELECT r.id,r.seller_id,s.name seller_name,s.avatar_index,CASE WHEN s.profile_image_id IS NOT NULL THEN '/api/arena/portraits/'||s.profile_image_id END profile_url,a.name activity_name,a.display_mode,r.points_awarded,r.tb_ore_awarded,r.registered_at
      FROM arena_registrations r
      JOIN arena_sellers s ON s.id=r.seller_id AND s.station_id=r.station_id
      JOIN arena_activities a ON a.id=r.activity_id AND a.station_id=r.station_id
      WHERE r.station_id=? AND r.voided_at IS NULL AND r.registered_at>=? AND r.registered_at<?
      ORDER BY r.registered_at DESC,r.id DESC LIMIT 10`)
      .bind(key, todayRange.from, todayRange.to).all<ArenaRecentActivity>(),
  ]);
  const people = sellers.results.map(seller => {
    const activities = grouped.results.filter(r => r.seller_id === seller.id).map(({ seller_id: _, ...r }) => ({ ...r, points: roundedPoints(r.points) }));
    return { ...seller, rank: 0, activities, count: activities.reduce((s, r) => s + r.count, 0), points: roundedPoints(activities.reduce((s, r) => s + r.points, 0)),tb_ore:activities.reduce((s,r)=>s+r.tb_ore,0),unknown_tb_count:activities.reduce((s,r)=>s+r.unknown_tb_count,0) };
  }).filter(p => p.active || p.count).sort((a, b) => (metric==="tb" ? b.tb_ore-a.tb_ore : metric==="count" ? b.count-a.count : b.points-a.points) || b.points-a.points || b.count-a.count || a.name.localeCompare(b.name, "sv") || a.id.localeCompare(b.id));
  const leaderboard: ArenaPerson[] = people.map((p, index) => ({ ...p, rank: index + 1 }));
  async function withProgress(goals: ArenaGoal[]) {
    return Promise.all(goals.map(async goal => {
      const [from, to] = goalBounds(goal.start_date, goal.end_date);
      const row = await db.prepare(`SELECT COALESCE(SUM(points_awarded),0) points FROM arena_registrations
        WHERE station_id=? AND voided_at IS NULL AND registered_at>=? AND registered_at<? AND (? IS NULL OR seller_id=?)`)
        .bind(key, from, to, goal.seller_id ?? null, goal.seller_id ?? null).first<{ points: number }>();
      return { ...goal, points: roundedPoints(row?.points ?? 0) };
    }));
  }
  const [station_goals, personal_goals, campaignResult] = await Promise.all([
    withProgress(stationGoals.results), withProgress(personalGoals.results),
    campaign ? db.prepare(`SELECT COUNT(*) count,COALESCE(SUM(points_awarded),0) points FROM arena_registrations
      WHERE station_id=? AND activity_id=? AND voided_at IS NULL AND registered_at>=? AND registered_at<?`)
      .bind(key, campaign.activity_id, campaign.start_at, campaign.end_at).first<{ count: number; points: number }>() : null,
  ]);
  const fight=await arenaFightSummary(db,key);
  const [fight_dashboard,fight_activities]=await Promise.all([fightDashboard(db,fight,now),fight?.phase==='active'?temporaryFightActivities(db,key,fight.id):Promise.resolve([])]);
  return {
    range, count: leaderboard.reduce((s, p) => s + p.count, 0), points: roundedPoints(leaderboard.reduce((s, p) => s + p.points, 0)), leaderboard,
    today: { count: today?.count ?? 0, points: roundedPoints(today?.points ?? 0), sellers: today?.sellers ?? 0 },
    campaign: campaign ? { ...campaign, count: campaignResult?.count ?? 0, points: roundedPoints(campaignResult?.points ?? 0) } : null,
    station_goals, personal_goals, recent: recent.results.map(r => ({ ...r, points_awarded: roundedPoints(r.points_awarded) })),metric,tb_ore:leaderboard.reduce((s,p)=>s+(p.tb_ore??0),0),unknown_tb_count:leaderboard.reduce((s,p)=>s+(p.unknown_tb_count??0),0),
    fight,fight_dashboard,fight_activities,fight_notices:await fightNoticeState(db,key),
  };
}
