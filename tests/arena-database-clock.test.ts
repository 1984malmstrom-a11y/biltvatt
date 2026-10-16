import {expect,it,vi} from 'vitest';
import {arenaFixture} from './arena-fixture';

it('SQLite invitation guards follow the isolated clock, allowing valid and rejecting expired invitations',()=>{
 vi.useFakeTimers();vi.setSystemTime('2026-10-15T10:00:00.000Z');const f=arenaFixture();
 try{
  for(const id of ['clock-a','clock-b'])f.arena.prepare("INSERT INTO arena_stations(id,station_key,name,status,created_at,updated_at) VALUES(?,?,?,'active',?,?)").run(id,id,id,new Date().toISOString(),new Date().toISOString());
  for(const id of ['valid','expires'])f.arena.prepare("INSERT INTO arena_challenges(id,request_key,challenger_id,challenged_id,day,expires_at,rules_json,created_at,updated_at) VALUES(?,?,'clock-a','clock-b','2026-10-16','2026-10-16T22:00:00.000Z','{}',?,?)").run(id,id,new Date().toISOString(),new Date().toISOString());
  f.arena.prepare("UPDATE arena_challenges SET status='accepted' WHERE id='valid'").run();
  expect(f.arena.prepare("SELECT status FROM arena_challenges WHERE id='valid'").get()!.status).toBe('accepted');
  vi.setSystemTime('2026-10-16T22:00:00.000Z');
  expect(()=>f.arena.prepare("UPDATE arena_challenges SET status='accepted' WHERE id='expires'").run()).toThrow('arena_challenge_closed');
  expect(f.arena.prepare("SELECT status FROM arena_challenges WHERE id='expires'").get()!.status).toBe('pending');
 }finally{f.close();vi.useRealTimers();}
});
