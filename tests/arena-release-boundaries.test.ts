import {expect,it,vi} from 'vitest';
import {arenaFixture} from './arena-fixture';
import worker from '../worker/index';

it('an expired Owner session cannot reopen Showtime or Discover authorization',async()=>{
 vi.useFakeTimers();vi.setSystemTime('2026-10-19T09:00:00Z');const f=arenaFixture();
 try{const cookie=await f.superLogin();expect((await f.call('/arena/superadmin/presentation-access','GET',undefined,cookie)).status).toBe(200);vi.setSystemTime('2026-10-19T13:00:01Z');expect((await f.call('/arena/superadmin/presentation-access','GET',undefined,cookie)).status).toBe(401);}finally{f.close();vi.useRealTimers();}
});
it('standalone Arena fails closed for legacy station and handbook APIs without reading a station DB',async()=>{
 const f=arenaFixture();try{f.env.ARENA_ONLY='1';f.env.DB=new Proxy({},{get(){throw Error('Station DB must not be accessed');}}) as D1Database;
  for(const path of ['/staff','/sales','/admin/login','/station/dashboard','/station/handbook','/admin/station/handbook'])expect((await f.call(path)).status).toBe(404);
  const root=await worker.fetch(new Request('https://arena.test/'),f.env);expect(root.status).toBe(302);expect(root.headers.get('Location')).toBe('https://arena.test/arena');
 }finally{f.close();}
});
