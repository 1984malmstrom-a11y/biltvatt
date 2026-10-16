import {test,expect,type Browser,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolatedDemoBackend} from './arena-demo-functional-client';

type Backend=Awaited<ReturnType<typeof isolatedDemoBackend>>;
const root='/workspace/work/artifacts/arena-station-challenges';
async function stationPage(browser:Browser,f:Backend,role:string,width:number,height:number){
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),page=await context.newPage();
 context.setDefaultTimeout(10000);
 await page.addInitScript(()=>sessionStorage.setItem('arena:intro-seen:v1','1'));
 await page.clock.install({time:f.now()});
 // Only the transport is adapted: real Worker handlers, auth, SQL, ledger and
 // snapshots run in the isolated backend. Each context has its own station.
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.replace(/^\/api/,'')+url.search;
  const response=await f.call(path,req.method(),req.postData()?JSON.parse(req.postData()!):undefined,role);
  await route.fulfill({status:response.status,contentType:response.headers.get('content-type')??'application/json',body:Buffer.from(await response.arrayBuffer())});
 });
 return page;
}
async function clickResponse(page:Page,path:string,click:()=>Promise<unknown>){
 const pending=page.waitForResponse(r=>new URL(r.url()).pathname===`/api${path}`&&r.request().method()==='POST');
 await click();return pending;
}
async function send(page:Page,f:Backend){
 await page.goto('/arena/fights');await page.getByRole('button',{name:'Utmana en station',exact:true}).click();
 const opponents=page.getByLabel('Motståndare',{exact:true});await expect(opponents.locator('option')).toHaveCount(4);
 await opponents.selectOption(f.opponent);await expect(opponents).toHaveValue(f.opponent);await page.getByRole('combobox',{name:'Mätetal',exact:true}).selectOption('points');
 await page.getByRole('combobox',{name:'Omfattning',exact:true}).selectOption('category');await page.getByRole('combobox',{name:'Arena-kategori',exact:true}).selectOption('wash');
 await page.getByRole('button',{name:'Förhandsgranska dagsduellen',exact:true}).click();
 const response=await clickResponse(page,'/admin/arena/challenges',()=>page.getByRole('button',{name:'Skicka utmaning',exact:true}).click());
 expect(response.status()).toBe(201);return (await response.json()).id as string;
}
async function accept(page:Page,id:string){
 await page.goto('/arena/fights');const card=page.locator('.arena-challenge-card.is-incoming');
 await expect(card).toContainText('Tingsryd utmanar Ronneby');await card.getByRole('checkbox').check();
 const response=await clickResponse(page,`/admin/arena/challenges/${id}/accept`,()=>card.getByRole('button',{name:'Acceptera utmaningen',exact:true}).click());
 expect(response.status()).toBe(200);return (await response.json()).id as string;
}
async function ready(page:Page){await expect(page.locator('.arena-orb')).toHaveCount(7);await expect(page.locator('.arena-intro')).toHaveCount(0);await page.clock.runFor(1800);}
async function refresh(page:Page){await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.clock.runFor(6000);}
async function sale(page:Page,seller:string){
 await page.locator('.arena-orb-focus').click();const dialog=page.getByRole('dialog');
 const response=await clickResponse(page,'/arena/registrations',()=>dialog.getByRole('button',{name:seller,exact:true}).click());
 expect(response.status()).toBe(200);await expect(dialog).toHaveCount(0);await refresh(page);
}
async function capture(page:Page,name:string){
 await mkdir(root,{recursive:true});
 await page.evaluate(()=>{const el=document.createElement('div');el.textContent='SYNTETISKT LOKALT UI/API-TEST';el.style.cssText='position:fixed;bottom:2px;right:3px;z-index:1000;font:10px Arial;color:#f8dfa0;background:#062116;padding:4px;pointer-events:none';document.body.append(el);});
 await page.screenshot({path:`${root}/${name}.png`,animations:'disabled',timeout:10000});
}

for(const [width,height] of [[1920,1080],[390,844]])test(`station challenge: real send/accept, both Battle Modes, decline, score and frozen history ${width}x${height}`,async({browser})=>{
 test.setTimeout(120000);const f=await isolatedDemoBackend({deferDuel:true});let a:Page|undefined,b:Page|undefined;
 try{
  a=await stationPage(browser,f,'stationAdmin',width,height);b=await stationPage(browser,f,'opponentAdmin',width,height);
  const id=await test.step('A sends invitation',()=>send(a!,f)),competition=await test.step('B accepts invitation',()=>accept(b!,id));expect(competition).toBe(`duel:${id}`);
  for(const page of [a,b]){await page.goto('/arena');await ready(page);await expect(page.locator('.is-battle')).toBeVisible();await expect(page.locator('.arena-orb:not(:disabled)')).toHaveCount(1);expect(await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight])).toEqual([width,height]);}
  const before=await f.view(competition);expect(before.own_match!.current_day!.standings.map(s=>s.points)).toEqual([194,0]);
  await sale(a,'Viktor');await sale(b,'Testsäljare 1');await sale(a,'Viktor');
  const live=await f.view(competition);expect(live.own_match!.current_day!.standings.map(s=>s.points)).toEqual([196,1]);
  await capture(a,`battle-station-a-${width}x${height}`);await capture(b,`battle-station-b-${width}x${height}`);
  // A second overlapping invitation may be sent, but can never acquire B's
  // occupied match window. B can still decline it in the actual UI.
  const sent=await f.call('/admin/arena/challenges','POST',{request_id:crypto.randomUUID(),opponent_id:f.opponent,day:'2026-10-16',metric:'points',scope:{kind:'all'}},'thirdAdmin');expect(sent.status).toBe(201);const other=(await sent.json() as any).id;
  expect((await f.call(`/admin/arena/challenges/${other}/accept`,'POST',{confirm:true},'opponentAdmin')).status).toBe(409);
  await b.goto('/arena/fights');const incoming=b.locator('.arena-challenge-card.is-incoming');await incoming.getByRole('checkbox').check();await expect(incoming.getByRole('button',{name:'Acceptera utmaningen'})).toBeDisabled();
  const declined=await clickResponse(b,`/admin/arena/challenges/${other}/decline`,()=>incoming.getByRole('button',{name:'Avböj',exact:true}).click());expect(declined.status()).toBe(200);await expect(b.locator('.arena-challenge-card.is-incoming')).toHaveCount(0);
  for(const path of [`/arena/competitions/${competition}`,`/arena/fights/${competition}:direct`])expect((await f.call(path,'GET',undefined,'foreign')).status).toBe(404);
  for(const action of ['accept','decline','cancel'])expect((await f.call(`/admin/arena/challenges/${id}/${action}`,'POST',{confirm:true,reason:'Forbidden'},'foreignAdmin')).status).toBe(404);
  const end=Date.parse(live.own_match!.end_at!);await f.setNow(end+1000);
  for(const page of [a,b]){await page.clock.setSystemTime(end+1000);await page.goto('/arena');await ready(page);await expect(page.locator('.is-battle')).toHaveCount(0);await expect(page.getByRole('button',{name:'BATTLE MODE',exact:true})).toBeDisabled();}
  const final=await f.view(competition);expect(final.phase).toBe('finished');expect(final.frozen).toBe(true);expect(final.champion_ids).toEqual([f.station]);expect(final.matches[0].score).toEqual([196,1]);expect(final.standings.map(s=>s.match_points)).toEqual([1,0]);
  await a.goto(`/arena/competitions/${competition}`);await a.getByRole('button',{name:'Historik',exact:true}).click();await expect(a.locator('.arena-match-card')).toContainText('VINNARE: Tingsryd');await expect(a.locator('.arena-match-card')).toContainText('Ronneby');await capture(a,`history-${width}x${height}`);
  await a.goto('/arena');await ready(a);await sale(a,'Viktor');expect(await f.view(competition)).toEqual(final);expect(await f.inspect('foreign-keys')).toEqual([]);
  await writeFile(`${root}/verification-${width}x${height}.json`,JSON.stringify({synthetic:true,challenge:id,competition,live_day_sales:[196,1],frozen_day_sales:final.matches[0].score,frozen_match_points:final.standings.map(s=>s.match_points),champions:final.champion_ids,foreign_access:'404',overlap_accept:'409',ui_decline:declined.status()},null,2));
 }finally{await a?.context().close();await b?.context().close();await f.close();}
});

test('station recipient cancels its accepted duel through UI and preserves cancelled history',async({browser})=>{
 test.setTimeout(90000);const f=await isolatedDemoBackend({deferDuel:true});let a:Page|undefined,b:Page|undefined;
 try{
  a=await stationPage(browser,f,'stationAdmin',1920,1080);b=await stationPage(browser,f,'opponentAdmin',1920,1080);
  const id=await test.step('A sends invitation',()=>send(a!,f)),competition=await test.step('B accepts invitation',()=>accept(b!,id));
  await b.goto(`/arena/competitions/${competition}`);await b.getByText('Avbryt den spontana duellen',{exact:true}).click();
  await b.getByLabel('Anledning',{exact:true}).fill('Syntetiskt lokalt verifieringsavbrott');await b.getByRole('checkbox',{name:'Jag bekräftar avbrottet'}).check();
  const response=await clickResponse(b,`/admin/arena/challenges/${id}/cancel`,()=>b!.getByRole('button',{name:'Avbryt och bevara historiken'}).click());expect(response.status()).toBe(200);
  await expect(b.getByRole('heading',{name:'DUELLEN HAR AVBRUTITS'})).toBeVisible();const final=await f.view(competition);expect(final.phase).toBe('cancelled');expect(final.frozen).toBe(true);expect(final.champion_ids).toEqual([]);await capture(b,'cancelled-history-1920x1080');
  await a.goto('/arena');await ready(a);await expect(a.locator('.is-battle')).toHaveCount(0);
 }finally{await a?.context().close();await b?.context().close();await f.close();}
});
