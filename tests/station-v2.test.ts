import { describe, expect, it, vi } from "vitest";
import { fixture } from "./fixture";
import { addDays, stockholmDay } from "../worker/stats";
import { parseScheduleCsv } from "../src/StationV2Admin";

async function sessions(f: ReturnType<typeof fixture>) {
  const admin = await f.login();
  const made = await f.call(
    "/admin/station/activation-codes",
    "POST",
    { device_label: "TV" },
    admin,
  );
  const { code } = (await made.json()) as { code: string };
  const active = await f.call("/station/activate", "POST", { code });
  return { admin, viewer: active.headers.get("Set-Cookie")!.split(";")[0] };
}
describe("Stationsdashboard V2", () => {
  it("importerar schema, visar bara aktiva pass och tillåter rättning med version", async () => {
    const f = fixture(),
      { admin, viewer } = await sessions(f),
      day = stockholmDay();
    const rows = [
      {
        work_date: day,
        first_name: "Alva",
        starts_at: "05:30",
        ends_at: "14:15",
        status: "active",
      },
      {
        work_date: day,
        first_name: "Peter",
        starts_at: "08:30",
        ends_at: "16:30",
        status: "sick",
      },
      {
        work_date: day,
        first_name: "Thim",
        starts_at: "14:15",
        ends_at: "22:15",
        status: "active",
      },
    ];
    expect(
      (
        await f.call(
          "/admin/station/v2/schedule/import",
          "POST",
          {
            label: "Test",
            starts_on: day,
            ends_on: addDays(day, 27),
            shifts: rows,
          },
          viewer,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await f.call(
          "/admin/station/v2/schedule/import",
          "POST",
          {
            label: "Test",
            starts_on: day,
            ends_on: addDays(day, 27),
            shifts: [rows[0], rows[0]],
          },
          admin,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await f.call(
          "/admin/station/v2/schedule/import",
          "POST",
          {
            label: "Test",
            starts_on: day,
            ends_on: addDays(day, 27),
            shifts: rows,
          },
          admin,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await f.call(
          "/admin/station/v2/schedule/import",
          "POST",
          {
            label: "Dublett",
            starts_on: day,
            ends_on: addDays(day, 27),
            shifts: [rows[0]],
          },
          admin,
        )
      ).status,
    ).toBe(409);
    const overview = (await (
      await f.call("/station/v2", "GET", undefined, viewer)
    ).json()) as {
      shifts: { id: string; first_name: string; starts_at: string }[];
    };
    expect(overview.shifts.map((s) => s.first_name)).toEqual(["Alva", "Thim"]);
    const schedule = (await (
      await f.call("/admin/station/v2/schedule", "GET", undefined, admin)
    ).json()) as { shifts: { id: string; revision: number }[] };
    const id = schedule.shifts[0].id;
    expect(
      (
        await f.call(
          `/admin/station/v2/shifts/${id}`,
          "PUT",
          { ...rows[0], status: "cancelled", expected_revision: 0 },
          admin,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await f.call(
          `/admin/station/v2/shifts/${id}`,
          "PUT",
          { ...rows[0], expected_revision: 0 },
          admin,
        )
      ).status,
    ).toBe(409);
    const after = (await (
      await f.call("/station/v2", "GET", undefined, viewer)
    ).json()) as { shifts: { first_name: string }[] };
    expect(after.shifts.map((s) => s.first_name)).toEqual(["Thim"]);
    f.db.close();
  });
  it("uppgifter kan skapas, markeras klara, ändras och tas bort med samtidighetskontroll", async () => {
    const f = fixture(),
      { admin, viewer } = await sessions(f);
    expect(
      (await f.call("/station/v2/tasks", "POST", { text: "Fyll på kylar" }))
        .status,
    ).toBe(401);
    expect(
      (
        await f.call(
          "/station/v2/tasks",
          "POST",
          { text: "Fyll på kylar" },
          viewer,
        )
      ).status,
    ).toBe(201);
    const first = (await (
      await f.call("/station/v2", "GET", undefined, viewer)
    ).json()) as {
      tasks: { id: string; text: string; revision: number; done: number }[];
    };
    expect(first.tasks).toHaveLength(1);
    const task = first.tasks[0];
    expect(
      (
        await f.call(
          `/station/v2/tasks/${task.id}`,
          "PUT",
          { text: task.text, done: true, expected_revision: 0 },
          viewer,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await f.call(
          `/station/v2/tasks/${task.id}`,
          "PUT",
          { text: "Kaffe", done: false, expected_revision: 0 },
          viewer,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await f.call(
          `/station/v2/tasks/${task.id}`,
          "PUT",
          { text: "Kaffe", done: false, expected_revision: 1 },
          viewer,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await f.call(
          `/station/v2/tasks/${task.id}`,
          "DELETE",
          { expected_revision: 2 },
          viewer,
        )
      ).status,
    ).toBe(200);
    const last = (await (
      await f.call("/station/v2", "GET", undefined, viewer)
    ).json()) as { tasks: unknown[] };
    expect(last.tasks).toEqual([]);
    expect(
      (await f.call("/admin/station/v2/notices", "GET", undefined, viewer))
        .status,
    ).toBe(401);
    expect(
      (await f.call("/admin/station/v2/schedule", "GET", undefined, viewer))
        .status,
    ).toBe(401);
    expect(
      (await f.call("/admin/station/store-sales", "GET", undefined, viewer))
        .status,
    ).toBe(401);
    expect(
      (
        await f.call(
          "/station/v2/tasks",
          "POST",
          { text: "Från fel origin" },
          viewer,
          { Origin: "https://evil.test" },
        )
      ).status,
    ).toBe(403);
    const devices = (await (
      await f.call("/admin/station/view-sessions", "GET", undefined, admin)
    ).json()) as { id: string }[];
    await f.call(
      `/admin/station/view-sessions/${devices[0].id}`,
      "DELETE",
      undefined,
      admin,
    );
    expect(
      (await f.call("/station/v2/tasks", "POST", { text: "Nekad" }, viewer))
        .status,
    ).toBe(401);
    f.db.close();
  });
  it("publicerar endast aktuella meddelanden och kräver admin för ändringar", async () => {
    const f = fixture(),
      { admin, viewer } = await sessions(f);
    const create = (
      title: string,
      published: boolean,
      expires_on: string | null,
    ) =>
      f.call(
        "/admin/station/v2/notices",
        "POST",
        {
          title,
          message: "Kontrollera kampanjskyltarna.",
          published,
          expires_on,
        },
        admin,
      );
    expect((await create("Aktuellt", true, null)).status).toBe(201);
    expect((await create("Utkast", false, null)).status).toBe(201);
    expect(
      (await create("Utgånget", true, addDays(stockholmDay(), -1))).status,
    ).toBe(201);
    const overview = (await (
      await f.call("/station/v2", "GET", undefined, viewer)
    ).json()) as { notices: { title: string }[] };
    expect(overview.notices.map((n) => n.title)).toEqual(["Aktuellt"]);
    const notices = (await (
      await f.call("/admin/station/v2/notices", "GET", undefined, admin)
    ).json()) as { id: string; title: string; revision: number }[];
    const current = notices.find((n) => n.title === "Aktuellt")!;
    expect(
      (
        await f.call(
          `/admin/station/v2/notices/${current.id}`,
          "PUT",
          {
            title: "Ändrat",
            message: "Nytt meddelande",
            published: false,
            expires_on: null,
            expected_revision: 0,
          },
          admin,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await f.call(
          `/admin/station/v2/notices/${current.id}`,
          "DELETE",
          { expected_revision: 0 },
          admin,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await f.call(
          `/admin/station/v2/notices/${current.id}`,
          "DELETE",
          { expected_revision: 1 },
          admin,
        )
      ).status,
    ).toBe(200);
    f.db.close();
  });
  it("förhandsgranskar CSV och avvisar felaktiga rader", () => {
    expect(
      parseScheduleCsv(
        "datum,förnamn,start,slut,status\n2026-10-08,Alva,05:30,14:15,active\n2026-10-09,Thim,22:00,06:00,active",
      ),
    ).toHaveLength(2);
    expect(() =>
      parseScheduleCsv(
        "datum,förnamn,start,slut,status\n2026-02-30,Alva,05:30,14:15,active",
      ),
    ).toThrow();
  });
  it("begränsar mängden skrivningar per visningssession", async () => {
    const f = fixture(),
      { viewer } = await sessions(f);
    for (let i = 0; i < 30; i++)
      expect(
        (
          await f.call(
            "/station/v2/tasks",
            "POST",
            { text: `Uppgift ${i}` },
            viewer,
          )
        ).status,
      ).toBe(201);
    expect(
      (await f.call("/station/v2/tasks", "POST", { text: "För många" }, viewer))
        .status,
    ).toBe(429);
    f.db.close();
  });
  it("visar bara dagens uppgifter och låter befintlig adminsession använda visningsfunktioner", async () => {
    const f = fixture(), {admin, viewer} = await sessions(f);
    const yesterday = addDays(stockholmDay(), -1);
    f.db.prepare("INSERT INTO station_tasks(id,station_id,task_date,text,created_at,updated_at) VALUES(?,?,?,?,?,?)")
      .run(crypto.randomUUID(),"tingsryd",yesterday,"Gammal uppgift",new Date().toISOString(),new Date().toISOString());
    expect((await f.call("/station/v2/tasks","POST",{text:"Adminuppgift"},admin)).status).toBe(201);
    const adminOverview = await f.call("/station/v2","GET",undefined,admin);
    expect(adminOverview.status).toBe(200);
    const overview = await (await f.call("/station/v2","GET",undefined,viewer)).json() as {tasks:{text:string}[]};
    expect(overview.tasks.map((item)=>item.text)).toEqual(["Adminuppgift"]);
    expect((await f.call("/station/dashboard","GET",undefined,admin)).status).toBe(401);
    expect((await f.call("/station/v2/tasks","POST",{text:"   "},viewer)).status).toBe(400);
    expect((await f.call("/station/v2/tasks","POST",{text:"x".repeat(181)},viewer)).status).toBe(400);
    f.db.close();
  });
  it("lagrar fria månadsrader i ordning med endast adminskrivning och rätt månad", async () => {
    const f = fixture(), {admin,viewer} = await sessions(f);
    const current=stockholmDay().slice(0,7);
    const previous=addDays(`${current}-01`,-1).slice(0,7);
    const path=`/admin/station/v2/monthly/${previous}`;
    const metrics=[
      {label:"Rad B",value:"12,4",unit:"%",order:1},
      {label:"Rad A",value:"123",unit:"st",order:0},
    ];
    expect((await f.call("/station/v2/monthly")).status).toBe(401);
    expect((await f.call(path,"PUT",{metrics,expected_revision:null},viewer)).status).toBe(401);
    expect((await f.call(`/admin/station/v2/monthly/${current}`,"PUT",{metrics,expected_revision:null},admin)).status).toBe(400);
    expect((await f.call(path,"PUT",{metrics:[{...metrics[0],label:""}],expected_revision:null},admin)).status).toBe(400);
    expect((await f.call(path,"PUT",{metrics,expected_revision:null},admin)).status).toBe(201);
    expect((await f.call(path,"PUT",{metrics,expected_revision:null},admin)).status).toBe(409);
    const read=await (await f.call("/station/v2/monthly","GET",undefined,viewer)).json() as {month:string;metrics:typeof metrics};
    expect(read.month).toBe(previous);
    expect(read.metrics.map((row)=>row.label)).toEqual(["Rad A","Rad B"]);
    expect((await f.call(path,"PUT",{metrics:[],expected_revision:3},admin)).status).toBe(409);
    expect((await f.call(path,"PUT",{metrics:[],expected_revision:0},admin)).status).toBe(200);
    expect((await f.call("/admin/station/v2/monthly","GET",undefined,viewer)).status).toBe(401);
    const all=await (await f.call("/admin/station/v2/monthly","GET",undefined,admin)).json() as {month:string;revision:number}[];
    expect(all[0]).toMatchObject({month:previous,revision:1});
    f.db.close();
  });
  it("döljer viktigt meddelande när sluttiden i Stockholm passerat", async () => {
    vi.useFakeTimers({toFake:["Date"]});
    vi.setSystemTime(new Date("2026-10-08T10:00:00Z"));
    const f=fixture();
    try {
      const {admin,viewer}=await sessions(f);
      const day=stockholmDay();
      for(const [title,expires_time] of [["Utgånget","11:00"],["Aktuellt","13:00"]]) {
        expect((await f.call("/admin/station/v2/notices","POST",{title,message:"Testmeddelande",published:true,expires_on:day,expires_time},admin)).status).toBe(201);
      }
      const result=await (await f.call("/station/v2","GET",undefined,viewer)).json() as {notices:{title:string}[]};
      expect(result.notices.map((row)=>row.title)).toEqual(["Aktuellt"]);
      expect((await f.call("/admin/station/v2/notices","POST",{title:"Fel",message:"Text",published:true,expires_on:null,expires_time:"13:00"},admin)).status).toBe(400);
    } finally {f.db.close();vi.useRealTimers();}
  });
});
