import {expect,it,vi} from 'vitest';
import {contestFixture,v2Now} from './arena-contest-v2-fixture';

it('portrait reads enforce district/region/national mandates and preserve Owner access',async()=>{
 vi.useFakeTimers();vi.setSystemTime(v2Now);const f=await contestFixture();
 try{
  const ids:Record<string,string>={};
  for(const station of ['o1:s0','o1:s2','o2:s0']){
   const id=ids[station]=crypto.randomUUID();
   f.arena.prepare('INSERT INTO arena_profile_images(id,seller_id,station_id,mime_type,image_bytes,width,height,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,station+':person',station,'image/png',new Uint8Array([1]),1,1,v2Now);
  }
  for(const level of ['district','region','national']){
   const admin=await f.admin(level,'o1');
   expect((await f.call('/arena/portraits/'+ids['o1:s0'],'GET',undefined,admin.cookie)).status).toBe(200);
   expect((await f.call('/arena/portraits/'+ids['o1:s2'],'GET',undefined,admin.cookie)).status).toBe(level==='national'?200:404);
   expect((await f.call('/arena/portraits/'+ids['o2:s0'],'GET',undefined,admin.cookie)).status).toBe(404);
   expect((await f.call('/arena/portraits/'+crypto.randomUUID(),'GET',undefined,admin.cookie)).status).toBe(404);
  }
  expect((await f.call('/arena/portraits/'+ids['o2:s0'],'GET',undefined,f.owner)).status).toBe(200);
  f.env.ARENA_ONLY='1';
  expect((await f.call('/arena/portraits/'+ids['o2:s0'])).status).toBe(401);
  expect((await f.call('/arena/portraits/'+ids['o2:s0'],'GET',undefined,f.cookies['o1:s0'])).status).toBe(404);
 }finally{f.close();vi.useRealTimers();}
});
