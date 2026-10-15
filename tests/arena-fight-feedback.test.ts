import {describe,expect,it} from "vitest";
import type {ArenaFightSummary} from "../shared/arena-fights";
import {fightTransition,fightUrgency,fightTime} from "../src/arena-fight-feedback";
const standings=[{id:"a",name:"A",rank:1,points:10,tb_ore:1000,count:10,unknown_tb_count:0},{id:"b",name:"B",rank:2,points:9,tb_ore:900,count:9,unknown_tb_count:0}];
const before:ArenaFightSummary={id:"fight",name:"Fight",phase:"active",version:1,metric:"points",standings};
describe("Fight crossings, never current-state celebration",()=>{
  it.each(["points","tb","count"] as const)("requires an actual positive sale taking the lead in %s",metric=>{
    const first={...before,metric},after={...first,version:2,standings:[{...standings[1],rank:1,points:11,tb_ore:1100,count:11},{...standings[0],rank:2}]};
    expect(fightTransition(first,after,"b")).toMatchObject({kind:"lead",previousLeader:"A"});
    expect(fightTransition(after,{...after,version:3,standings:[{...after.standings[0],points:12,tb_ore:1200,count:12},after.standings[1]]},"b")).toBeNull();
    expect(fightTransition(first,{...after,version:1},"b")).toBeNull();
    expect(fightTransition(first,{...after,id:"other"},"b")).toBeNull();
    expect(fightTransition(first,{...after,phase:"finished"},"b")).toBeNull();
  });
  it("separates a tie from overtaking and does not celebrate an undo-induced lead",()=>{
    expect(fightTransition(before,{...before,version:2,standings:standings.map(s=>({...s,rank:1,points:10}))},"b")).toMatchObject({kind:"tie"});
    expect(fightTransition(before,{...before,version:2,standings:[{...standings[1],rank:1},{...standings[0],rank:2,points:8}]},"b")).toBeNull();
  });
  it("celebrates today's daily duel crossing without confusing series points or midnight settlement",()=>{
    const day={day:'2026-10-15',start_at:'2026-10-14T22:00:00Z',end_at:'2026-10-15T22:00:00Z',closed:false,winner_ids:[],standings};
    const daily:ArenaFightSummary={...before,scoring_mode:'daily',standings:standings.map(s=>({...s,match_points:s.id==='a'?1:4})),current_day:day};
    const crossed={...daily,version:2,current_day:{...day,standings:[{...standings[1],rank:1,points:11},{...standings[0],rank:2}]}};
    expect(fightTransition(daily,crossed,'b')).toMatchObject({kind:'lead',daily:true,previousLeader:'A'});
    expect(fightTransition(crossed,{...crossed,version:3,current_day:{...crossed.current_day,standings:[{...crossed.current_day.standings[0],points:12},crossed.current_day.standings[1]]}},'b')).toBeNull();
    expect(fightTransition(daily,{...daily,version:2,standings:daily.standings.map(s=>({...s,match_points:9})),current_day:{...day,day:'2026-10-16',standings:standings.map(s=>({...s,points:0}))}},'b')).toBeNull();
    expect(fightTransition(daily,{...crossed,current_day:{...day,standings:[standings[1],{...standings[0],points:8}]}},'b')).toBeNull();
  });
  it("formats countdown boundaries without wrapping a day or inventing time",()=>{
    const now=Date.parse("2026-10-14T10:00:00Z");
    expect(fightTime("2026-10-15T11:02:03Z",now)).toBe("1 d 01:02:03");expect(fightTime(undefined,now)).toBe("LIVE");
    expect(fightUrgency(new Date(now+60*60000).toISOString(),now)).toBe("calm");
    expect(fightUrgency(new Date(now+59*60000).toISOString(),now)).toBe("hour");expect(fightUrgency(new Date(now+14*60000).toISOString(),now)).toBe("quarter");expect(fightUrgency(new Date(now+4*60000).toISOString(),now)).toBe("final");expect(fightUrgency(new Date(now-1).toISOString(),now)).toBe("calm");
  });
});
