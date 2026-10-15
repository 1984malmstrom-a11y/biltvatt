import {expect,it,vi} from 'vitest';
import {writeFileSync} from 'node:fs';
import type {SQLInputValue} from 'node:sqlite';
import {arenaFixture} from './arena-fixture';
import {arenaStats} from '../worker/arena-stats';
it('realtime stats, goals and fight queries use indexed station/time searches',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));const f=arenaFixture();
 try{
  await f.call('/arena/bootstrap');
  f.arena.exec(`INSERT INTO arena_activities(id,station_id,name,points,created_at,updated_at) VALUES('qa-car','mastertest','Biltvätt',2,'2026-10-01','2026-10-01');
   INSERT INTO arena_station_goals(id,station_id,period_type,start_date,end_date,target_points,created_at,updated_at) VALUES('qa-goal','mastertest','month','2026-10-01','2026-10-31',1000,'2026-10-01','2026-10-01');
   INSERT INTO arena_campaigns(id,station_id,name,activity_id,start_at,end_at,created_at,updated_at) VALUES('qa-campaign','mastertest','Fokus','qa-car','2026-10-01','2026-11-01','2026-10-01','2026-10-01');
   INSERT INTO arena_fights(id,name,start_at,end_at,status,created_at,updated_at) VALUES('qa-fight','QA','2026-10-15T10:00:00Z','2026-10-15T14:00:00Z','active','2026-10-15','2026-10-15');
   INSERT INTO arena_fight_stations(fight_id,station_id) VALUES('qa-fight','mastertest');
   WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<5000)
   INSERT INTO arena_registrations(id,request_id,station_id,seller_id,activity_id,points_awarded,tb_ore_awarded,registered_at,created_at)
   SELECT 'qa-'||x,'qa-'||x,'mastertest',(SELECT id FROM arena_sellers WHERE station_id='mastertest' LIMIT 1),'qa-car',2,3500,'2026-10-'||printf('%02d',1+x%15)||'T11:00:00Z','2026-10-01' FROM n;`);
  const captured:{sql:string;params:unknown[]}[]=[],db=f.env.ARENA_DB!,prepare=db.prepare.bind(db);
  db.prepare=(sql:string)=>{const stmt=prepare(sql),bind=stmt.bind.bind(stmt);stmt.bind=(...params:unknown[])=>{captured.push({sql,params});return bind(...params);};return stmt;};
  await arenaStats(db,'mastertest',new URL('https://arena.test/?period=today'),new Date());
  const plans=captured.filter(q=>/^\s*SELECT/i.test(q.sql)&&/\b(?:FROM|JOIN) arena_registrations\b/.test(q.sql)).map(q=>({sql:q.sql,params:q.params,plan:f.arena.prepare('EXPLAIN QUERY PLAN '+q.sql).all(...q.params as SQLInputValue[]).map(p=>String(p.detail))}));
  expect(plans.length).toBeGreaterThanOrEqual(7);
  for(const p of plans){expect(p.plan.some(x=>/SEARCH (r|arena_registrations) USING (COVERING )?INDEX/.test(x))).toBe(true);expect(p.plan.some(x=>/SCAN (r|arena_registrations)( |$)/.test(x))).toBe(false);}
  if(process.env.ARENA_QUERY_PLAN_REPORT)writeFileSync(process.env.ARENA_QUERY_PLAN_REPORT,JSON.stringify({rows:5000,engine:'Node SQLite EXPLAIN QUERY PLAN with current local Arena migrations (D1-compatible SQL)',plans},null,2));
 }finally{f.close();vi.useRealTimers();}
});
