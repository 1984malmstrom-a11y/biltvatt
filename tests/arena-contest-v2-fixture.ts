import {arenaFixture} from './arena-fixture';
import {randomToken,tokenHash} from '../shared/arena-crypto';
import type {CompetitionInput} from '../shared/arena-competitions';
export const v2Now='2026-10-15T10:00:00.000Z';
export async function contestFixture(){
 const f=arenaFixture(),cookies:Record<string,string>={};
 for(const org of ['o1','o2']){
  f.arena.prepare('INSERT INTO arena_organizations VALUES(?,?,?,?)').run(org,`Testorganisation ${org}`,'SE',v2Now);
  for(const i of [0,1]){const region=`${org}:r${i}`,district=`${org}:d${i}`;f.arena.prepare('INSERT INTO arena_regions VALUES(?,?,?)').run(region,org,`Testregion ${i}`);f.arena.prepare('INSERT INTO arena_districts VALUES(?,?,?,?)').run(district,org,region,`Testdistrikt ${i}`);
   for(let j=0;j<2;j++){const id=`${org}:s${i*2+j}`;f.arena.prepare("INSERT INTO arena_stations(id,station_key,name,status,kind,created_at,updated_at) VALUES(?,?,?,'active','arena',?,?)").run(id,id,`Demostation ${i*2+j}`,v2Now,v2Now);f.arena.prepare('INSERT INTO arena_station_organization VALUES(?,?,?,?)').run(id,org,region,district);f.arena.prepare("INSERT INTO arena_sellers(id,station_id,name,source,created_at,updated_at) VALUES(?,?,?,'arena',?,?)").run(`${id}:person`,id,`Testsäljare ${i*2+j}`,v2Now,v2Now);
    for(const cat of ['wash','fika'])f.arena.prepare('INSERT INTO arena_activities(id,station_id,name,points,tb_ore,arena_category_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(`${id}:${cat}`,id,cat,cat==='wash'?2:1,3500,cat,v2Now,v2Now);
    f.arena.prepare('INSERT INTO arena_customer_flow VALUES(?,?,?,?,?,?,?,?)').run(`${id}:flow`,id,(j?400:200)*1000,'Synthetic test measurement','2026-09-01','2026-09-30',v2Now,'test-owner');
    const token=randomToken();f.arena.prepare('INSERT INTO arena_station_sessions VALUES(?,?,?,?,?,NULL)').run(crypto.randomUUID(),await tokenHash(token),id,v2Now,'2027-01-01T00:00:00Z');cookies[id]=`arena_station_session=${token}`;
   }
  }
 }
 const owner=await f.superLogin();
 async function admin(level='district',org='o1'){
  const id=crypto.randomUUID(),token=randomToken();f.arena.prepare("INSERT INTO arena_superadmins(id,email_normalized,display_name,role,status,email_verified_at,created_at,updated_at) VALUES(?,?,?,'superadmin','active',?,?,?)").run(id,`${id}@example.test`,'Scoped test admin',v2Now,v2Now,v2Now);f.arena.prepare('INSERT INTO arena_organization_grants VALUES(?,?,?,?,?)').run(id,org,level,level==='national'?'':`${org}:r0`,level==='district'?`${org}:d0`:'');
  f.arena.prepare('INSERT INTO arena_superadmin_sessions(token_hash,created_at,expires_at,account_id,auth_epoch) VALUES(?,?,?,?,0)').run(await tokenHash(token),v2Now,'2027-01-01T00:00:00Z',id);return {id,cookie:`arena_superadmin_session=${token}`};
 }
 const sale=(station:string,cat='wash',points=2,at='2026-10-16T10:00:00.000Z')=>{const id=crypto.randomUUID();f.arena.prepare('INSERT INTO arena_registrations(id,station_id,seller_id,activity_id,request_id,points_awarded,tb_ore_awarded,registered_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,station,`${station}:person`,`${station}:${cat}`,id,points,3500,at,at);return id;};
 return {...f,owner,cookies,admin,sale};
}
export const contestDraft=(kind:NonNullable<CompetitionInput['contest']>['kind']='station'):CompetitionInput=>({name:'Syntetisk V2-tävling',request_id:crypto.randomUUID(),format:kind==='championship'?'league':'sprint',metric:'points',station_ids:['o1:s0','o1:s1'],start_day:'2026-10-16',end_day:'2026-10-16',double_round:false,playoff_size:2,match_days:1,win:1,draw:.5,secondary_metric:'tb',tie_rule:'secondary',scope:{kind:'all'},contest:{kind,organization_id:'o1',level:'selected',categories:[{id:'wash',name:'',points_milli:2000},{id:'fika',name:'',points_milli:1000}]}});
