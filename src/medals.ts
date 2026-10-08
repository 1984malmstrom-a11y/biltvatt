import type { Stats } from "./types";

export type MedalPlace = 1 | 2 | 3;

// Preserve the server's Snittköpsligan order, including its tie breaks.
export function medalPlacements(stats: Stats | null, currentMonth: string): Record<string, MedalPlace> {
  if (!stats || stats.range.start !== `${currentMonth}-01`) return {};
  const placements: Record<string, MedalPlace> = {};
  stats.leaders.average
    .filter((person) => person.count >= 3)
    .slice(0, 3)
    .forEach((person, index) => {
      placements[person.id] = (index + 1) as MedalPlace;
    });
  return placements;
}
