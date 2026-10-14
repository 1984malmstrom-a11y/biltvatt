import { arenaNumber, type ArenaActivity } from "./arena";

export const arenaMoney = (ore:number) => `${new Intl.NumberFormat("sv-SE",{minimumFractionDigits:ore%100 ? 2:0,maximumFractionDigits:2}).format(ore/100)} kr`;
export const arenaDecimalMoney = (ore:number) => `${Math.floor(ore/100)},${String(ore%100).padStart(2,"0")}`;
export function parseArenaMoney(value:unknown):number | null {
  if(typeof value!=="string" || !/^\d{1,7}(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const [whole,fraction=""]=value.trim().replace(",",".").split(".");
  const ore=Number(whole)*100+Number(fraction.padEnd(2,"0"));
  return Number.isSafeInteger(ore) && ore<=100000000 ? ore : null;
}
export function arenaReward(activity:ArenaActivity, points=activity.points, tb:number | null | undefined=activity.tb_ore) {
  return activity.display_mode === "tb" && tb !== null && tb !== undefined ? `+${arenaMoney(tb)} TB` : `+${arenaNumber(points)} POÄNG`;
}
