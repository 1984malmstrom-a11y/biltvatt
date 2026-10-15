import {afterEach,describe,expect,it,vi} from 'vitest';
import {visibleArenaPolling,ARENA_SYNC_MS,ARENA_FIGHT_SYNC_MS} from '../src/arena-polling';
import {arenaLocalSale} from '../src/arena-local-sale';
import type {ArenaActivity,ArenaSeller,ArenaStats} from '../shared/arena';
afterEach(()=>vi.useRealTimers());
describe('Arena visible realtime scheduling',()=>{
 it('polls at 12s/5s, pauses hidden, refreshes immediately on return and never overlaps',async()=>{
  vi.useFakeTimers();const doc=Object.assign(new EventTarget(),{hidden:false});let active=false,finish:(()=>void)|undefined;
  const load=vi.fn(async()=>{if(finish)await new Promise<void>(r=>{finish=r;});});
  const stop=visibleArenaPolling(load,()=>active?ARENA_FIGHT_SYNC_MS:ARENA_SYNC_MS,doc);
  await vi.advanceTimersByTimeAsync(12000);expect(load).toHaveBeenCalledTimes(1);
  active=true;await vi.advanceTimersByTimeAsync(12000);expect(load).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(5000);expect(load).toHaveBeenCalledTimes(3);
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(60000);expect(load).toHaveBeenCalledTimes(3);
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(0);expect(load).toHaveBeenCalledTimes(4);
  finish=()=>{};await vi.advanceTimersByTimeAsync(5000);expect(load).toHaveBeenCalledTimes(5);await vi.advanceTimersByTimeAsync(60000);expect(load).toHaveBeenCalledTimes(5);
  finish!();finish=undefined;await vi.advanceTimersByTimeAsync(5000);expect(load).toHaveBeenCalledTimes(6);
  active=false;await vi.advanceTimersByTimeAsync(5000);await vi.advanceTimersByTimeAsync(11999);expect(load).toHaveBeenCalledTimes(7);await vi.advanceTimersByTimeAsync(1);expect(load).toHaveBeenCalledTimes(8);
  stop();await vi.advanceTimersByTimeAsync(60000);expect(load).toHaveBeenCalledTimes(8);
 });
});
const seller:ArenaSeller={id:'p',name:'Peter',external_staff_id:null,color:'#fff',active:1};
const activity:ArenaActivity={id:'car',name:'Biltvätt',category:'Bil',points:2,tb_ore:3500,active:1,image_key:null,offer_text:'',price_text:'',sort_order:0};
const stats:ArenaStats={range:{start:'2026-10-15',end:'2026-10-15',from:'',to:''},count:0,points:0,today:{points:0,count:0,sellers:0},leaderboard:[{...seller,rank:1,count:0,points:0,activities:[]}],recent:[],campaign:null,station_goals:[],personal_goals:[]};
describe('Immediate local sale projection',()=>{
 it('updates board, feed, KPI and TB without mutating the rollback snapshot',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
  const next=arenaLocalSale(stats,seller,activity,{id:'pending',seller_id:'p',activity_id:'car',registered_at:new Date().toISOString(),points_awarded:2,tb_ore_awarded:3500,voided_at:null})!;
  expect(next).toMatchObject({count:1,points:2,tb_ore:3500,today:{count:1,points:2,sellers:1}});expect(next.recent![0].seller_name).toBe('Peter');expect(next.leaderboard[0].activities[0]).toMatchObject({id:'car',count:1,points:2});expect(stats.count).toBe(0);expect(stats.recent).toEqual([]);
 });
 it('keeps historical/filtered leaderboards unchanged and never guesses fight outcomes',()=>{
  const source={...stats,range:{...stats.range,start:'2026-09-01',end:'2026-09-30'}};
  const next=arenaLocalSale(source,seller,activity,{id:'pending',seller_id:'p',activity_id:'car',registered_at:'2026-10-15T12:00:00Z',points_awarded:2,voided_at:null},{activityId:'other',category:''})!;
  expect(next.points).toBe(0);expect(next.leaderboard).toEqual(source.leaderboard);expect(next.fight).toBe(source.fight);
 });
});
