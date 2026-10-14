import { arenaNumber, roundedPoints, type ArenaAchievement, type ArenaGoal } from "./arena";

export type AchievementScope = {
  id: string; label: string; kind: "period" | "activity" | "focus";
  board: { id: string; name: string; points: number; count: number }[];
};
export type AchievementSnapshot = {
  scopes: AchievementScope[];
  goals: { id: string; kind: "personal-goal" | "station-goal" | "focus-goal"; goal: ArenaGoal; metric: "points" | "count" }[];
};
export type EvaluatedAchievement = ArenaAchievement & {
  id: string; level: 2 | 3; scope: string; goalMetric?: "points" | "count";
};

// Crossing events, rather than current states. Repeated sales by an existing leader
// and sales above an already reached goal produce no duplicate achievement.
export function evaluateArenaAchievements(before: AchievementSnapshot, after: AchievementSnapshot, sellerId: string): EvaluatedAchievement[] {
  const events: EvaluatedAchievement[] = [];
  for (const row of after.goals) {
    const previous = before.goals.find(g => g.id === row.id);
    if (!previous || row.goal.target_points <= 0 || (row.goal.seller_id && row.goal.seller_id !== sellerId)) continue;
    if (previous.goal.points < row.goal.target_points && row.goal.points >= row.goal.target_points) {
      events.push({ id:`goal:${row.id}`, level:3, special:true, kind:row.kind, goal:row.goal, goalMetric:row.metric, scope:row.kind === "focus-goal" ? "Aktuellt fokus" : row.goal.period_type === "week" ? "Den här veckan" : row.goal.period_type === "month" ? "Den här månaden" : "Vald period", text:row.kind === "personal-goal" ? "Personliga målet uppnått!" : row.kind === "focus-goal" ? "Fokusmålet uppnått!" : "Lagets mål uppnått!" });
    } else if (row.kind === "personal-goal" && previous.goal.points < row.goal.target_points * .8 && row.goal.points >= row.goal.target_points * .8 && row.goal.points < row.goal.target_points) {
      events.push({ id:`near:${row.id}`, level:2, special:true, kind:"milestone", scope:"Personligt mål", text:`Bara ${arenaNumber(roundedPoints(row.goal.target_points - row.goal.points))} poäng kvar till ditt mål!`, goal:row.goal });
    }
  }
  for (const scope of after.scopes) {
    const old = before.scopes.find(s => s.id === scope.id);
    if (!old) continue;
    const rank = (s: AchievementScope) => [...s.board].sort((a,b) => b.points-a.points || b.count-a.count || a.name.localeCompare(b.name,"sv") || a.id.localeCompare(b.id));
    const now = rank(scope), was = rank(old), person = now.find(p => p.id === sellerId);
    // A tie is never described as overtaking the previous leader.
    if (person && now[0]?.id === sellerId && person.points > 0 && was[0]?.id !== sellerId && (!now[1] || person.points > now[1].points)) {
      events.push({ id:`leader:${scope.id}:${sellerId}`, level:3, special:true, kind:"leader", scope:scope.label, text:"Ny etta!", previousLeader:was[0]?.points > 0 ? was[0].name : undefined });
    }
    if (scope.id.startsWith("today:")) {
      const count = person?.count ?? 0, previousCount = old.board.find(p => p.id === sellerId)?.count ?? 0;
      if (count >= 10 && Math.floor(count/10) > Math.floor(previousCount/10)) events.push({ id:`sales:${scope.id}:${sellerId}:${Math.floor(count/10)}`, level:2, special:true, kind:"milestone", scope:"Idag", text:`${count} försäljningar idag. Vilket driv!` });
    }
  }
  const priority = (e: EvaluatedAchievement) => e.level * 100 + ({"personal-goal":9,"station-goal":8,"focus-goal":7,leader:6,milestone:1,points:0}[e.kind]);
  return events.sort((a,b) => priority(b)-priority(a));
}
