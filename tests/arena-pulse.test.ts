import {describe,it,expect} from 'vitest';
import {arenaPulse} from '../src/arena-pulse';
import {initial} from '../e2e/arena-release-fixture';
describe('Stationspuls: sourced progress, never an invented target or trend',()=>{
 it('uses the active station goal and rounds remaining points without negative rewards',()=>{
  const s=structuredClone(initial);s.station_goals[0].points=742.75;expect(arenaPulse(s).remaining).toBe(257.25);
  s.station_goals[0].points=1001;expect(arenaPulse(s).remaining).toBe(0);
 });
 it('does not invent a goal for missing, zero, expired or future targets',()=>{
  expect(arenaPulse(null)).toMatchObject({pace:null,remaining:null,strongest:null,lastActivity:null});
  for(const patch of [{target_points:0},{end_date:'2026-10-14'},{start_date:'2026-10-16'}]){
   const s=structuredClone(initial);Object.assign(s.station_goals[0],patch);expect(arenaPulse(s)).toMatchObject({pace:null,remaining:null});
  }
 });
 it('reports behind-plan and ahead-plan pace from calendar days, independently of stats totals',()=>{
  const s=structuredClone(initial);s.station_goals[0].points=100;
  expect(arenaPulse(s).pace).toMatchObject({percent:21,difference:-383.87,elapsed:15,days:31});
  const p=arenaPulse(s);s.today={count:999,points:999,sellers:999};expect(arenaPulse(s)).toEqual(p);
 });
 it('ranks activity counts only from full seller breakdowns, not the five-row recent list',()=>{
  const s=structuredClone(initial);s.leaderboard[0].activities=[{id:'wash',name:'Biltvätt',count:3,points:6,category:'Bil'},{id:'coffee',name:'Kaffe + bulle',count:2,points:2,category:'Fika'}];s.leaderboard[1].activities=[{id:'coffee',name:'Kaffe + bulle',count:4,points:4,category:'Fika'}];
  expect(arenaPulse(s).strongest).toEqual({id:'coffee',name:'Kaffe + bulle',count:6});
  s.leaderboard.forEach(p=>p.activities=[]);expect(arenaPulse(s).strongest).toBeNull();expect(arenaPulse(s).lastActivity?.activity_name).toBe('Biltvätt');
 });
});
