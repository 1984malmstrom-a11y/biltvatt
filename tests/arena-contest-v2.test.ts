import {it,expect,afterEach,vi} from 'vitest';
import {contestFixture,contestDraft,v2Now} from './arena-contest-v2-fixture';
import {competitionView} from '../worker/arena-competitions';
import {competitionSchedule} from '../shared/arena-competitions';
import {fairPlayScore} from '../shared/arena-contest';
import {awardOptions} from '../shared/arena-awards';
const fixtures:Awaited<ReturnType<typeof contestFixture>>[]=[];
afterEach(()=>{fixtures.splice(0).forEach(f=>f.close());vi.useRealTimers();});
async function setup(){vi.useFakeTimers();vi.setSystemTime(v2Now);const f=await contestFixture();fixtures.push(f);return f;}
async function create(f:Awaited<ReturnType<typeof setup>>,d=contestDraft(),cookie=f.owner){const res=await f.call('/arena/superadmin/competitions','POST',d,cookie);expect(res.status,await res.clone().text()).toBe(201);return (await res.json() as any).id as string;}
it('one ledger sale contributes to parallel individual/station competitions, undo removes both without duplicate counting',async()=>{
 const f=await setup(),station=await create(f),person=await create(f,contestDraft('individual'));expect(f.arena.prepare('SELECT COUNT(*) n FROM arena_fights').get()!.n).toBe(0);expect(f.arena.prepare('SELECT COUNT(*) n FROM arena_station_bookings').get()!.n).toBe(0);
 const sale=f.sale('o1:s0');vi.setSystemTime('2026-10-16T12:00:00Z');for(const id of [station,person]){let c=await competitionView(f.env.ARENA_DB!,id,'o1:s0');expect(c.entries![0]).toMatchObject({count:1,points:2});}
 f.arena.prepare('UPDATE arena_registrations SET voided_at=? WHERE id=?').run('2026-10-16T11:00:00Z',sale);for(const id of [station,person])expect((await competitionView(f.env.ARENA_DB!,id)).entries!.every(e=>e.points===0)).toBe(true);
});
it('rejects foreign organizations, forged customer snapshots, >7 categories and national scope without central mandate',async()=>{
 const f=await setup(),admin=await f.admin(),d=contestDraft();d.station_ids[1]='o2:s0';expect((await f.call('/arena/superadmin/competitions','POST',d,admin.cookie)).status).toBe(403);
 const national=contestDraft();national.contest!.level='national';national.station_ids=['o1:s0','o1:s1','o1:s2','o1:s3'];expect((await f.call('/arena/superadmin/competitions','POST',national,admin.cookie)).status).toBe(403);
 const invalid=contestDraft() as any;invalid.contest.flows=[];expect((await f.call('/arena/superadmin/competitions','POST',invalid,f.owner)).status).toBe(400);delete invalid.contest.flows;invalid.contest.categories=Array(8).fill(invalid.contest.categories[0]);expect((await f.call('/arena/superadmin/competitions','POST',invalid,f.owner)).status).toBe(400);
});
it.each(['individual','station'] as const)('%s supports local, district, region and national scopes with server-side selection',async kind=>{
 const f=await setup();for(const level of ['local','district','region','national'] as const){const d=contestDraft(kind);d.contest!.level=level;if(level==='local')d.station_ids=['o1:s0'];if(level==='district'){d.contest!.district_id='o1:d0';d.contest!.region_id='o1:r0';}if(level==='region')d.contest!.region_id='o1:r0';if(level==='national')d.station_ids=['o1:s0','o1:s1','o1:s2','o1:s3'];const id=await create(f,d);expect((await competitionView(f.env.ARENA_DB!,id)).rules.station_ids).toEqual(d.station_ids);}
});
it('FREEZES categories, participants, customer flows and final results; uses existing awards without inventing a duel',async()=>{
 const f=await setup(),d=contestDraft();d.contest!.fair_play={reference_milli:800000,max_factor_milli:4000,confirmed:true};const id=await create(f,d);f.sale('o1:s0');vi.setSystemTime('2026-10-16T12:00:00Z');let c=await competitionView(f.env.ARENA_DB!,id);expect(c.entries![0]).toMatchObject({raw_points:2,base_milli:2000,adjusted_milli:8000,points:8});expect(f.arena.prepare('SELECT points_awarded FROM arena_registrations').get()!.points_awarded).toBe(2);
 f.arena.prepare("UPDATE arena_activities SET points=99,arena_category_id='other'").run();expect((await competitionView(f.env.ARENA_DB!,id)).entries![0].points).toBe(8);
 vi.setSystemTime('2026-10-17T12:00:00Z');c=await competitionView(f.env.ARENA_DB!,id);const frozen=JSON.stringify(c);f.arena.prepare('UPDATE arena_registrations SET voided_at=?').run('2026-10-17T10:00:00Z');expect(JSON.stringify(await competitionView(f.env.ARENA_DB!,id))).toBe(frozen);
 const report=JSON.parse(f.arena.prepare('SELECT snapshot_json FROM arena_reports WHERE competition_id=?').get(id)!.snapshot_json as string);expect(awardOptions(report).map(o=>o.variant)).toEqual(['station']);expect(()=>f.arena.prepare("UPDATE arena_leagues SET rules_json='{}' WHERE id=?").run(id)).toThrow(/immutable/);
});
it('scope grants cannot read/cancel private competitions or use legacy global admin endpoints',async()=>{
 const f=await setup(),a=await f.admin(),d=contestDraft();d.station_ids=['o1:s2','o1:s3'];const id=await create(f,d);
 expect((await f.call(`/arena/superadmin/competitions/${id}`,'GET',undefined,a.cookie)).status).toBe(404);expect((await f.call(`/arena/superadmin/competitions/${id}/cancel`,'POST',{confirm:true,reason:'No'},a.cookie)).status).toBe(404);
 expect((await f.call('/arena/superadmin/stations','GET',undefined,a.cookie)).status).toBe(403);const context=await(await f.call('/arena/superadmin/organization-context','GET',undefined,a.cookie)).json() as any;expect(context.stations).toHaveLength(2);expect(context.organizations).toHaveLength(1);
});
it('40 station league creates 780 exact two-station matches, not one 40 station fight',()=>{const d=contestDraft('championship');d.station_ids=Array.from({length:40},(_,i)=>`s${i}`);const plan=competitionSchedule(d);expect(plan).toHaveLength(780);expect(plan.every(p=>p.home!==p.away)).toBe(true);});
it('fair play uses exact rational cap, per-sale HALF UP and refuses invalid inputs',()=>{for(const [customers,result] of [[200000,4000],[400000,2000],[800000,1000]])expect(fairPlayScore(1000,customers,800000,4000)).toBe(result);expect(fairPlayScore(1,2000,1000,4000)).toBe(1);expect(fairPlayScore(1000,1000,800000,3000)).toBe(3000);for(const customer of [0,-1,NaN,Infinity])expect(()=>fairPlayScore(1000,customer,800000,4000)).toThrow();});
