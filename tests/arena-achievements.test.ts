import { describe, expect, it } from "vitest";
import { evaluateArenaAchievements, type AchievementSnapshot } from "../shared/arena-achievements";

const snapshot = (p=30,a=32):AchievementSnapshot => ({scopes:[{id:"today:2026-10-14",label:"Idag",kind:"period",board:[{id:"p",name:"Peter",points:p,count:9},{id:"a",name:"Alva",points:a,count:10}]}],goals:[]});
describe("central achievement evaluator",()=>{
  for (const [id,label,kind] of [["today:date","Idag","period"],["week:date","Den här veckan","period"],["month:date","Den här månaden","period"],["custom:from:to","Vald period","period"],["activity:coffee","Kaffe + bulle","activity"],["focus:campaign","Aktuellt fokus","focus"]] as const) it(`detects a genuine lead crossing in ${id}`,()=>{
    const before=snapshot(),after=snapshot(34); for(const state of [before,after]) Object.assign(state.scopes[0],{id,label,kind});
    expect(evaluateArenaAchievements(before,after,"p")[0]).toMatchObject({kind:"leader",level:3,scope:label,previousLeader:"Alva"});
    expect(evaluateArenaAchievements(after,snapshot(36),"p")).toEqual([]);
    expect(evaluateArenaAchievements(before,before,"p")).toEqual([]);
  });
  it("never describes a tie as overtaking, or absence of a baseline as a crossing",()=>{
    expect(evaluateArenaAchievements(snapshot(),snapshot(32),"p")).toEqual([]);
    expect(evaluateArenaAchievements({scopes:[],goals:[]},snapshot(34),"p")).toEqual([]);
  });
  for (const kind of ["personal-goal","station-goal","focus-goal"] as const) it(`reached ${kind} only once`,()=>{
    const before=snapshot(),after=snapshot();
    before.goals=[{id:"g",kind,metric:"points",goal:{id:"g",period_type:"week",start_date:"2026-10-12",end_date:"2026-10-18",target_points:100,points:99,...(kind==="personal-goal"?{seller_id:"p"}:{})}}];
    after.goals=structuredClone(before.goals); after.goals[0].goal.points=101;
    expect(evaluateArenaAchievements(before,after,"p")[0]).toMatchObject({kind,level:3});
    expect(evaluateArenaAchievements(after,after,"p")).toEqual([]);
    if(kind==="personal-goal") expect(evaluateArenaAchievements(before,after,"a")).toEqual([]);
  });
  it("prioritizes full achievements and combines a simultaneous milestone, without overlay spam",()=>{
    const before=snapshot(),after=snapshot(34);after.scopes[0].board[0].count=10;
    expect(evaluateArenaAchievements(before,after,"p").map(e=>[e.kind,e.level])).toEqual([["leader",3],["milestone",2]]);
  });
  it("undo is not an achievement; a later genuine crossing can be earned again",()=>{
    expect(evaluateArenaAchievements(snapshot(34),snapshot(),"p")).toEqual([]);
    expect(evaluateArenaAchievements(snapshot(),snapshot(34),"p")[0].kind).toBe("leader");
  });
  it("near personal goal is level 2, not repeated on every subsequent sale",()=>{
    const before=snapshot(),after=snapshot();before.goals=[{id:"g",kind:"personal-goal",metric:"points",goal:{id:"g",seller_id:"p",period_type:"month",start_date:"2026-10-01",end_date:"2026-10-31",target_points:100,points:79}}];after.goals=structuredClone(before.goals);after.goals[0].goal.points=81;
    expect(evaluateArenaAchievements(before,after,"p")[0]).toMatchObject({kind:"milestone",level:2});
    expect(evaluateArenaAchievements(after,after,"p")).toEqual([]);
  });
});
