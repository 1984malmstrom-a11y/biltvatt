import {it,expect,afterEach,vi} from 'vitest';
import {contestFixture,v2Now,contestDraft} from './arena-contest-v2-fixture';
import {competitionView} from '../worker/arena-competitions';
const fixtures:Awaited<ReturnType<typeof contestFixture>>[]=[];
afterEach(()=>{fixtures.splice(0).forEach(f=>f.close());vi.useRealTimers();});
async function setup(){vi.useFakeTimers();vi.setSystemTime(v2Now);const f=await contestFixture();fixtures.push(f);const admins:Record<string,string>={};for(const id of ['o1:s0','o1:s1','o1:s2','o2:s0'])admins[id]=await f.stationAdmin(f.cookies[id]);return {...f,admins};}
async function send(f:Awaited<ReturnType<typeof setup>>,from='o1:s0',to='o1:s1',day='2026-10-16'){
 const r=await f.call('/admin/arena/challenges','POST',{request_id:crypto.randomUUID(),opponent_id:to,day,metric:'points',scope:{kind:'category',category_id:'wash'}},f.admins[from]);expect(r.status,await r.clone().text()).toBe(201);return (await r.json() as any).id as string;
}
it('discovers only own organization, sends and accepts a frozen same-organization duel, replays safely and preserves membership',async()=>{
 const f=await setup();const center=await(await f.call('/arena/fight-center','GET',undefined,f.cookies['o1:s0'])).json() as any;
 expect(center.stations.map((s:any)=>s.id).sort()).toEqual(['o1:s0','o1:s1','o1:s2','o1:s3']);expect(center.activities.length).toBe(2);
 const id=await send(f);const inbox=await(await f.call('/arena/fight-center','GET',undefined,f.cookies['o1:s1'])).json() as any;expect(inbox.incoming).toBe(1);expect(inbox.challenges[0].id).toBe(id);
 for(let i=0;i<2;i++){const r=await f.call(`/admin/arena/challenges/${id}/accept`,'POST',{confirm:true},f.admins['o1:s1']);expect(r.status,await r.clone().text()).toBe(200);}
 const row=f.arena.prepare('SELECT organization_id FROM arena_leagues WHERE id=?').get(`duel:${id}`)!;expect(row.organization_id).toBe('o1');expect(f.arena.prepare('SELECT COUNT(*) n FROM arena_fights').get()!.n).toBe(1);expect(f.arena.prepare("SELECT COUNT(*) n FROM arena_station_organization WHERE organization_id='o1'").get()!.n).toBe(4);
 vi.setSystemTime('2026-10-16T10:00:00Z');const r=await f.call('/arena/stats','GET',undefined,f.cookies['o1:s0']);const stats=await r.json() as any;expect(stats.battle.categories.map((c:any)=>c.id)).toEqual(['wash']);expect(stats.fight.standings).toHaveLength(2);
});
it('rejects cross-organization, mixed legacy/organization and non-admin or forged participant requests without records',async()=>{
 const f=await setup();
 for(const [from,to] of [['o1:s0','o2:s0'],['o1:s0','mastertest']]){const r=await f.call('/admin/arena/challenges','POST',{request_id:crypto.randomUUID(),opponent_id:to,day:'2026-10-16',metric:'points',scope:{kind:'all'}},f.admins[from]);expect(r.status).toBe(403);}
 const body={request_id:crypto.randomUUID(),opponent_id:'o1:s1',day:'2026-10-16',metric:'points',scope:{kind:'all'}};
 expect((await f.call('/admin/arena/challenges','POST',body,f.cookies['o1:s0'])).status).toBe(401);
 expect((await f.call('/admin/arena/challenges','POST',{...body,station_id:'o2:s0'},f.admins['o1:s0'])).status).toBe(400);
 expect(f.arena.prepare('SELECT COUNT(*) n FROM arena_challenges').get()!.n).toBe(0);
});
it('only intended parties can respond/read/cancel; future org changes cannot revive a pending challenge',async()=>{
 const f=await setup(),id=await send(f);
 for(const action of ['accept','decline','cancel'])expect((await f.call(`/admin/arena/challenges/${id}/${action}`,'POST',{confirm:true,reason:'Test'},f.admins['o2:s0'])).status).toBe(404);
 expect((await f.call(`/admin/arena/challenges/${id}/accept`,'POST',{confirm:true},f.admins['o1:s0'])).status).toBe(403);
 expect((await f.call(`/admin/arena/challenges/${id}/accept`,'POST',{confirm:false},f.admins['o1:s1'])).status).toBe(400);
 f.arena.prepare("UPDATE arena_station_organization SET organization_id='o2',region_id='o2:r0',district_id='o2:d0' WHERE station_id='o1:s1'").run();
 expect((await f.call(`/admin/arena/challenges/${id}/accept`,'POST',{confirm:true},f.admins['o1:s1'])).status).toBe(403);
 const c=await(await f.call('/arena/fight-center','GET',undefined,f.cookies['o1:s0'])).json() as any;expect(c.challenges).toEqual([]);expect(c.bookings.every((b:any)=>!b.station_id.startsWith('o2:'))).toBe(true);
 expect(f.arena.prepare('SELECT COUNT(*) n FROM arena_fights').get()!.n).toBe(0);
});
it('concurrent accepts cannot double-book; decline and authorized cancel retain audit/history and release only their bookings',async()=>{
 const f=await setup(),a=await send(f),b=await send(f,'o1:s2','o1:s1');
 const responses=await Promise.all([a,b].map(id=>f.call(`/admin/arena/challenges/${id}/accept`,'POST',{confirm:true},f.admins['o1:s1'])));expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
 const accepted=f.arena.prepare("SELECT id,competition_id FROM arena_challenges WHERE status='accepted'").get() as {id:string;competition_id:string};
 const declined=[a,b].find(id=>id!==accepted.id)!;expect((await f.call(`/admin/arena/challenges/${declined}/decline`,'POST',{reason:'Test decline'},f.admins['o1:s1'])).status).toBe(200);
 vi.setSystemTime('2026-10-16T10:00:00Z');expect((await f.call(`/admin/arena/challenges/${accepted.id}/cancel`,'POST',{confirm:true,reason:'Synthetic test cancellation'},await f.stationAdmin(f.cookies['o1:s1']))).status).toBe(200);
 expect((await competitionView(f.env.ARENA_DB!,accepted.competition_id)).phase).toBe('cancelled');expect(f.arena.prepare('SELECT COUNT(*) n FROM arena_station_bookings WHERE released_at IS NULL').get()!.n).toBe(0);expect(f.arena.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});
it('accepted org duel remains unreadable outside organization; generic creation cannot forge the challenge exception',async()=>{
 const f=await setup(),id=await send(f);await f.call(`/admin/arena/challenges/${id}/accept`,'POST',{confirm:true},f.admins['o1:s1']);
 for(const path of [`/arena/competitions/duel:${id}`,`/arena/fights/duel:${id}:direct`])expect((await f.call(path,'GET',undefined,f.cookies['o2:s0'])).status).toBe(404);
 const pending=await send(f,'o1:s2','o1:s1','2026-10-17');const forged=contestDraft('fight');delete forged.contest;forged.format='daily';forged.request_id=`challenge:${pending}`;
 expect((await f.call('/admin/arena/competitions','POST',forged,f.admins['o1:s1'])).status).toBe(403);
 expect((await f.call('/arena/superadmin/competitions','POST',forged,f.owner)).status).toBe(400);
});
it('freezes invitation tenant even if both stations move together before acceptance',async()=>{
 const f=await setup(),id=await send(f);
 f.arena.prepare("UPDATE arena_station_organization SET organization_id='o2',region_id='o2:r0',district_id='o2:d0' WHERE station_id IN ('o1:s0','o1:s1')").run();
 expect((await f.call(`/admin/arena/challenges/${id}/accept`,'POST',{confirm:true},f.admins['o1:s1'])).status).toBe(409);
 const center=await(await f.call('/arena/fight-center','GET',undefined,f.cookies['o1:s1'])).json() as any;expect(center.challenges).toEqual([]);expect(center.incoming).toBe(0);
 const stats=await(await f.call('/arena/stats','GET',undefined,f.cookies['o1:s1'])).json() as any;expect(stats.fight_notices.incoming).toBe(0);
 expect(f.arena.prepare('SELECT COUNT(*) n FROM arena_leagues').get()!.n).toBe(0);
});
it('same-organization invitations retain recipient-owned activity mapping and reject foreign mapping',async()=>{
 const f=await setup();const r=await f.call('/admin/arena/challenges','POST',{request_id:crypto.randomUUID(),opponent_id:'o1:s1',day:'2026-10-16',metric:'points',scope:{kind:'activity',activity_ids:{'o1:s0':'o1:s0:wash'}}},f.admins['o1:s0']);expect(r.status).toBe(201);const id=(await r.json() as any).id;
 expect((await f.call(`/admin/arena/challenges/${id}/accept`,'POST',{confirm:true,activity_id:'o2:s0:wash'},f.admins['o1:s1'])).status).toBe(400);
 const accepted=await f.call(`/admin/arena/challenges/${id}/accept`,'POST',{confirm:true,activity_id:'o1:s1:wash'},f.admins['o1:s1']);expect(accepted.status,await accepted.clone().text()).toBe(200);
 const c=await competitionView(f.env.ARENA_DB!,`duel:${id}`);expect(c.rules.scope.activity_ids).toEqual({'o1:s0':'o1:s0:wash','o1:s1':'o1:s1:wash'});expect(f.arena.prepare('SELECT activity_id FROM arena_fight_activity_rules ORDER BY activity_id').all().map(a=>a.activity_id)).toEqual(['o1:s0:wash','o1:s1:wash']);
});
