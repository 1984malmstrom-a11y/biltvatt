import {hasLocalSuperadminCredentials,localSuperadminLogin} from "./arena-test-auth";
import {test,expect,type Page} from "@playwright/test";
import {readFileSync,existsSync} from "node:fs";
import {randomUUID,randomBytes} from "node:crypto";
import type {ArenaGroupBoard,ArenaStation} from "../shared/arena-network";

const stations:ArenaStation[]=[{id:"t",name:"Tingsryd",email:null,status:"active",kind:"integrated"},{id:"h",name:"Karlshamn",email:null,status:"active",kind:"integrated"},{id:"k",name:"Karlskrona",email:null,status:"active",kind:"integrated"},{id:"m",name:"Malmö",email:"malmo@example.test",status:"pending",kind:"arena"}];
const board:ArenaGroupBoard={name:"Sydost",metric:"points",period:"week",normalization:"total",range:{start:"2026-10-12",end:"2026-10-18",from:"",to:""},standings:stations.map((s,i)=>({id:s.id,name:s.name,rank:i+1,points:340-i*30,tb_ore:48600-i*7000,count:87-i*9,unknown_tb_count:0}))};
async function screenshot(page:Page,name:string){if(process.env.ARENA_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.ARENA_SCREENSHOT_DIR}/${name}.png`});}
for(const [width,height] of [[1920,1080],[1024,768],[390,844]]) {
  test(`Arena accounts: signup, pending and login ${width}x${height}`,async({page})=>{
    let pending=false;await page.setViewportSize({width,height});
    await page.route("**/api/arena/auth/session",r=>r.fulfill({json:pending ? {authenticated:true,station:stations[3],session_id:"local",sessions:[]}:{authenticated:false}}));
    await page.route("**/api/arena/auth/signup",r=>{pending=true;return r.fulfill({status:201,json:{station:stations[3]}});});
    await page.route("**/api/arena/auth/logout",r=>{pending=false;return r.fulfill({json:{ok:true}});});
    await page.goto("/arena/join");await expect(page.getByRole("heading",{name:"Anslut station",exact:true})).toBeVisible();await screenshot(page,`onboarding-${width}x${height}`);
    await page.getByLabel("Stationsnamn",{exact:true}).fill("Malmö");await page.getByLabel("Stationsmejl",{exact:true}).fill("malmo@example.test");await page.getByLabel("Lösenord",{exact:true}).fill("Local-demo-only passphrase 2026");await page.getByRole("button",{name:"Skapa stationskonto",exact:true}).click();
    await expect(page.getByText("VÄNTAR PÅ GODKÄNNANDE",{exact:true})).toBeVisible();await expect(page.getByRole("link",{name:"Öppna Arenan",exact:true})).toHaveCount(0);await screenshot(page,`pending-${width}x${height}`);
    await page.getByRole("button",{name:"Logga ut",exact:true}).click();await expect(page.getByRole("heading",{name:"Logga in på stationen",exact:true})).toBeVisible();await screenshot(page,`station-login-${width}x${height}`);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  });
  test(`Arena Superadmin: stations, approval, groups and total metrics ${width}x${height}`,async({page})=>{
    const current=structuredClone(stations);await page.setViewportSize({width,height});await page.route("**/api/arena/auth/superadmin/session",r=>r.fulfill({json:{authenticated:true}}));
    await page.route("**/api/arena/superadmin/stations",r=>r.fulfill({json:{stations:current}}));
    await page.route("**/api/arena/superadmin/groups",r=>r.fulfill({json:{groups:[{id:"sydost",name:"Sydost",station_ids:["t","m"]}]}}));
    await page.route("**/api/arena/superadmin/stations/m",r=>{current[3].status="active";return r.fulfill({json:{ok:true}});});
    await page.route("**/api/arena/superadmin/leaderboard*",r=>r.fulfill({json:{...board,metric:new URL(r.request().url()).searchParams.get("metric")??"points"}}));
    await page.goto("/arena/superadmin");await expect(page.getByRole("button",{name:"Godkänn Malmö",exact:true})).toBeVisible();await screenshot(page,`superadmin-stations-${width}x${height}`);
    await page.getByRole("button",{name:"Godkänn Malmö",exact:true}).click();await expect(page.getByRole("button",{name:"Suspendera Malmö",exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Grupper",exact:true}).click();await page.getByRole("button",{name:/Sydost/}).click();await expect(page.getByLabel("Gruppnamn",{exact:true})).toHaveValue("Sydost");await screenshot(page,`superadmin-groups-${width}x${height}`);
    await page.getByRole("button",{name:"Gemensamma topplistor",exact:true}).click();await page.getByLabel("Mått",{exact:true}).selectOption("tb");await expect(page.locator(".arena-network-board")).toContainText("486 kr TB");await expect(page.locator(".arena-network-board")).toContainText("UTAN NORMALISERING");await screenshot(page,`multi-station-leaderboard-${width}x${height}`);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  });
  test(`Arena group: approved membership and premium leaderboard ${width}x${height}`,async({page})=>{
    await page.setViewportSize({width,height});await page.route("**/api/arena/groups",r=>r.fulfill({json:{groups:[{id:"sydost",name:"Sydost"}]}}));await page.route("**/api/arena/groups/sydost/leaderboard*",r=>r.fulfill({json:board}));
    await page.goto("/arena/groups");await expect(page.locator(".arena-network-board")).toContainText("Tingsryd");await expect(page.locator(".arena-network-board li")).toHaveCount(4);await screenshot(page,`station-group-${width}x${height}`);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  });
}
test("Arena: real local onboarding, approval, own sellers, TB registration and logout",async({page})=>{
  test.skip(!hasLocalSuperadminCredentials(),"Requires explicitly configured local-only Superadmin test credentials.");
  const email=`arena-qa-${randomUUID()}@example.test`,password=randomBytes(20).toString("hex");let station="";
  try {
    const signup=await page.request.post("/api/arena/auth/signup",{data:{name:"Arena QA · lokal station",email,password}});expect(signup.status()).toBe(201);station=(await signup.json()).station.id;
    await page.goto("/arena/account");await expect(page.getByText("VÄNTAR PÅ GODKÄNNANDE",{exact:true})).toBeVisible();
    const login=await localSuperadminLogin(page.request);expect(login.status()).toBe(200);
    expect((await page.request.patch(`/api/arena/superadmin/stations/${station}`,{data:{status:"active"}})).status()).toBe(200);
    expect((await page.request.post(`/api/arena/superadmin/stations/${station}/admin-pin`,{data:{new_pin:'483921',confirm_pin:'483921'}})).status()).toBe(200);expect((await page.request.post('/api/arena/auth/admin-access/unlock',{data:{pin:'483921'}})).status()).toBe(200);
    await page.goto("/arena/admin");await page.getByRole("button",{name:"Säljare",exact:true}).click();await page.getByLabel("Säljarnamn",{exact:true}).fill("QA-säljaren");await page.getByRole("button",{name:"Spara",exact:true}).click();await expect(page.getByRole("status")).toContainText("Sparat");
    await page.getByRole("button",{name:"Aktiviteter",exact:true}).click();await page.getByLabel("Namn",{exact:true}).fill("Biltvätt");await page.getByLabel("Poäng",{exact:true}).fill("2");await page.getByLabel("TB (kr)",{exact:true}).fill("35,25");await page.getByLabel("Synlig badge",{exact:true}).selectOption("tb");await page.getByRole("button",{name:"Spara",exact:true}).click();await expect(page.getByRole("status")).toContainText("Sparat");
    await page.goto("/arena");await page.getByRole("button",{name:"Biltvätt, +35,25 kr TB",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"QA-säljaren",exact:true}).click();await expect(page.getByRole("status")).toContainText("+35,25 kr TB!");
    const stats=await (await page.request.get("/api/arena/stats?metric=tb")).json();expect(stats).toMatchObject({count:1,points:2,tb_ore:3525});
    await page.getByRole("button",{name:/Ångra senaste/}).click();expect(await (await page.request.get("/api/arena/stats?metric=tb")).json()).toMatchObject({count:0,tb_ore:0});
    expect((await page.request.post("/api/arena/auth/logout")).status()).toBe(200);expect(await (await page.request.get("/api/arena/auth/session")).json()).toMatchObject({authenticated:false});
  } finally {if(station)await page.request.patch(`/api/arena/superadmin/stations/${station}`,{data:{status:"suspended"}});}
});
