import { describe, expect, it } from "vitest";
import { arenaDecimalMoney, arenaMoney, arenaReward, parseArenaMoney } from "../shared/arena-money";
import { arenaTB } from "../worker/arena-model";
import type { ArenaActivity } from "../shared/arena";
import { evaluateArenaAchievements, type AchievementSnapshot } from "../shared/arena-achievements";

describe("integer öre and contribution margins",()=>{
  for(const [text,ore] of [["0",0],["0,01",1],["0.29",29],["35,00",3500],["35.15",3515],["1000000",100000000]] as const) it(`${text} converts exactly to ${ore} öre`,()=>{
    expect(arenaTB(text)).toBe(ore);expect(parseArenaMoney(arenaDecimalMoney(ore))).toBe(ore);
  });
  for(const invalid of ["", "-1", "1.005","1,2,3","1e3","NaN","1000000.01",35.2,null]) it(`rejects invalid money ${String(invalid)}`,()=>{
    expect(parseArenaMoney(invalid)).toBeNull();expect(()=>arenaTB(invalid)).toThrow();
  });
  it("display mode changes the badge only, with unknown historical TB falling back to points",()=>{
    const a={points:2,tb_ore:3525,display_mode:"tb"} as ArenaActivity;
    expect(arenaReward(a)).toBe("+35,25 kr TB");expect(arenaReward({...a,display_mode:"points"})).toBe("+2 POÄNG");
    expect(arenaReward(a,2,null)).toBe("+2 POÄNG");expect(arenaMoney(3500)).toBe("35 kr");
  });
  it("TB leadership uses integer margins, not points, with the same crossing and tie rules",()=>{
    const before:AchievementSnapshot={scopes:[{id:"today:date:tb",label:"Idag · TB",kind:"period",metric:"tb",board:[{id:"p",name:"Peter",points:10,count:5,tb_ore:1000},{id:"a",name:"Alva",points:2,count:1,tb_ore:2000}]}],goals:[]};
    const after=structuredClone(before);after.scopes[0].board[0].tb_ore=2500;
    expect(evaluateArenaAchievements(before,after,"p")[0]).toMatchObject({level:3,kind:"leader",scope:"Idag · TB",previousLeader:"Alva"});
    expect(evaluateArenaAchievements(after,after,"p")).toEqual([]);
  });
});
