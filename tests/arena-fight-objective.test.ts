import {afterEach,describe,it,expect} from 'vitest';
import {arenaFixture} from './arena-fixture';
import {fightActivityObjective} from '../worker/arena-dashboard-context';
import {arenaFightQualifies} from '../src/arena-fight-objective';
import {boot,initial,fight} from '../e2e/arena-release-fixture';
import type {ArenaStats} from '../shared/arena';
const fixtures:ReturnType<typeof arenaFixture>[]=[];
afterEach(()=>fixtures.splice(0).forEach(f=>f.close()));
function setup(scope:Record<string,unknown>|null){
 const f=arenaFixture();fixtures.push(f);const at='2026-10-15T10:00:00Z';
 for(const id of ['review','other']){
  f.arena.prepare("INSERT INTO arena_stations(id,station_key,name,status,created_at,updated_at) VALUES(?,?,?,'active',?,?)").run(id,id,id,at,at);
  for(const n of ['a','b'])f.arena.prepare("INSERT INTO arena_activities(id,station_id,name,arena_category_id,created_at,updated_at) VALUES(?,?,?,'fika',?,?)").run(`${id}:${n}`,id,n,at,at);
 }
 f.arena.prepare("INSERT INTO arena_fights(id,name,start_at,end_at,status,scope_json,created_at,updated_at) VALUES(?,?,?,?,'active',?,?,?)").run(fight.id,'QA',fight.start_at,fight.end_at,scope?JSON.stringify(scope):null,at,at);
 for(const id of ['review','other'])f.arena.prepare('INSERT INTO arena_fight_stations(fight_id,station_id) VALUES(?,?)').run(fight.id,id);
 return f;
}
describe('Fight objectives use the same frozen local rule IDs as scoring',()=>{
 it.each(['all','focus','category','activity'])('reads frozen %s membership even after current category/name/focus changes',async kind=>{
  const f=setup({kind,category_id:'fika'});
  for(const id of ['review:a','other:b'])f.arena.prepare('INSERT INTO arena_fight_activity_rules(fight_id,station_id,activity_id,snapshot_json) VALUES(?,?,?,?)').run(fight.id,id.split(':')[0],id,JSON.stringify({name:'Frozen name',arena_category_id:'fika'}));
  f.arena.prepare("UPDATE arena_activities SET name='Changed',arena_category_id='wash' WHERE id='review:a'").run();
  expect(await fightActivityObjective(f.env.ARENA_DB!,fight,'review')).toEqual({fight_id:fight.id,scope:kind,activity_ids:['review:a']});
  expect(await fightActivityObjective(f.env.ARENA_DB!,fight,'other')).toEqual({fight_id:fight.id,scope:kind,activity_ids:['other:b']});
  expect(await fightActivityObjective(f.env.ARENA_DB!,fight,'outsider')).toBeUndefined();
 });
 it('distinguishes an empty scoped mapping from legacy unscoped all-activity scoring',async()=>{
  const scoped=setup({kind:'activity',activity_ids:{}}),legacy=setup(null);
  expect((await fightActivityObjective(scoped.env.ARENA_DB!,fight,'review'))?.activity_ids).toEqual([]);
  expect(await fightActivityObjective(legacy.env.ARENA_DB!,fight,'review')).toEqual({fight_id:fight.id,scope:'all',activity_ids:null});
 });
 it('never publishes objectives for absent, scheduled, cancelled or completed fights',async()=>{
  const f=setup(null);
  for(const phase of ['scheduled','cancelled','finished'] as const)expect(await fightActivityObjective(f.env.ARENA_DB!,{...fight,phase},'review')).toBeUndefined();
  expect(await fightActivityObjective(f.env.ARENA_DB!,null,'review')).toBeUndefined();
  f.arena.prepare("UPDATE arena_fights SET status='cancelled' WHERE id=?").run(fight.id);
  expect(await fightActivityObjective(f.env.ARENA_DB!,fight,'review')).toBeUndefined();
 });
 it('requires active matching authoritative rules and an available local activity; never infers by category',()=>{
  const activity=boot.activities[3],base:ArenaStats={...initial,fight,fight_objective:{fight_id:fight.id,scope:'category',activity_ids:[activity.id]}};
  expect(arenaFightQualifies(base,activity)).toBe(true);
  for(const s of [initial,{...base,fight_objective:undefined},{...base,fight:{...fight,phase:'finished' as const}},{...base,fight_objective:{...base.fight_objective!,fight_id:'other'}},{...base,fight_objective:{...base.fight_objective!,activity_ids:[]}}])expect(arenaFightQualifies(s,activity)).toBe(false);
  expect(arenaFightQualifies(base,{...activity,active:0})).toBe(false);expect(arenaFightQualifies(base,null)).toBe(false);
  expect(arenaFightQualifies({...base,fight_objective:{...base.fight_objective!,activity_ids:null}},boot.activities[0])).toBe(true);
 });
});
