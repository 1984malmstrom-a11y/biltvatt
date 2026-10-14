import {afterEach,describe,expect,it,vi} from "vitest";
import {arenaFixture} from "./arena-fixture";
import {randomToken,tokenHash} from "../shared/arena-crypto";
import {arenaInstant,stockholmInstant,stockholmLocalDateTime} from "../shared/arena-clock";
import {arenaFightView} from "../worker/arena-fights";

const fixtures:ReturnType<typeof arenaFixture>[]=[];
const time="2026-10-14T10:00:00.000Z",start="2026-10-14T09:00:00.000Z",end="2026-10-14T11:00:00.000Z";
afterEach(()=>{vi.useRealTimers();fixtures.splice(0).forEach(f=>f.close());});
async function setup() {
  vi.useFakeTimers();vi.setSystemTime(time);const f=arenaFixture();fixtures.push(f);
  const cookies:Record<string,string>={};
  for(const [id,name] of [["t","Tingsryd"],["k","Karlskrona"],["m","Malmö"]]) {
    f.arena.prepare("INSERT INTO arena_stations(id,station_key,name,status,kind,created_at,updated_at) VALUES(?,?,?,'active','arena',?,?)").run(id,id,name,time,time);
    f.arena.prepare("INSERT INTO arena_sellers(id,station_id,name,source,created_at,updated_at) VALUES(?,?,?,'arena',?,?)").run(`${id}:seller`,id,"Peter",time,time);
    f.arena.prepare("INSERT INTO arena_activities(id,station_id,name,points,tb_ore,created_at,updated_at) VALUES(?,?,?,2,3525,?,?)").run(`${id}:activity`,id,"Biltvätt",time,time);
    const token=randomToken();f.arena.prepare("INSERT INTO arena_station_sessions(id,token_hash,station_id,created_at,expires_at) VALUES(?,?,?,?,?)").run(crypto.randomUUID(),await tokenHash(token),id,time,"2027-10-14T10:00:00.000Z");cookies[id]=`arena_station_session=${token}`;
  }
  const admin=await f.superLogin();
  const create=async(metric="points",station_ids=["t","k"],from=start,to=end)=>{
    const r=await f.call("/arena/superadmin/fights","POST",{name:"Sydostfight",description:"Varje försäljning räknas",start_at:from,end_at:to,station_ids,metric},admin);expect(r.status).toBe(201);return (await r.json() as {id:string}).id;
  };
  const sale=(station:string,at=time,points=2,tb:number|null=3525,voided:string|null=null)=>{
    const id=crypto.randomUUID();f.arena.prepare("INSERT INTO arena_registrations(id,station_id,seller_id,activity_id,request_id,points_awarded,tb_ore_awarded,registered_at,voided_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id,station,`${station}:seller`,`${station}:activity`,id,points,tb,at,voided,at);return id;
  };
  const view=(id:string,at=time)=>arenaFightView(f.env.ARENA_DB!,id,new Date(at));
  return {...f,cookies,admin,create,sale,view};
}
describe("Butiksfight scoring, lifecycle and authority",()=>{
  it.each(["points","tb","count"])("scores %s independently across more than two stations",async metric=>{
    const f=await setup(),id=await f.create(metric,["t","k","m"]);f.sale("t",time,10,100);f.sale("k",time,1,9000);for(let i=0;i<3;i++)f.sale("m",time,1,100);
    const fight=await f.view(id);expect(fight.metric).toBe(metric);expect(fight.standings).toHaveLength(3);expect(fight.standings[0].id).toBe(metric==="points" ? "t":metric==="tb" ? "k":"m");expect(fight.standings.find(s=>s.id==="m")).toMatchObject({points:3,count:3,tb_ore:300});
  });
  it("only Superadmin creates fights; station reads and overview are membership-scoped",async()=>{
    const f=await setup(),id=await f.create();expect((await f.call("/arena/superadmin/fights","GET",undefined,f.cookies.t)).status).toBe(401);
    expect((await f.call("/arena/fights","POST",{},f.cookies.t)).status).toBe(405);expect((await f.call(`/arena/fights/${id}`,"GET",undefined,f.cookies.m)).status).toBe(404);expect((await f.call(`/arena/fights/${id}?station_id=t`,"GET",undefined,f.cookies.m)).status).toBe(400);
    expect((await f.call(`/arena/fights/${id}`,"GET",undefined,f.cookies.t)).status).toBe(200);
    expect(await (await f.call("/arena/fights","GET",undefined,f.cookies.m)).json()).toEqual({fights:[]});
    expect(await (await f.call("/arena/stats","GET",undefined,f.cookies.t)).json()).toMatchObject({fight:{id,phase:"active"}});
    expect(await (await f.call("/arena/stats","GET",undefined,f.cookies.m)).json()).toMatchObject({fight:null});
  });
  it("publishes a bounded member-only feed, corrects undo and freezes the final feed",async()=>{
    const f=await setup(),id=await f.create();const first=f.sale("t"),other=f.sale("k",time,1);f.sale("m",time,500);
    const live=await f.view(id);expect(live.events?.filter(e=>e.kind==="sale").map(e=>e.id).sort()).toEqual([`sale:${first}`,`sale:${other}`].sort());
    expect(live.events?.find(e=>e.id===`sale:${first}`)).toMatchObject({station_id:"t",seller_id:"t:seller",seller_name:"Peter",activity_name:"Biltvätt",tb_ore_awarded:3525});
    expect(live.events?.some(e=>e.kind==="lead" && e.station_id==="t")).toBe(true);
    await f.call(`/arena/registrations/${other}/void`,"POST",{request_id:other},f.cookies.k);expect((await f.view(id)).events?.some(e=>e.id===`sale:${other}`)).toBe(false);
    const final=await f.view(id,end);vi.setSystemTime("2026-10-14T11:01:00Z");
    expect(await (await f.call("/arena/stats","GET",undefined,f.cookies.t)).json()).toMatchObject({fight:{id,phase:"finished",winner_ids:["t"],end_at:end}});
    f.arena.prepare("UPDATE arena_registrations SET voided_at=? WHERE id=?").run("2026-10-14T11:02:00Z",first);
    expect(await f.view(id,"2026-10-14T11:03:00Z")).toEqual(final);
    const listing=await (await f.call("/arena/superadmin/fights","GET",undefined,f.admin)).json() as {fights:{participants:{id:string}[];leader_names:string[]}[]};
    expect(listing.fights[0].participants.map(p=>p.id).sort()).toEqual(["k","t"]);expect(listing.fights[0].leader_names).toEqual(["Tingsryd"]);
  });
  it("validates participants, all three metrics, duration, calendar and explicit timezone",async()=>{
    const f=await setup(),body={name:"Fight",description:"",start_at:start,end_at:end,station_ids:["t","k"],metric:"points"};
    for(const change of [{station_ids:["t"]},{station_ids:["t","t"]},{station_ids:["t","unknown"]},{station_ids:Array(33).fill("t")},{metric:"money"},{start_at:end,end_at:start},{start_at:"2026-02-30T10:00:00Z"},{start_at:"2026-10-14T10:00"},{end_at:"2027-10-14T10:00:00Z"}])expect((await f.call("/arena/superadmin/fights","POST",{...body,...change},f.admin)).status).toBe(400);
    f.arena.prepare("UPDATE arena_stations SET status='pending' WHERE id='k'").run();expect((await f.call("/arena/superadmin/fights","POST",body,f.admin)).status).toBe(400);
  });
  it("includes the start instant, excludes the end instant and future sales; activates on time",async()=>{
    const f=await setup(),id=await f.create("points",["t","k"],time,end);
    f.sale("t","2026-10-14T09:59:59.999Z",100);f.sale("t",time,2);f.sale("t","2026-10-14T10:59:59.999Z",3);f.sale("t",end,100);f.sale("t","2026-10-14T11:00:00.001Z",100);
    expect((await f.view(id,"2026-10-14T09:59:59.999Z")).phase).toBe("scheduled");expect((await f.view(id)).standings[0]).toMatchObject({count:1,points:2});
    const finished=await f.view(id,end);expect(finished.phase).toBe("finished");expect(finished.standings[0]).toMatchObject({count:2,points:5});expect(finished.winner_ids).toEqual(["t"]);
  });
  it("deduplicates lead changes across refreshes, concurrent polls and ties",async()=>{
    const f=await setup(),id=await f.create();f.sale("t");const first=await f.view(id);expect(first.latest_lead_change).toMatchObject({station_id:"t",version:1});
    await Promise.all([f.view(id),f.view(id),f.view(id)]);f.sale("t");expect((await f.view(id)).version).toBe(1);
    f.sale("k",time,4);const tied=await f.view(id);expect(tied.version).toBe(2);expect(tied.standings.map(s=>s.rank)).toEqual([1,1]);expect(tied.leader_ids).toHaveLength(2);expect(tied.latest_lead_change?.version).toBe(1);expect(tied.events?.filter(e=>e.kind==="tie")).toHaveLength(1);expect((await f.view(id)).events?.filter(e=>e.kind==="tie")).toEqual(tied.events?.filter(e=>e.kind==="tie"));
    f.sale("k");const next=await f.view(id);expect(next.latest_lead_change).toMatchObject({station_id:"k",version:3});expect(next.events?.filter(e=>e.kind==="tie")).toHaveLength(1);await f.view(id);expect(f.arena.prepare("SELECT COUNT(*) n FROM arena_fight_lead_events").get()!.n).toBe(2);
    // An older poll must not overwrite a newer live publication.
    await f.view(id,"2026-10-14T10:01:00.000Z");expect((await f.view(id)).snapshot_at).toBe("2026-10-14T10:01:00.000Z");vi.setSystemTime(end);expect(await (await f.call("/arena/superadmin/fights","GET",undefined,f.admin)).json()).toMatchObject({fights:[{status:"finished",leader_names:[]}]});expect((await f.view(id,end)).events?.filter(e=>e.kind==="tie")).toHaveLength(1);
  });
  it("undo within the fight removes score and can change leadership; post-finish undo cannot",async()=>{
    const f=await setup(),id=await f.create();f.sale("t",time,1);const sale=f.sale("k",time,2);expect((await f.view(id)).leader_ids).toEqual(["k"]);
    expect((await f.call(`/arena/registrations/${sale}/void`,"POST",{request_id:sale},f.cookies.k)).status).toBe(200);expect((await f.view(id)).leader_ids).toEqual(["t"]);
    const count=f.arena.prepare("SELECT COUNT(*) n FROM arena_fight_lead_events").get()!.n;await f.view(id);expect(f.arena.prepare("SELECT COUNT(*) n FROM arena_fight_lead_events").get()!.n).toBe(count);
  });
  it("first final read reconstructs cutoff even after a later void and then stores an immutable result",async()=>{
    const f=await setup(),id=await f.create();const retained=f.sale("t",time,5,100,end);f.sale("t",time,50,100,"2026-10-14T10:59:59.999Z");f.sale("k",time,2,null,"2026-10-14T11:00:00.001Z");
    const final=await f.view(id,"2026-10-14T12:00:00.000Z");expect(final.standings[0]).toMatchObject({id:"t",points:5,count:1});expect(final.standings[1]).toMatchObject({id:"k",count:1,unknown_tb_count:1});
    f.arena.prepare("UPDATE arena_registrations SET voided_at=? WHERE id=?").run("2026-10-14T12:01:00.000Z",retained);f.sale("k","2026-10-14T12:02:00.000Z",1000);expect(await f.view(id,"2026-10-15T10:00:00.000Z")).toEqual(final);
    expect(()=>f.arena.prepare("UPDATE arena_fights SET end_at=? WHERE id=?").run("2026-10-15T00:00:00.000Z",id)).toThrow("arena_fight_result_immutable");expect(()=>f.arena.prepare("DELETE FROM arena_fight_stations WHERE fight_id=?").run(id)).toThrow("arena_fight_result_immutable");
    vi.setSystemTime("2026-10-14T12:00:00.000Z");expect(await (await f.call("/arena/fights","GET",undefined,f.cookies.t)).json()).toMatchObject({fights:[{status:"finished"}]});
  });
  it("ties preserve equal ranks and all winners, including a zero-sale fight",async()=>{
    const f=await setup(),id=await f.create();f.sale("t");f.sale("k");const fight=await f.view(id,end);expect(fight.winner_ids.sort()).toEqual(["k","t"]);expect(fight.standings.map(s=>s.rank)).toEqual([1,1]);
    const zero=await f.create("points",["t","k"],"2026-10-14T10:30:00.000Z");const finished=await f.view(zero,end);expect(finished.winner_ids.sort()).toEqual(["k","t"]);expect(finished.standings.map(s=>s.count)).toEqual([0,0]);
  });
  it("acknowledged native registration updates fights once despite an idempotent retry",async()=>{
    const f=await setup(),id=await f.create(),body={request_id:crypto.randomUUID(),seller_id:"t:seller",activity_id:"t:activity"};
    for(let i=0;i<2;i++)expect((await f.call("/arena/registrations","POST",body,f.cookies.t)).status).toBe(200);
    const fight=await f.view(id);expect(fight.standings[0]).toMatchObject({points:2,tb_ore:3525,count:1});expect(fight.version).toBe(1);expect(f.arena.prepare("SELECT COUNT(*) n FROM arena_fight_lead_events").get()!.n).toBe(1);
  });
  it("a delayed database write crossing the cutoff cannot backdate a sale into the fight",async()=>{
    const f=await setup(),finish="2026-10-14T10:00:01.000Z",id=await f.create("points",["t","k"],start,finish),db=f.env.ARENA_DB!,original=db.batch.bind(db);
    db.batch=((statements:Parameters<D1Database["batch"]>[0])=>{vi.setSystemTime("2026-10-14T10:00:01.001Z");return original(statements);}) as D1Database["batch"];
    const response=await f.call("/arena/registrations","POST",{request_id:crypto.randomUUID(),seller_id:"t:seller",activity_id:"t:activity"},f.cookies.t);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({registration:{registered_at:"2026-10-14T10:00:01.001Z"}});
    const fight=await f.view(id,"2026-10-14T10:00:02.000Z");expect(fight.phase).toBe("finished");expect(fight.standings.map(s=>s.count)).toEqual([0,0]);
  });
  it("an undo request crossing the cutoff affects ordinary stats but preserves the fight reward",async()=>{
    const f=await setup(),finish="2026-10-14T10:00:01.000Z",id=await f.create("points",["t","k"],start,finish),sale=f.sale("t"),db=f.env.ARENA_DB!,prepare=db.prepare.bind(db);
    const spy=vi.spyOn(db,"prepare").mockImplementation(sql=>{if(sql.startsWith("UPDATE arena_registrations SET voided_at"))vi.setSystemTime("2026-10-14T10:00:01.001Z");return prepare(sql);});
    expect((await f.call(`/arena/registrations/${sale}/void`,"POST",{request_id:sale},f.cookies.t)).status).toBe(200);spy.mockRestore();
    expect((await f.view(id,"2026-10-14T10:00:02.000Z")).standings[0]).toMatchObject({id:"t",count:1,points:2});expect(await (await f.call("/arena/stats","GET",undefined,f.cookies.t)).json()).toMatchObject({count:0,points:0});
  });
});
describe("Europe/Stockholm fight time",()=>{
  it("canonicalizes offsets and converts summer and winter local time",()=>{
    expect(arenaInstant("2026-10-14T12:00:00+02:00")).toBe(time);expect(stockholmInstant("2026-07-14T12:00")).toBe("2026-07-14T10:00:00.000Z");expect(stockholmInstant("2026-12-14T12:00")).toBe("2026-12-14T11:00:00.000Z");expect(stockholmLocalDateTime(new Date(time))).toBe("2026-10-14T12:00");
  });
  it("rejects invalid dates, missing timezone, DST gaps and ambiguous fall times",()=>{
    for(const input of ["2026-02-30T10:00:00Z","2026-10-14T24:00:00Z","2026-10-14T10:00:60Z","2026-10-14T10:00:00+14:01","2026-10-14T10:00:00"])expect(()=>arenaInstant(input)).toThrow();
    expect(()=>stockholmInstant("2026-03-29T02:30")).toThrow("finns inte");expect(()=>stockholmInstant("2026-10-25T02:30")).toThrow("två gånger");
  });
});
