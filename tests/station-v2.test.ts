import { describe, expect, it, vi } from "vitest";
import { fixture } from "./fixture";
import { addDays, stockholmDay } from "../worker/stats";
import { parseScheduleCsv } from "../src/StationV2Admin";
import { findScheduleConflicts } from "../shared/schedule";
import { msUntilNextStockholmDay } from "../src/StationDashboardV2";
import { emptyMonthlyMetrics, formatMonthlyNumber, isFixedMonthlyMetrics, MONTHLY_CATEGORIES, monthlyTone, parseSwedishNumber } from "../shared/monthly";

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
  it("byter schemadag vid lokal midnatt i Stockholm även över vintertidsbytet", () => {
    expect(stockholmDay(new Date("2026-10-08T21:59:59Z"))).toBe("2026-10-08");
    expect(stockholmDay(new Date("2026-10-08T22:00:00Z"))).toBe("2026-10-09");
    expect(stockholmDay(new Date("2026-10-26T22:59:59Z"))).toBe("2026-10-26");
    expect(stockholmDay(new Date("2026-10-26T23:00:00Z"))).toBe("2026-10-27");
    expect(msUntilNextStockholmDay(new Date("2026-10-08T21:59:59Z"))).toBe(1000);
    expect(msUntilNextStockholmDay(new Date("2026-10-24T22:00:00Z"))).toBe(25 * 60 * 60_000);
  });
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
      tasks: { id: string; text: string; revision: number; done: number; recurring?: boolean }[];
    };
    expect(first.tasks.filter((item) => !item.recurring)).toHaveLength(1);
    const task = first.tasks.find((item) => !item.recurring)!;
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
    ).json()) as { tasks: { recurring?: boolean }[] };
    expect(last.tasks.filter((item) => !item.recurring)).toEqual([]);
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
  it("förhandsgranskar 111 syntetiska oktoberrader och upptäcker dubblett, överlapp och nattpass", () => {
    const header = "datum,förnamn,start,slut,status";
    const rows = Array.from({ length: 111 }, (_, i) => {
      const day = String(i % 31 + 1).padStart(2, "0");
      const name = ["Demo A", "Demo B", "Demo C", "Demo D"][Math.floor(i / 31)];
      return `2026-10-${day},${name},08:00,16:00,active`;
    });
    const parsed = parseScheduleCsv([header, ...rows].join("\n"));
    expect(parsed).toHaveLength(111);
    expect(parsed.every((row) => row.work_date >= "2026-10-01" && row.work_date <= "2026-10-31")).toBe(true);
    expect(findScheduleConflicts(parsed)).toEqual([]);
    const base = parseScheduleCsv([
      header,
      "2026-10-08,Demo A,22:00,06:00,active",
      "2026-10-09,Demo A,05:30,12:00,active",
      "2026-10-09,Demo A,05:30,12:00,active",
      "2026-10-09,Demo A,07:00,15:00,sick",
    ].join("\n"));
    expect(findScheduleConflicts(base).map((conflict) => conflict.kind)).toEqual([
      "overlap", "overlap", "duplicate",
    ]);
    expect(findScheduleConflicts([base[0]], [base[0]])[0]).toMatchObject({
      kind: "duplicate", existing: true,
    });
    expect(() => parseScheduleCsv(`${header}\n2026-10-08,123,08:00,16:00,active`)).toThrow();
  });
  it("stoppar överlapp inom import och mot befintliga pass utan att ändra dem", async () => {
    const f = fixture();
    const { admin, viewer } = await sessions(f);
    const day = stockholmDay();
    const next = addDays(day, 1);
    const first = { work_date: day, first_name: "Demo A", starts_at: "22:00", ends_at: "06:00", status: "active" };
    const overlap = { work_date: next, first_name: "Demo A", starts_at: "05:30", ends_at: "12:00", status: "active" };
    const payload = (label: string, shifts: typeof first[]) => ({ label, starts_on: day, ends_on: next, shifts });
    expect((await f.call("/admin/station/v2/schedule/import", "POST", payload("Krock i fil", [first, overlap]), admin)).status).toBe(400);
    expect((await f.call("/admin/station/v2/schedule/import", "POST", payload("Första", [first]), admin)).status).toBe(201);
    expect((await f.call("/admin/station/v2/schedule/import", "POST", payload("Krock mot DB", [overlap]), admin)).status).toBe(409);
    const stored = await (await f.call("/admin/station/v2/schedule", "GET", undefined, admin)).json() as { shifts: typeof first[] };
    expect(stored.shifts).toHaveLength(1);
    expect(stored.shifts[0]).toMatchObject(first);
    const away = { ...overlap, status: "leave" };
    expect((await f.call("/admin/station/v2/schedule/import", "POST", payload("Frånvaro", [away]), admin)).status).toBe(201);
    const overview = await (await f.call("/station/v2", "GET", undefined, viewer)).json() as { shifts: { first_name: string }[] };
    expect(overview.shifts.map((shift) => shift.first_name)).toEqual(["Demo A"]);
    f.db.close();
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
    const overview = await (await f.call("/station/v2","GET",undefined,viewer)).json() as {tasks:{text:string;recurring?:boolean}[]};
    expect(overview.tasks.filter((item)=>!item.recurring).map((item)=>item.text)).toEqual(["Adminuppgift"]);
    expect((await f.call("/station/dashboard","GET",undefined,admin)).status).toBe(200);
    expect((await f.call("/station/v2/tasks","POST",{text:"   "},viewer)).status).toBe(400);
    expect((await f.call("/station/v2/tasks","POST",{text:"x".repeat(181)},viewer)).status).toBe(400);
    f.db.close();
  });
  it("lagrar sex fasta nyckeltal, rättar äldre månad och skyddar revisioner", async () => {
    const f = fixture(), {admin,viewer} = await sessions(f);
    const current=stockholmDay().slice(0,7);
    const previous=addDays(`${current}-01`,-1).slice(0,7);
    const path=`/admin/station/v2/monthly/${previous}`;
    const metrics=emptyMonthlyMetrics();
    metrics.customers_per_day={current:420,previous:398,percent:5.5};
    metrics.sales.percent=7.8;
    metrics.economic_result.value=10000;
    metrics.economic_result.total_ytd=-45000;
    expect(MONTHLY_CATEGORIES).toHaveLength(6);
    expect(MONTHLY_CATEGORIES.map(({fields})=>fields.length)).toEqual([2,2,2,2,1,2]);
    expect(MONTHLY_CATEGORIES.map(({unit})=>unit)).toEqual(["antal","kr","liter","kr","%","kr"]);
    expect((await f.call("/station/v2/monthly")).status).toBe(401);
    expect((await f.call(path,"PUT",{metrics,expected_revision:null},viewer)).status).toBe(401);
    expect((await f.call(`/admin/station/v2/monthly/${current}`,"PUT",{metrics,expected_revision:null},admin)).status).toBe(400);
    expect((await f.call(path,"PUT",{metrics:[{label:"Fri rad",value:"12",unit:"kr",order:0}],expected_revision:null},admin)).status).toBe(400);
    expect((await f.call(path,"PUT",{metrics:{...metrics,sales:{percent:7.8,current:100}},expected_revision:null},admin)).status).toBe(400);
    expect((await f.call(path,"PUT",{metrics,expected_revision:null},admin)).status).toBe(201);
    expect((await f.call(path,"PUT",{metrics,expected_revision:null},admin)).status).toBe(409);
    const read=await (await f.call("/station/v2/monthly","GET",undefined,viewer)).json() as {month:string;metrics:typeof metrics};
    expect(read.month).toBe(previous);
    expect(read.metrics).toEqual(metrics);
    expect((await f.call(path,"PUT",{metrics,expected_revision:3},admin)).status).toBe(409);
    metrics.economic_result.value=-8000;
    metrics.economic_result.total_ytd=125000;
    metrics.sales.percent=0;
    metrics.customers_per_day.previous=999;
    expect((await f.call(path,"PUT",{metrics,expected_revision:0},admin)).status).toBe(200);
    const corrected=(await (await f.call(path,"GET",undefined,admin)).json() as {metrics:typeof metrics}).metrics;
    expect(corrected.economic_result).toEqual({value:-8000,total_ytd:125000});
    expect(corrected.customers_per_day.previous).toBe(398);
    const olderClient=structuredClone(corrected);
    delete olderClient.economic_result.total_ytd;
    expect((await f.call(path,"PUT",{metrics:olderClient,expected_revision:1},admin)).status).toBe(200);
    const afterOlderClient=(await (await f.call(path,"GET",undefined,admin)).json() as {metrics:typeof metrics}).metrics;
    expect(afterOlderClient.economic_result.total_ytd).toBe(125000);
    metrics.customers_per_day.previous=398;
    expect((await f.call("/admin/station/v2/monthly","GET",undefined,viewer)).status).toBe(401);
    const all=await (await f.call("/admin/station/v2/monthly","GET",undefined,admin)).json() as {month:string;revision:number}[];
    expect(all[0]).toMatchObject({month:previous,revision:2});
    const old="2024-01";
    const historical=structuredClone(metrics);
    historical.economic_result.total_ytd=-45000;
    expect((await f.call(`/admin/station/v2/monthly/${old}`,"PUT",{metrics:historical,expected_revision:null},admin)).status).toBe(201);
    expect((await (await f.call(`/admin/station/v2/monthly/${old}`,"GET",undefined,admin)).json() as {metrics:typeof metrics}).metrics).toEqual(historical);
    expect((await (await f.call(path,"GET",undefined,admin)).json() as {metrics:typeof metrics}).metrics.economic_result.total_ytd).toBe(125000);
    f.db.close();
  });
  it("läser V2.5-månader utan årsresultat och behåller dolda jämförelsevärden vid korrigering", async () => {
    const f=fixture(), {admin,viewer}=await sessions(f);
    const month=addDays(`${stockholmDay().slice(0,7)}-01`,-1).slice(0,7);
    const old=emptyMonthlyMetrics();
    old.customers_per_day={current:410,previous:390,percent:5.1};
    delete old.economic_result.total_ytd;
    expect(isFixedMonthlyMetrics(old)).toBe(true);
    f.db.prepare("INSERT INTO station_monthly_figures(station_id,month,metrics_json,created_at,updated_at) VALUES(?,?,?,?,?)")
      .run("tingsryd",month,JSON.stringify(old),"2026-01-01","2026-01-01");
    const read=await (await f.call("/station/v2/monthly","GET",undefined,viewer)).json() as {legacy:boolean;metrics:typeof old};
    expect(read.legacy).toBe(false);
    expect(read.metrics.economic_result.total_ytd).toBeUndefined();
    const edited=emptyMonthlyMetrics();
    edited.customers_per_day.current=420;
    edited.customers_per_day.previous=null;
    edited.economic_result.total_ytd=185000;
    expect((await f.call(`/admin/station/v2/monthly/${month}`,"PUT",{metrics:edited,expected_revision:0},admin)).status).toBe(200);
    const saved=(await (await f.call(`/admin/station/v2/monthly/${month}`,"GET",undefined,admin)).json() as {metrics:typeof old}).metrics;
    expect(saved.customers_per_day).toMatchObject({current:420,previous:390});
    expect(saved.economic_result.total_ytd).toBe(185000);
    f.db.close();
  });
  it("bevarar äldre fria månadsvärden utan omtolkning eller överskrivning", async () => {
    const f=fixture(), {admin,viewer}=await sessions(f);
    const previous=addDays(`${stockholmDay().slice(0,7)}-01`,-1).slice(0,7);
    const old='[{"label":"Historisk rad","value":"42","unit":"st","order":0}]';
    f.db.prepare("INSERT INTO station_monthly_figures(station_id,month,metrics_json,created_at,updated_at) VALUES(?,?,?,?,?)").run("tingsryd",previous,old,"2026-01-01","2026-01-01");
    const result=await (await f.call("/station/v2/monthly","GET",undefined,viewer)).json() as {metrics:unknown;legacy:boolean};
    expect(result).toMatchObject({metrics:null,legacy:true});
    expect((await f.call(`/admin/station/v2/monthly/${previous}`,"PUT",{metrics:emptyMonthlyMetrics(),expected_revision:0},admin)).status).toBe(409);
    expect(f.db.prepare("SELECT metrics_json FROM station_monthly_figures WHERE month=?").get(previous)).toMatchObject({metrics_json:old});
    f.db.close();
  });
  it("formaterar manuella procenttal och ekonomiskt resultat", () => {
    expect(parseSwedishNumber("12 500,25")).toBe(12500.25);
    expect(parseSwedishNumber(" ")).toBeNull();
    expect(formatMonthlyNumber(5.5,"%",true)).toBe("+5,5 %");
    expect(formatMonthlyNumber(-3.5,"%",true)).toBe("−3,5 %");
    expect(formatMonthlyNumber(0,"%",true)).toBe("0 %");
    expect(formatMonthlyNumber(10000,"kr",true).replace(/\u00a0|\u202f/g," ")).toBe("+10 000 kr");
    expect(formatMonthlyNumber(-8000,"kr",true).replace(/\u00a0|\u202f/g," ")).toBe("−8 000 kr");
    expect(emptyMonthlyMetrics().economic_result.total_ytd).toBeNull();
    expect(formatMonthlyNumber(null,"kr",true)).toBe("Saknas");
    expect([monthlyTone(1),monthlyTone(-1),monthlyTone(0)]).toEqual(["positive","negative","neutral"]);
  });
  it("byter föregående avslutade månad vid midnatt i Stockholm", async () => {
    vi.useFakeTimers({toFake:["Date"]});
    vi.setSystemTime(new Date("2026-10-31T22:59:59Z"));
    const f=fixture();
    try {
      const {viewer}=await sessions(f);
      const september=await (await f.call("/station/v2/monthly","GET",undefined,viewer)).json() as {month:string;metrics:unknown};
      expect(september).toMatchObject({month:"2026-09",metrics:null});
      vi.setSystemTime(new Date("2026-10-31T23:00:00Z"));
      const october=await (await f.call("/station/v2/monthly","GET",undefined,viewer)).json() as {month:string;metrics:unknown};
      expect(october).toMatchObject({month:"2026-10",metrics:null});
    } finally { f.db.close(); vi.useRealTimers(); }
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
