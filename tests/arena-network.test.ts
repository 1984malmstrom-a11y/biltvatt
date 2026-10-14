import { afterEach,describe,expect,it,vi } from "vitest";
import { arenaFixture } from "./arena-fixture";
import { passwordHash, passwordMatches } from "../shared/arena-crypto";
import type { ArenaBootstrap } from "../shared/arena";
import type { ArenaGroupBoard } from "../shared/arena-network";
import { rankStations } from "../worker/arena-network";

const fixtures:ReturnType<typeof arenaFixture>[]=[];
const setup=()=>{const f=arenaFixture();fixtures.push(f);return f;};
afterEach(()=>{vi.useRealTimers();fixtures.splice(0).forEach(f=>f.close());});
const pass="Local-only passphrase 2026";
async function signup(f:ReturnType<typeof setup>,name="Malmö",email="malmo@example.test") {
  const response=await f.call("/arena/auth/signup","POST",{name,email,password:pass});expect(response.status).toBe(201);
  return {response,cookie:f.cookie(response),station:(await response.json() as {station:{id:string;status:string}}).station};
}
async function active(f:ReturnType<typeof setup>,name="Malmö",email="malmo@example.test") {
  const account=await signup(f,name,email),admin=await f.superLogin();expect((await f.call(`/arena/superadmin/stations/${account.station.id}`,"PATCH",{status:"active"},admin)).status).toBe(200);return {...account,admin};
}
const draft={name:"Kaffe + bulle",offer_text:"",price_text:"",points:2,tb_kronor:"35,25",display_mode:"tb",image_key:null,category:"Mat",sort_order:0,active:1};
describe("Arena station authentication and tenant isolation",()=>{
  it("Arena-only works without a dashboard DB and rejects dashboard APIs",async()=>{
    const f=setup();f.env.ARENA_ONLY="1";f.env.DB=undefined as unknown as D1Database;const account=await active(f);
    expect((await f.call("/arena/bootstrap","GET",undefined,account.cookie)).status).toBe(200);expect((await f.call("/admin/arena/config","GET",undefined,account.cookie)).status).toBe(200);expect((await f.call("/arena/stats","GET",undefined,account.cookie)).status).toBe(200);
    expect((await f.call("/staff","GET",undefined,account.cookie)).status).toBe(404);
  });
  it("signup is pending, uses a salted KDF and a long HttpOnly token, and grants no premature access",async()=>{
    const f=setup();f.env.ARENA_ONLY="1";expect((await f.call("/arena/bootstrap")).status).toBe(401);
    const account=await signup(f);expect(account.station.status).toBe("pending");
    const header=account.response.headers.get("Set-Cookie")!;expect(header).toContain("HttpOnly");expect(header).toContain("Secure");expect(header).toContain("SameSite=Lax");expect(header).toContain("Max-Age=31536000");
    const stored=f.arena.prepare("SELECT * FROM arena_station_accounts").get()!;expect(stored.password_hash).not.toBe(pass);expect(stored.password_iterations).toBe(100000);expect(String(stored.password_salt)).toHaveLength(64);
    const session=f.arena.prepare("SELECT token_hash FROM arena_station_sessions").get()!;expect(account.cookie).not.toContain(String(session.token_hash));
    expect((await f.call("/arena/bootstrap","GET",undefined,`arena_station_session=${session.token_hash}`)).status).toBe(401);
    expect((await f.call("/arena/bootstrap","GET",undefined,account.cookie)).status).toBe(403);expect((await f.call("/arena/stats","GET",undefined,account.cookie)).status).toBe(403);expect((await f.call("/admin/arena/config","GET",undefined,account.cookie)).status).toBe(403);
    const info=await (await f.call("/arena/auth/session","GET",undefined,account.cookie)).json();expect(JSON.stringify(info)).not.toContain("password_hash");expect(JSON.stringify(info)).not.toContain("token_hash");
  });
  it("approval preserves pending login, supports Arena-only sellers and rejects client station IDs",async()=>{
    const f=setup(),a=await active(f);const b=await (await f.call("/arena/bootstrap","GET",undefined,a.cookie)).json() as ArenaBootstrap;
    expect(b.station).toMatchObject({id:a.station.id,kind:"arena",status:"active"});expect(b.sellers).toEqual([]);
    expect((await f.call("/arena/stats?station_id=other","GET",undefined,a.cookie)).status).toBe(400);
    const created=await f.call("/admin/arena/sellers","POST",{name:"Peter",color:"#123456",active:1},a.cookie);expect(created.status).toBe(201);const seller=(await created.json() as {id:string}).id;
    const activity=(await (await f.call("/admin/arena/activities","POST",draft,a.cookie)).json() as {id:string}).id;
    const registered=await f.call("/arena/registrations","POST",{activity_id:activity,seller_id:seller,request_id:crypto.randomUUID()},a.cookie);expect(registered.status).toBe(200);expect(await registered.json()).toMatchObject({registration:{points_awarded:2,tb_ore_awarded:3525}});
    expect((await f.call("/admin/arena/sellers","POST",{name:"Other",color:"#123456",active:1,station_id:"other"},a.cookie)).status).toBe(400);
    expect((await f.call(`/admin/arena/sellers/${seller}`,"PATCH",{name:"Peter",color:"#123456",active:0},a.cookie)).status).toBe(200);
    expect((await f.call("/arena/registrations","POST",{activity_id:activity,seller_id:seller,request_id:crypto.randomUUID()},a.cookie)).status).toBe(400);
    expect(await (await f.call("/arena/stats?metric=tb","GET",undefined,a.cookie)).json()).toMatchObject({count:1,tb_ore:3525});
  });
  it("login, renewal, logout and station-owned session revocation are persistent and isolated",async()=>{
    const f=setup(),a=await active(f);vi.useFakeTimers();const now=Date.now();vi.setSystemTime(now+9*3600000);
    expect((await f.call("/arena/bootstrap","GET",undefined,a.cookie)).status).toBe(200);
    const login=await f.call("/arena/auth/login","POST",{email:"MALMO@example.test",password:pass});expect(login.status).toBe(200);const cookie=f.cookie(login);
    let info=await (await f.call("/arena/auth/session","GET",undefined,cookie)).json() as {sessions:{id:string}[];session_id:string};expect(info.sessions).toHaveLength(2);
    const other=info.sessions.find(s=>s.id!==info.session_id)!;expect((await f.call("/arena/auth/revoke","POST",{session_id:other.id},cookie)).status).toBe(200);expect((await f.call("/arena/bootstrap","GET",undefined,a.cookie)).status).toBe(401);
    vi.setSystemTime(now+340*86400000);const renew=await f.call("/arena/bootstrap","GET",undefined,cookie);expect(renew.status).toBe(200);expect(renew.headers.get("Set-Cookie")).toContain("Max-Age=31536000");
    expect((await f.call("/arena/auth/logout","POST",undefined,cookie)).status).toBe(200);expect((await f.call("/arena/bootstrap","GET",undefined,cookie)).status).toBe(401);
  });
  it("suspension revokes station sessions and reactivation requires a fresh valid login",async()=>{
    const f=setup(),a=await active(f);expect((await f.call(`/arena/superadmin/stations/${a.station.id}`,"PATCH",{status:"suspended"},a.admin)).status).toBe(200);
    expect((await f.call("/arena/bootstrap","GET",undefined,a.cookie)).status).toBe(401);expect((await f.call("/arena/auth/login","POST",{email:"malmo@example.test",password:pass})).status).toBe(403);
    await f.call(`/arena/superadmin/stations/${a.station.id}`,"PATCH",{status:"active"},a.admin);const login=await f.call("/arena/auth/login","POST",{email:"malmo@example.test",password:pass});expect(login.status).toBe(200);expect((await f.call("/arena/bootstrap","GET",undefined,f.cookie(login))).status).toBe(200);
    expect((await f.call(`/arena/superadmin/stations/${a.station.id}/revoke`,"POST",undefined,a.admin)).status).toBe(200);expect((await f.call("/arena/bootstrap","GET",undefined,f.cookie(login))).status).toBe(401);
  });
  it("credentials, station sessions and legacy admin sessions never grant Superadmin",async()=>{
    const f=setup(),a=await active(f),legacy=await f.login();
    for(const cookie of [undefined,a.cookie,legacy])expect((await f.call("/arena/superadmin/stations","GET",undefined,cookie)).status).toBe(401);
    expect((await f.call("/arena/auth/superadmin/login","POST",{secret:"incorrect-test-key-long-enough-12345"})).status).toBe(401);
    expect((await f.call("/arena/superadmin/stations","GET",undefined,a.admin)).status).toBe(200);expect((await f.call("/arena/auth/superadmin/logout","POST",undefined,a.admin)).status).toBe(200);expect((await f.call("/arena/superadmin/stations","GET",undefined,a.admin)).status).toBe(401);
    f.env.ARENA_SUPERADMIN_SECRET=undefined;expect((await f.call("/arena/auth/superadmin/login","POST",{secret:"any-key-long-enough-for-local-test-123"})).status).toBe(503);
  });
  it("different stations cannot read/write each other's products, seller IDs, registrations or session IDs",async()=>{
    const f=setup(),a=await active(f),b=await active(f,"Other","other@example.test");
    const seller=(await (await f.call("/admin/arena/sellers","POST",{name:"Peter",color:"#123456",active:1},a.cookie)).json() as {id:string}).id;
    const product=(await (await f.call("/admin/arena/activities","POST",draft,a.cookie)).json() as {id:string}).id;
    expect((await f.call(`/admin/arena/activities/${product}`,"PATCH",draft,b.cookie)).status).toBe(404);
    expect((await f.call(`/admin/arena/sellers/${seller}`,"PATCH",{name:"Peter",color:"#123456",active:0},b.cookie)).status).toBe(404);
    expect((await f.call("/arena/registrations","POST",{activity_id:product,seller_id:seller,request_id:crypto.randomUUID()},b.cookie)).status).toBe(400);
    const sessions=await (await f.call("/arena/auth/session","GET",undefined,a.cookie)).json() as {session_id:string};expect((await f.call("/arena/auth/revoke","POST",{session_id:sessions.session_id},b.cookie)).status).toBe(404);
    expect(await (await f.call("/arena/stats?metric=tb","GET",undefined,b.cookie)).json()).toMatchObject({count:0,tb_ore:0});
  });
  it("integrated stations still synchronize their own staff register and cannot manage Arena-only sellers",async()=>{
    const f=setup();await f.call("/arena/bootstrap");const cookie=await f.login();expect((await f.call("/admin/arena/sellers","POST",{name:"Invalid",color:"#123456",active:1},cookie)).status).toBe(403);
    const other=setup();other.db.prepare("UPDATE staff SET name='Other source Emma' WHERE id='emma'").run();f.env.STATION_DB_TINGSRYD=other.env.DB;
    const credential=await passwordHash(pass),id="tingsryd",now=new Date().toISOString();
    f.arena.prepare("INSERT INTO arena_stations(id,station_key,name,status,kind,created_at,updated_at) VALUES(?,?,?,'active','integrated',?,?)").run(id,id,"Tingsryd",now,now);
    f.arena.prepare("INSERT INTO arena_station_accounts VALUES(?,?,?,?,?,?)").run(id,"tingsryd@example.test",credential.hash,credential.salt,credential.iterations,now);
    const login=await f.call("/arena/auth/login","POST",{email:"tingsryd@example.test",password:pass});const result=await (await f.call("/arena/bootstrap","GET",undefined,f.cookie(login))).json() as ArenaBootstrap;
    expect(result.station.id).toBe(id);expect(result.sellers.find(s=>s.external_staff_id==="emma")?.name).toBe("Other source Emma");
    expect(f.arena.prepare("SELECT name FROM arena_sellers WHERE station_id='mastertest' AND external_staff_id='emma'").get()!.name).not.toBe("Other source Emma");
    f.env.STATION_DB_TINGSRYD=undefined;expect((await f.call("/arena/bootstrap","GET",undefined,f.cookie(login))).status).toBe(503);
  });
  it("rate limits login and signup, and preserves same-origin CSRF protection",async()=>{
    const f=setup();
    expect((await f.call("/arena/auth/signup","POST",{name:"X",email:"x@example.test",password:pass},undefined,{Origin:"https://evil.test"})).status).toBe(403);
    expect((await f.call("/arena/auth/signup","POST",{name:"X",email:"x@example.test",password:pass},undefined,{"Sec-Fetch-Site":"cross-site"})).status).toBe(403);
    for(let i=0;i<10;i++)expect((await f.call("/arena/auth/login","POST",{email:"missing@example.test",password:pass})).status).toBe(401);
    expect((await f.call("/arena/auth/login","POST",{email:"missing@example.test",password:pass})).status).toBe(429);
    for(let i=0;i<5;i++)expect((await f.call("/arena/auth/signup","POST",{name:"X",email:"bad",password:pass})).status).toBe(400);
    expect((await f.call("/arena/auth/signup","POST",{name:"X",email:"bad",password:pass})).status).toBe(429);
  });
});
describe("multi-station groups",()=>{
  it("groups support multiple memberships, station permission checks and separate total metrics",async()=>{
    const f=setup(),a=await active(f),b=await active(f,"Karlskrona","karlskrona@example.test");
    const create=async(name:string,station_ids:string[])=>{const r=await f.call("/arena/superadmin/groups","POST",{name,station_ids},a.admin);expect(r.status).toBe(201);return (await r.json() as {id:string}).id;};
    const first=await create("Sydost",[a.station.id,b.station.id]),second=await create("Sverige",[a.station.id]);
    for(const [account,n,points,tb] of [[a,3,5,"1"],[b,1,1,"200"]] as const) {
      const seller=(await (await f.call("/admin/arena/sellers","POST",{name:"Säljare",color:"#123456",active:1},account.cookie)).json() as {id:string}).id;
      const activity=(await (await f.call("/admin/arena/activities","POST",{...draft,points,tb_kronor:tb},account.cookie)).json() as {id:string}).id;
      for(let i=0;i<n;i++)expect((await f.call("/arena/registrations","POST",{request_id:crypto.randomUUID(),seller_id:seller,activity_id:activity},account.cookie)).status).toBe(200);
    }
    expect((await (await f.call("/arena/groups","GET",undefined,a.cookie)).json() as {groups:unknown[]}).groups).toHaveLength(2);
    expect((await f.call(`/arena/groups/${second}/leaderboard`,"GET",undefined,b.cookie)).status).toBe(404);
    for(const metric of ["points","tb","count"]) {
      const board=await (await f.call(`/arena/groups/${first}/leaderboard?period=month&metric=${metric}`,"GET",undefined,a.cookie)).json() as ArenaGroupBoard;expect(board.normalization).toBe("total");expect(board.standings).toHaveLength(2);expect(board.standings[0].id).toBe(metric==="tb" ? b.station.id:a.station.id);expect(board.standings.find(s=>s.id===a.station.id)).toMatchObject({count:3,points:15,tb_ore:300});expect(board.standings.find(s=>s.id===b.station.id)).toMatchObject({count:1,points:1,tb_ore:20000});expect(JSON.stringify(board)).not.toContain("password");
    }
    expect((await f.call(`/arena/superadmin/groups/${first}`,"PATCH",{name:"Sydost",station_ids:[a.station.id]},b.cookie)).status).toBe(401);
    expect((await f.call(`/arena/superadmin/groups/${first}`,"PATCH",{name:"Sydost",station_ids:[a.station.id]},a.admin)).status).toBe(200);
    expect((await f.call(`/arena/groups/${first}/leaderboard`,"GET",undefined,b.cookie)).status).toBe(404);
    expect((await f.call("/arena/superadmin/groups","POST",{name:"Invalid",station_ids:["not-a-station"]},a.admin)).status).toBe(400);
    expect((await f.call("/arena/superadmin/groups","POST",{name:"Invalid",station_ids:[a.station.id,a.station.id]},a.admin)).status).toBe(400);
  });
  it("competition ranks are stable and equal on ties",()=>{
    const rows=[{id:"a",name:"A",rank:0,count:2,points:5,tb_ore:100,unknown_tb_count:0},{id:"b",name:"B",rank:0,count:4,points:5,tb_ore:200,unknown_tb_count:0},{id:"c",name:"C",rank:0,count:1,points:1,tb_ore:0,unknown_tb_count:0}];
    expect(rankStations(rows,"points").map(s=>s.rank)).toEqual([1,1,3]);expect(rankStations(rows,"tb")[0].id).toBe("b");expect(rankStations(rows,"count")[0].id).toBe("b");
  });
});
