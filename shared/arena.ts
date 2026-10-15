export type ArenaActivity = {
  arena_category_id?:string|null;
  id: string; name: string; offer_text: string; price_text: string; points: number;
  image_key: string | null; category: string; sort_order: number; active: number;
  tb_ore?:number; display_mode?:"points" | "tb";
};
export type ArenaSeller = { id: string; external_staff_id: string | null; name: string; color: string; active: number; profile_url?:string | null; avatar_index?:number|null; source?:"station" | "arena" };
export type ArenaCampaign = {
  id: string; name: string; activity_id: string; start_at: string; end_at: string;
  target_count: number | null; target_points: number | null; active: number;
};
export type ArenaGoal = {
  id: string; seller_id?: string; period_type: "week" | "month" | "custom";
  start_date: string; end_date: string; target_points: number; points: number;
};
export type ArenaPerson = ArenaSeller & {
  station_id?:string;station_name?:string;
  rank: number; points: number; count: number;
  tb_ore?:number; unknown_tb_count?:number;
  activities: { id: string; name: string; category: string; count: number; points: number; tb_ore?:number }[];
};
export type ArenaBootstrap = {
  station: { id: string; name: string; kind?:"integrated" | "arena";status?:string }; sellers: ArenaSeller[];
  activities: ArenaActivity[]; campaign: ArenaCampaign | null;
};
export type ArenaRecentActivity = {
  station_id?:string;station_name?:string;
  id: string; seller_id?:string; profile_url?:string | null; avatar_index?:number|null; seller_name: string; activity_name: string; points_awarded: number; registered_at: string;
  tb_ore_awarded?:number | null;
  display_mode?:"points" | "tb";
};
export type ArenaStats = {
  range: { start: string; end: string; from: string; to: string };
  points: number; count: number; leaderboard: ArenaPerson[];
  today: { count: number; points: number; sellers: number };
  recent?: ArenaRecentActivity[];
  campaign: (ArenaCampaign & { points: number; count: number }) | null;
  station_goals: ArenaGoal[]; personal_goals: ArenaGoal[];
  tb_ore?:number; unknown_tb_count?:number; metric?:"points" | "tb" | "count";
  fight_activities?:ArenaFightActivity[];
  // Null IDs mean a legacy unscoped fight. An empty array means no ordinary
  // local activity qualifies. IDs come from frozen rules, never current labels.
  fight_objective?:{fight_id:string;scope:'all'|'focus'|'category'|'activity';activity_ids:string[]|null};
  fight_dashboard?:{fight_id:string;station_ids:string[];metric:'points'|'tb'|'count';leaderboard:ArenaPerson[];recent:ArenaRecentActivity[]};
  fight_notices?:{incoming:number;unread:number;outgoing?:number;scheduled?:number};
  fight?:import("./arena-fights").ArenaFightSummary | null;
};
export type ArenaRegistration = { id: string; seller_id: string; activity_id: string; points_awarded: number; registered_at: string; voided_at: string | null; tb_ore_awarded?:number | null };
const arenaNumberFormat = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 });
export const arenaNumber = (n: number) => arenaNumberFormat.format(n);
export const roundedPoints = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Small event function shared by all celebrations. No animation controls the sale flow.
export type ArenaAchievement = {
  text: string; special: boolean; kind: "points" | "leader" | "personal-goal" | "station-goal" | "focus-goal" | "milestone";
  goal?: ArenaGoal; previousLeader?: string; level?: 1 | 2 | 3; scope?: string; goalMetric?: "points" | "count";
};
export function arenaAchievement(before: ArenaStats | null, after: ArenaStats, sellerId: string): ArenaAchievement {
  const person = after.leaderboard.find(p => p.id === sellerId);
  const old = before?.leaderboard.find(p => p.id === sellerId);
  const goal = after.personal_goals.find(g => g.seller_id === sellerId && g.points >= g.target_points &&
    (before?.personal_goals.find(b => b.id === g.id)?.points ?? 0) < g.target_points);
  if (goal) return { text: "Personliga målet uppnått!", special: true, kind: "personal-goal", goal };
  const teamGoal = after.station_goals.find(g => g.points >= g.target_points &&
    before?.station_goals.some(b => b.id === g.id && b.points < g.target_points));
  if (teamGoal) return { text: "Lagets mål uppnått!", special: true, kind: "station-goal", goal: teamGoal };
  if (person?.rank === 1 && person.points > 0 && (!old || old.rank > 1)) return { text: "Ny etta!", special: true, kind: "leader", previousLeader: before?.leaderboard.find(p => p.rank === 1 && p.id !== sellerId)?.name };
  const next = person && after.leaderboard.find(p => p.rank === person.rank - 1);
  if (next && person) return { text: `${person.name}: ${arenaNumber(roundedPoints(next.points - person.points))} poäng till nästa placering!`, special: false, kind: "points" };
  return { text: `${person?.name ?? "Laget"}, tillsammans säljer vi mer!`, special: false, kind: "points" };
}

export type ArenaFightActivity=ArenaActivity&{fight_id:string;start_at:string;end_at:string};
