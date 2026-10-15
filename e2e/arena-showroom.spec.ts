import {finishChampionCapture} from './arena-capture';
import {test,expect,type Page} from "@playwright/test";
import type {ArenaBootstrap,ArenaStats,ArenaAchievement} from "../shared/arena";
import type {ArenaFight,ArenaFightSummary} from "../shared/arena-fights";
const now=new Date("2026-10-14T10:00:00Z");
const names=["Biltvätt","Korv med mos","Två för 25","Kaffe + bulle","Spolarvätska","Räksallad","Två för 30"];
const people=["Peter","Alva","Jonas","Sara","Erik"].map((name,i)=>({id:`s-${i}`,external_staff_id:null,name,color:"#6dcef3",active:1}));
const boot:ArenaBootstrap={station:{id:"t",name:"Tingsryd",kind:"arena"},sellers:people,activities:names.map((name,i)=>({id:`a-${i}`,name,offer_text:i===0 ? "Finast Plus":"",price_text:"",points:i===0 ? 2:1,category:i%2 ? "Mat":"Bilvård",active:1,image_key:null,sort_order:i})),campaign:null};
const initial:ArenaStats={range:{start:"2026-10-14",end:"2026-10-14",from:"",to:""},points:42,count:18,today:{points:42,count:18,sellers:5},station_goals:[{id:"g",period_type:"month",start_date:"2026-10-01",end_date:"2026-10-31",target_points:1000,points:742}],personal_goals:[],campaign:null,leaderboard:people.map((s,i)=>({...s,rank:i+1,points:34-i*3,count:12-i,activities:[]})),recent:people.map((s,i)=>({id:`sale-${i}`,seller_id:s.id,seller_name:s.name,activity_name:names[i],points_awarded:i===0 ? 2:1,registered_at:`2026-10-14T09:${37-i}:00Z`}))};
const fight:ArenaFight={id:"showroom",name:"Sydost · Butiksfight",description:"Samma lag. Större resultat.",start_at:"2026-10-14T09:00:00Z",end_at:"2026-10-14T10:14:00Z",snapshot_at:now.toISOString(),version:1,metric:"points",phase:"active",leader_ids:["k"],winner_ids:[],standings:[{id:"k",name:"Karlskrona",rank:1,points:342,tb_ore:120000,count:87,unknown_tb_count:0},{id:"t",name:"Tingsryd",rank:2,points:341,tb_ore:119999,count:86,unknown_tb_count:0}],events:people.map((p,i)=>({id:`event-${i}`,kind:"sale",station_id:i%2 ? "k":"t",station_name:i%2 ? "Karlskrona":"Tingsryd",seller_id:p.id,seller_name:p.name,activity_name:names[i],points_awarded:i===0 ? 2:1,tb_ore_awarded:3525,created_at:`2026-10-14T09:${37-i}:00Z`}))};
async function capture(page:Page,name:string){
  if(!process.env.ARENA_SCREENSHOT_DIR)return;
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));await Promise.all(["portraits","champions"].map(file=>new Promise(resolve=>{const i=new Image();i.onload=i.onerror=resolve;i.src=`/arena-showroom/${file}.webp`;})));});
  if(await page.locator(".arena-celebration").count()){await expect(page.locator(".arena-celebration").last()).toHaveCSS("opacity","1");await expect(page.locator(".arena-celebration .arena-reward-ring").last()).toHaveCSS("opacity","1");}
  await page.evaluate(()=>document.querySelectorAll(".celebration-leader").forEach(el=>el.getAnimations({subtree:true}).forEach(a=>{a.currentTime=900;a.pause();})));
  await finishChampionCapture(page);await page.mouse.move(0,0);await page.screenshot({path:`${process.env.ARENA_SCREENSHOT_DIR}/${name}.png`,fullPage:false});
}
async function setup(page:Page,current:()=>ArenaStats,data=boot){await page.route("**/api/arena/bootstrap",r=>r.fulfill({json:data}));await page.route("**/api/arena/stats*",r=>r.fulfill({json:current()}));}
async function sale(page:Page){await page.getByRole("button",{name:/^Biltvätt, /}).click();await page.getByRole("dialog").getByRole("button",{name:"Peter",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);await page.clock.runFor(450);}
async function noOverflow(page:Page,width:number,height:number){expect(await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}))).toEqual({width,height});}
for(const [width,height] of [[1920,1080],[1448,1086],[1024,768],[390,844],[844,390]]){
  test(`Showroom: portraits, profile and distinct champion hero ${width}x${height}`,async({page})=>{
    await page.setViewportSize({width,height});await page.clock.install({time:now});let achievements:ArenaAchievement[]=[];await setup(page,()=>initial);
    await page.route("**/api/arena/registrations",r=>r.fulfill({json:{registration:{id:r.request().postDataJSON().request_id,points_awarded:2,voided_at:null},achievements}}));
    await page.goto("/arena?showcase=1");await expect(page.locator(".arena-leaderboard li")).toHaveCount(5);await expect(page.locator(".arena-leaderboard .arena-demo-portrait")).toHaveCount(5);await expect(page.locator(".arena-recent .arena-demo-portrait")).toHaveCount(5);await expect(page.locator(".arena-leaderboard .arena-tabs")).toHaveCount(0);await noOverflow(page,width,height);
    const identity=await page.locator(".arena-leaderboard .arena-demo-portrait").first().getAttribute("data-avatar-index");expect(await page.locator(".arena-recent .arena-demo-portrait").first().getAttribute("data-avatar-index")).toBe(identity);await capture(page,`start-${width}x${height}`);
    if(width>=951 && process.env.ARENA_SCREENSHOT_DIR){for(const [selector,label] of [[".arena-left-column","left-column"],[".arena-leaderboard","avatars-leaderboard"],[".arena-recent","avatars-feed"]])await page.locator(selector).screenshot({path:`${process.env.ARENA_SCREENSHOT_DIR}/${label}-${width}x${height}.png`});}
    if(width<951)await page.getByRole("button",{name:"TOPPLISTOR",exact:true}).click();
    await page.getByRole("button",{name:"Peter 34 p",exact:true}).click();await expect(page.locator(".arena-person-avatar")).toHaveAttribute("data-avatar-index",identity!);await capture(page,`avatar-min-arena-${width}x${height}`);await page.getByRole("dialog").getByRole("button",{name:"Stäng",exact:true}).click();
    if(width<951){await page.getByRole("button",{name:"Öppna senaste aktiviteter",exact:true}).click();await expect(page.locator(".arena-dialog-recent .arena-demo-portrait")).toHaveCount(5);await capture(page,`mobile-feed-panel-${width}x${height}`);await page.getByRole("dialog").getByRole("button",{name:"Stäng",exact:true}).click();}
    await sale(page);await expect(page.locator(".level-1")).toBeVisible();await expect(page.locator(".arena-victory-art")).toHaveCount(0);await capture(page,`standard-sale-${width}x${height}`);await page.clock.runFor(1400);await expect(page.locator(".level-1")).toHaveCount(0);
    achievements=[{kind:"leader",level:3,special:true,text:"Ny etta!",scope:width===1448 ? "Biltvätt":"Idag",previousLeader:"Alva"}];await sale(page);
    await expect(page.locator(".arena-victory-hero h2")).toHaveText("NY ETTA!");await expect(page.locator(".arena-champion-art")).toHaveAttribute("data-champion-kind","fictional-celebration-art");await expect(page.locator(".celebration-leader [data-avatar-kind]")).toHaveCount(0);await expect(page.locator(".arena-milestone-subtitle")).toHaveText("Peter går om Alva");expect(await page.locator(".level-3").count()).toBe(1);await capture(page,`new-leader-${width===1448 ? "activity-":""}${width}x${height}`);await noOverflow(page,width,height);
    await page.getByRole("button",{name:"Stäng belöning",exact:true}).click();
    achievements=[{kind:"personal-goal",level:3,special:true,text:"Personliga målet uppnått!",scope:"Den här veckan",goal:{id:"personal",seller_id:"s-0",period_type:"week",start_date:"2026-10-12",end_date:"2026-10-18",points:100,target_points:100}},{kind:"leader",level:3,special:true,text:"Ny etta!",scope:"Idag",previousLeader:"Alva"}];await sale(page);await expect(page.locator(".arena-victory-hero")).toHaveCount(1);await expect(page.locator(".arena-victory-secondary")).toContainText("Ny etta!");await capture(page,`goal-hero-${width}x${height}`);
    await page.emulateMedia({reducedMotion:"reduce"});expect(await page.locator(".arena-confetti").first().evaluate(el=>getComputedStyle(el).display)).toBe("none");await page.getByRole("button",{name:"Korv med mos, +1 poäng",exact:true}).click();await expect(page.getByRole("dialog")).toBeVisible();
  });
}
for(const [index,[width,height]] of [[1920,1080],[1448,1086],[1024,768],[390,844],[844,390]].entries()){
  test(`Showroom: fight widget, true sale crossing, tie and final once ${width}x${height}`,async({page})=>{
    const metric=(["points","tb","count"] as const)[index%3],current=structuredClone(initial),localBoot=structuredClone(boot);current.fight={...structuredClone(fight),metric};
    if(metric==="tb")localBoot.activities[0]={...localBoot.activities[0],display_mode:"tb",tb_ore:3525};
    await page.setViewportSize({width,height});await page.clock.install({time:now});await setup(page,()=>current,localBoot);
    let next:ArenaFightSummary|null=null;
    await page.route("**/api/arena/registrations",r=>{if(next)current.fight=next;return r.fulfill({json:{registration:{id:r.request().postDataJSON().request_id,points_awarded:2,tb_ore_awarded:3525,voided_at:null},achievements:[]}});});
    await page.goto("/arena?showcase=1");const widget=page.locator(".arena-fight-widget");await expect(widget).toBeVisible();await expect(widget).toContainText("Karlskrona");await expect(widget.locator(".urgency-quarter")).toBeAttached();await capture(page,`fight-widget-urgency-${width}x${height}`);await noOverflow(page,width,height);
    const markup=await page.locator(".arena-stage").innerHTML();await page.clock.runFor(1000);expect(await page.locator(".arena-stage").innerHTML()).toBe(markup);
    const f=current.fight!,own=f.standings.find(s=>s.id==="t")!,other=f.standings.find(s=>s.id==="k")!;
    next={...f,version:2,leader_ids:["t"],standings:[{...own,rank:1,points:343,tb_ore:123524,count:88},{...other,rank:2}]};
    await sale(page);await expect(page.locator(".fight-celebration-lead")).toBeVisible();await expect(page.locator(".fight-celebration-lead h2")).toHaveText("Tingsryd tar ledningen!");await expect(page.locator(".arena-fight-event-sale")).toContainText("Peter");await expect(page.locator(".arena-fight-passed")).toHaveText("Karlskrona PASSERAD");await expect(page.locator(".arena-celebration")).toHaveCount(1);await capture(page,`fight-sale-lead-${width}x${height}`);
    await sale(page);await expect(page.locator(".fight-celebration-lead")).toHaveCount(0);await expect(page.locator(".level-1")).toBeVisible();
    await page.getByRole("button",{name:"Stäng belöning",exact:true}).click();
    current.fight={...f,version:3,leader_ids:["k"],standings:[{...other,points:350,tb_ore:130000,count:90},{...own}]};await page.clock.fastForward(30000);
    next={...current.fight,version:4,leader_ids:["k","t"],standings:current.fight.standings.map(s=>({...s,rank:1,points:350,tb_ore:130000,count:90}))};await sale(page);await expect(page.locator(".fight-celebration-tie h2")).toHaveText("DET ÄR LIKA!");await capture(page,`fight-tie-${width}x${height}`);await page.clock.runFor(4000);
    current.fight={...next,phase:"finished",winner_ids:["k","t"]};await page.clock.fastForward(30000);await expect(page.locator(".fight-celebration-final h2")).toHaveText("OAVGJORT!");await capture(page,`fight-final-tie-${width}x${height}`);await page.clock.runFor(4000);await page.clock.fastForward(30000);await expect(page.locator(".fight-celebration-final")).toHaveCount(0);await page.reload();await expect(widget).toBeVisible();await expect(page.locator(".fight-celebration-final")).toHaveCount(0);
  });
}
test("Showroom: uploaded portrait wins, failed upload falls back, portraits persist outside showcase",async({page})=>{
  const current=structuredClone(initial);current.leaderboard[0].profile_url="/arena-showroom/portraits.webp";current.leaderboard[1].profile_url="/broken-portrait.webp";
  await setup(page,()=>current);await page.route("**/broken-portrait.webp",r=>r.fulfill({status:404,body:""}));await page.goto("/arena?showcase=1");
  await expect(page.locator(".arena-leaderboard [data-avatar-kind=uploaded]")).toHaveCount(1);await expect(page.locator(".arena-leaderboard [data-avatar-kind=demo]")).toHaveCount(4);await page.goto("/arena?showcase=0");await expect(page.locator(".arena-leaderboard [data-avatar-kind=demo]")).toHaveCount(4);await expect(page.locator(".arena-leaderboard [data-avatar-kind=fallback]")).toHaveCount(0);
});
for(const mode of ["duel","ranking","winner","tie-final"]){
 test(`Showroom: premium full fight ${mode}`,async({page})=>{
  await page.clock.install({time:now});const current=structuredClone(fight);current.metric="points";
  if(mode==="tie-final")current.events=[{id:"observed-tie",kind:"tie",station_id:"t",station_name:"Tingsryd · Karlskrona",created_at:now.toISOString()},...(current.events??[])];
  if(mode==="ranking")current.standings.push({id:"m",name:"Malmö",rank:3,points:320,count:80,tb_ore:100000,unknown_tb_count:0});
  if(mode==="winner" || mode==="tie-final"){current.phase="finished";current.winner_ids=mode==="winner" ? ["k"]:["k","t"];if(mode==="tie-final")current.standings=current.standings.map(s=>({...s,points:342,rank:1}));}
  await page.route("**/api/arena/fights/showroom",r=>r.fulfill({json:current}));await page.setViewportSize({width:1920,height:1080});await page.goto("/arena/fights/showroom?showcase=1");await expect(page.locator(".arena-fight-feed li")).toHaveCount(mode==="tie-final" ? 6:5);await capture(page,`fight-full-${mode}-1920x1080`);await page.setViewportSize({width:390,height:844});await capture(page,`fight-full-${mode}-390x844`);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 });
}
test("Showroom: Superadmin fight manager has participants, phases and leader",async({page})=>{
  const stations=[{id:"t",name:"Tingsryd",email:null,status:"active",kind:"arena"},{id:"k",name:"Karlskrona",email:null,status:"active",kind:"arena"}];
  await page.route("**/api/arena/auth/superadmin/session",r=>r.fulfill({json:{authenticated:true}}));await page.route("**/api/arena/superadmin/stations",r=>r.fulfill({json:{stations}}));await page.route("**/api/arena/superadmin/groups",r=>r.fulfill({json:{groups:[]}}));await page.route("**/api/arena/superadmin/fights",r=>r.fulfill({json:{fights:["active","scheduled","finished"].map((status,i)=>({...fight,id:`fight-${i}`,status,participants:stations,leader_names:status==="scheduled" ? []:["Karlskrona"]}))}}));
  await page.setViewportSize({width:1920,height:1080});await page.route('**/api/arena/superadmin/competitions/availability',r=>r.fulfill({json:{bookings:[],activities:[],categories:[]}}));await page.goto("/arena/superadmin?showcase=1");await page.getByRole("button",{name:"Butiksfight",exact:true}).click();await page.getByText('Tidigare fighter och enkel matchadministration',{exact:true}).click();await expect(page.locator(".arena-fight-manager-group")).toHaveCount(3);await expect(page.locator(".arena-fight-manager-group").first()).toContainText("Leder: Karlskrona");await capture(page,"superadmin-fight-manager-1920x1080");
});
for(const won of [true,false]){
 test(`Showroom: Arena final winner and motivating loss, once ${won ? 'winner':'loss'}`,async({page})=>{
  await page.setViewportSize({width:won ? 1920:390,height:won ? 1080:844});await page.clock.install({time:now});
  const final={...structuredClone(fight),phase:"finished" as const,winner_ids:[won ? "t":"k"],leader_ids:[won ? "t":"k"]};if(won)final.standings=[{...fight.standings[1],rank:1,points:428},{...fight.standings[0],rank:2,points:401}];await setup(page,()=>({...initial,fight:final}));await page.goto("/arena?showcase=1");
  await expect(page.locator(".fight-celebration-final h2")).toHaveText(`${won ? "Tingsryd":"Karlskrona"} VINNER!`);if(!won)await expect(page.locator(".fight-celebration-final .arena-reward-pep")).toContainText("NÄSTA FIGHT VÄNTAR");await capture(page,`fight-arena-final-${won ? "winner-1920x1080":"loss-390x844"}`);
  await page.getByRole("button",{name:/^Biltvätt, /}).click();await expect(page.getByRole("dialog")).toBeVisible();await expect(page.locator(".fight-celebration-final")).toHaveCount(0);await page.reload();await expect(page.locator(".arena-fight-widget")).toBeVisible();await expect(page.locator(".fight-celebration-final")).toHaveCount(0);
 });
}
test("Showroom: one hero for simultaneous goal, leader and fight, undo clears receipt",async({page})=>{
 const current={...structuredClone(initial),fight:structuredClone(fight)};await page.clock.install({time:now});await page.setViewportSize({width:1920,height:1080});await setup(page,()=>current);
 await page.route("**/api/arena/registrations",r=>{current.fight={...current.fight,version:2,leader_ids:["t"],standings:[{...fight.standings[1],rank:1,points:343},{...fight.standings[0],rank:2}]};return r.fulfill({json:{registration:{id:r.request().postDataJSON().request_id,points_awarded:2,voided_at:null},achievements:[{kind:"personal-goal",level:3,special:true,text:"Personliga målet uppnått!",scope:"Idag",goal:{id:"goal",period_type:"custom",start_date:"2026-10-14",end_date:"2026-10-14",points:100,target_points:100}},{kind:"leader",level:3,special:true,text:"Ny etta!",scope:"Idag",previousLeader:"Alva"}]}});});
 await page.route("**/api/arena/registrations/*/void",r=>{current.fight=structuredClone(fight);return r.fulfill({json:{ok:true}});});await page.goto("/arena?showcase=1");await sale(page);await expect(page.locator(".arena-celebration")).toHaveCount(1);await expect(page.locator(".arena-victory-secondary")).toContainText("Laget tar ledningen i Butiksfight!");await capture(page,"simultaneous-achievements-1920x1080");await page.getByRole("button",{name:/Ångra senaste/}).click();await expect(page.locator(".arena-celebration")).toHaveCount(0);await page.clock.runFor(4000);await expect(page.locator(".arena-celebration")).toHaveCount(0);await expect(page.locator(".arena-fight-widget-gap")).toContainText("Karlskrona leder");
});
test("Showroom: countdown alone becomes urgent and respects reduced motion",async({page})=>{
 await page.clock.install({time:now});await setup(page,()=>({...initial,fight}));await page.goto("/arena?showcase=1");await expect(page.locator(".arena-fight-widget .urgency-quarter")).toBeAttached();const stage=await page.locator(".arena-stage").innerHTML();await page.clock.fastForward(10*60000);await expect(page.locator(".arena-fight-widget .urgency-final")).toBeAttached();expect(await page.locator(".arena-stage").innerHTML()).toBe(stage);await capture(page,"fight-widget-final-sprint-1280x720");await page.emulateMedia({reducedMotion:"reduce"});expect(await page.locator(".arena-fight-widget .arena-fight-clock").evaluate(e=>getComputedStyle(e).animationName)).toBe("none");
});
test("Showroom: full TB duel values fit wide and portrait widget",async({page})=>{
 const current={...structuredClone(initial),fight:{...structuredClone(fight),metric:"tb" as const}};await page.clock.install({time:now});await setup(page,()=>current);
 for(const [width,height] of [[1920,1080],[390,844]]){
  await page.setViewportSize({width,height});await page.goto("/arena?showcase=1");const widget=page.locator(".arena-fight-widget");await expect(widget).toBeVisible();await expect(widget.locator(".arena-fight-widget-score")).toContainText("kr TB");
  expect(await widget.evaluate(el=>{const r=el.getBoundingClientRect();return el.scrollWidth<=el.clientWidth+1 && [...el.querySelectorAll('.arena-fight-widget-score b')].every(b=>{const t=b.getBoundingClientRect();return t.left>=r.left && t.right<=r.right && t.top>=r.top && t.bottom<=r.bottom;});})).toBe(true);
  await noOverflow(page,width,height);await capture(page,`fight-widget-tb-${width}x${height}`);
 }
});
