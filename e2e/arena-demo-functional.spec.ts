import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolatedDemoBackend} from './arena-demo-functional-client';
const root='/workspace/work/artifacts/arena-demo-functional-qa';
type Demo=Awaited<ReturnType<typeof isolatedDemoBackend>>;
async function transport(page:Page,f:Demo){
 const calls:{path:string;method:string;status:number;payload?:any;result?:any}[]=[];let dropReceipt=false;
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname.replace(/^\/api/,'')+url.search;
  const payload=request.postData()?JSON.parse(request.postData()!):undefined;
  // Transport adapter only: every response is computed by real production
  // Worker routes against this test's D1-compatible in-memory database.
  const response=await f.call(path,request.method(),payload,f.cookies[f.station],{Origin:'https://tvattligan.test'});
  const body=Buffer.from(await response.arrayBuffer());let result;try{result=JSON.parse(body.toString());}catch{}
  calls.push({path,method:request.method(),status:response.status,...(request.method()==='POST'?{payload,result}:{})});
  if(dropReceipt&&path==='/arena/registrations'&&request.method()==='POST'&&response.status===200){dropReceipt=false;await route.abort('connectionreset');return;}
  await route.fulfill({status:response.status,contentType:response.headers.get('content-type')??'application/json',body});
 });
 return {calls,dropNextReceipt:()=>{dropReceipt=true;}};
}
async function ready(page:Page){await expect(page.locator('.arena-orb')).toHaveCount(7);await expect(page.locator('.arena-intro')).toHaveCount(0);await page.clock.runFor(1800);}
async function refresh(page:Page){await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.clock.runFor(6000);await expect(page.locator('.arena-error')).toHaveCount(0);}
async function screenshot(page:Page,name:string){if(process.env.ARENA_DEMO_REVIEW!=='1')return;await mkdir(root,{recursive:true});await page.evaluate(()=>{if(document.getElementById('synthetic-qa'))return;const el=document.createElement('div');el.id='synthetic-qa';el.textContent='SYNTETISKT INTEGRATIONSTEST · LOKAL MINNESDATABAS';el.style.cssText='position:fixed;bottom:4px;right:5px;z-index:1000;color:#f3df9b;background:#061b14ed;border:1px solid #b29a60;padding:3px 6px;font:9px Arial;pointer-events:none';document.body.append(el);});await page.screenshot({path:`${root}/${name}.png`,animations:'disabled'});}
async function sale(page:Page,activity:string,retry=false){
 await page.locator('.arena-orb').filter({hasText:activity}).click();await expect(page.getByRole('dialog')).toBeVisible();
 let response:ReturnType<Page['waitForResponse']>;
 if(retry){
  await page.getByRole('dialog').getByRole('button',{name:'Viktor',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Svaret kunde inte bekräftas');
  await expect(page.getByRole('dialog').getByRole('button',{name:'Viktor',exact:true})).toBeDisabled();
  response=page.waitForResponse(r=>r.url().endsWith('/api/arena/registrations')&&r.request().method()==='POST');
  await page.getByRole('dialog').getByRole('button',{name:'Försök igen',exact:true}).click();
 }else{
  response=page.waitForResponse(r=>r.url().endsWith('/api/arena/registrations')&&r.request().method()==='POST');
  await page.getByRole('dialog').getByRole('button',{name:'Viktor',exact:true}).click();
 }
 const r=await response;expect(r.status()).toBe(200);const body=await r.json();await expect(page.getByRole('dialog')).toHaveCount(0);await refresh(page);return {payload:r.request().postDataJSON(),body};
}

async function mobilePanel(page:Page,which:'topplistan'|'senaste aktiviteter',include:string,exclude?:string){await page.getByRole('button',{name:`Öppna ${which}`,exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText(include);if(exclude)await expect(dialog).not.toContainText(exclude);await dialog.getByRole('button',{name:'Stäng',exact:true}).click();}
async function overflow(page:Page,w:number,h:number){expect(await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight}))).toEqual({w,h});}

for(const [w,h] of [[1920,1080],[1536,864],[390,844]])test(`Real Worker + UI: parallel competitions, mode, retry, undo and final ${w}x${h}`,async({page})=>{
 test.setTimeout(90000);
 const f=await isolatedDemoBackend();const evidence:any={viewport:{w,h},challenge:f.challenge,steps:[],sales:[],snapshots:{}};
 try{
  await page.setViewportSize({width:w,height:h});await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(()=>sessionStorage.setItem('arena:intro-seen:v1','1'));await page.clock.install({time:f.now()});
  const control=await transport(page,f),calls=control.calls;
  const snapshot=(a:Awaited<ReturnType<Demo['all']>>)=>({internal_viktor:f.person(a.internal).points,national_individual_viktor:f.person(a.nationalPerson).points,national_station_tingsryd:f.team(a.nationalStation).points,ordinary_today_count:a.stats.count,ordinary_today_points:a.stats.points,fight_tingsryd:a.stats.fight?.standings.find(p=>p.id===f.station)?.points});
  const initial=await f.all();evidence.snapshots.initial=snapshot(initial);expect(f.person(initial.internal,f.alva).points).toBe(98);expect(f.person(initial.internal).points).toBe(96);expect(initial.stats.count).toBe(194);evidence.steps.push('1–2: internal 98/96 and parallel national individual/station contests verified');
  // Deliberately record this as a scenario blocker, not a passed acceptance flow.
  expect(f.challenge.status).toBe(400);expect(JSON.stringify(f.challenge.body)).toContain('Organisationsbundna matcher');evidence.steps.push('3 BLOCKED: station challenge prohibited for organization members; remainder uses authorized central fight');
  if(w===1920){await page.goto('/arena/fights');await page.getByRole('button',{name:'Utmana en station',exact:true}).click();await expect(page.getByLabel('Motståndare',{exact:true}).locator('option')).toHaveCount(1);await expect(page.getByRole('button',{name:'Förhandsgranska dagsduellen'})).toBeDisabled();await page.locator('.arena-challenge-setup').scrollIntoViewIfNeeded();await screenshot(page,'challenge-blocked-1920x1080');}
  await page.goto('/arena');await ready(page);await expect(page.locator('.is-battle')).toBeVisible();await expect(page.locator('.arena-orb:not(:disabled)')).toHaveCount(2);await expect(page.locator('.arena-battle-score')).toHaveCount(2);await expect(page.locator('.arena-war-scope')).toContainText('Biltvätt');await expect(page.locator('.arena-war-scope')).toContainText('Kaffe + bulle');await expect(page.locator('.arena-war-scope')).not.toContainText('ALLA KATEGORIER');
  await expect(page.locator('.arena-war-scoreboard')).toContainText('Tingsryd');await expect(page.locator('.arena-war-scoreboard')).toContainText('Ronneby');await expect(page.getByRole('timer')).toHaveText(/11:59:\d\d|12:00:00/);
  if(w>=951){await expect(page.locator('.arena-left-column')).toHaveAttribute('data-context','fight');await expect(page.locator('.arena-leaderboard')).toContainText('Ronneby');await expect(page.locator('.arena-recent')).toContainText('Biltvätt');}else{await mobilePanel(page,'topplistan','Ronneby');await mobilePanel(page,'senaste aktiviteter','Biltvätt');}
  await page.getByRole('button',{name:'STATIONSLÄGE',exact:true}).click();await expect(page.locator('.is-battle')).toHaveCount(0);await expect(page.locator('.arena-orb:disabled')).toHaveCount(0);await expect(page.locator('.arena-nav .has-live-fight')).toBeVisible();if(w>=951){await expect(page.locator('.arena-leaderboard')).toContainText('Alva');await expect(page.locator('.arena-leaderboard')).toContainText('Viktor');await expect(page.locator('.arena-left-column')).toHaveAttribute('data-context','local');}else{await mobilePanel(page,'topplistan','Alva','Ronneby');await mobilePanel(page,'senaste aktiviteter','Alva');}
  await overflow(page,w,h);await screenshot(page,`station-before-${w}x${h}`);
  control.dropNextReceipt();const first=await sale(page,'BILTVÄTT',true);expect(calls.filter(c=>c.path==='/arena/registrations'&&c.method==='POST').slice(0,2).map(c=>c.payload.request_id)).toEqual([first.payload.request_id,first.payload.request_id]);evidence.sales.push(first);expect(first.body.registration.points_awarded).toBe(1);await expect(page.getByRole('button',{name:'STATIONSLÄGE',exact:true})).toHaveAttribute('aria-pressed','true');
  let after=await f.all();evidence.snapshots.station_wash=snapshot(after);expect(f.person(after.internal).points).toBe(97);expect(f.person(after.nationalPerson).points-f.person(initial.nationalPerson).points).toBe(2);expect(f.team(after.nationalStation).points-f.team(initial.nationalStation).points).toBe(8);expect(after.stats.count).toBe(195);expect(after.stats.points).toBe(195);expect(after.stats.fight!.standings.find(s=>s.id===f.station)!.points).toBe(1);
  expect((await f.inspect('sale-id',first.body.registration.id)).n).toBe(1);
  const second=await sale(page,'KORV MED MOS');evidence.sales.push(second);after=await f.all();evidence.snapshots.excluded_food=snapshot(after);expect(f.person(after.internal).points).toBe(97);expect(after.stats.count).toBe(196);expect(after.stats.fight!.standings.find(s=>s.id===f.station)!.points).toBe(1);expect(f.person(after.nationalPerson).points-f.person(initial.nationalPerson).points).toBe(3);expect(f.team(after.nationalStation).points-f.team(initial.nationalStation).points).toBe(12);
  await page.reload();await ready(page);await expect(page.locator('.is-battle')).toHaveCount(0);await page.getByRole('button',{name:'BATTLE MODE',exact:true}).click();await expect(page.locator('.is-battle')).toBeVisible();if(w>=951){await expect(page.locator('.arena-recent')).toContainText('Viktor');await expect(page.locator('.arena-recent')).not.toContainText('Korv med mos');}else{await mobilePanel(page,'topplistan','Viktor');await mobilePanel(page,'senaste aktiviteter','Viktor','Korv med mos');}
  const third=await sale(page,'BILTVÄTT');evidence.sales.push(third);after=await f.all();evidence.snapshots.battle_wash=snapshot(after);expect(f.person(after.internal).points).toBe(98);expect(f.person(after.nationalPerson).points-f.person(initial.nationalPerson).points).toBe(5);expect(f.team(after.nationalStation).points-f.team(initial.nationalStation).points).toBe(20);expect(after.stats.fight!.standings.find(s=>s.id===f.station)!.points).toBe(2);expect(after.stats.count).toBe(197);await expect(page.locator('.is-battle')).toBeVisible();await screenshot(page,`battle-after-${w}x${h}`);
  const replay=await f.call('/arena/registrations','POST',third.payload,f.cookies[f.station]);expect(replay.status).toBe(200);expect((await replay.json() as any).registration.id).toBe(third.body.registration.id);expect((await f.inspect('request-id',third.payload.request_id)).n).toBe(1);
  await page.clock.runFor(16000);await page.reload();await ready(page);expect((await f.stats()).count).toBe(197);await expect(page.locator('.is-battle')).toBeVisible();
  // Refresh removes the local undo receipt. Make one more genuine UI sale, then
  // undo it through the real visible receipt; the previous sale remains saved.
  const fourth=await sale(page,'BILTVÄTT');evidence.sales.push(fourth);expect((await f.stats()).count).toBe(198);await page.getByRole('button',{name:/Ångra senaste/}).click();await refresh(page);after=await f.all();evidence.snapshots.after_undo=snapshot(after);expect(after.stats.count).toBe(197);expect(f.person(after.internal).points).toBe(98);expect(f.person(after.nationalPerson).points-f.person(initial.nationalPerson).points).toBe(5);expect(f.team(after.nationalStation).points-f.team(initial.nationalStation).points).toBe(20);expect(after.stats.fight!.standings.find(s=>s.id===f.station)!.points).toBe(2);expect((await f.inspect('voided',fourth.body.registration.id)).voided_at).toBeTruthy();evidence.steps.push('4–11: UI Station/Battle sales, same ledger IDs, excluded category, refresh/poll, retry and UI undo verified');
  const beforeFinal=await f.view(f.ids.duel);const end=Date.parse(beforeFinal.own_match!.end_at!);await f.setNow(end+1000);await page.clock.setSystemTime(end+1000);await refresh(page);await expect(page.locator('.is-battle')).toHaveCount(0);await expect(page.getByRole('button',{name:'BATTLE MODE',exact:true})).toBeDisabled();const final=await f.view(f.ids.duel);expect(final.phase).toBe('finished');expect(final.frozen).toBe(true);expect(final.champion_ids).toEqual([f.station]);expect(final.matches[0].score).toEqual([2,1]);expect((await f.view(f.ids.internal)).phase).toBe('active');expect((await f.view(f.ids.nationalPerson)).phase).toBe('active');expect((await f.view(f.ids.nationalStation)).phase).toBe('active');
  await page.clock.runFor(16000);await expect(page.locator('.arena-orb:not(:disabled)')).toHaveCount(7);if(w>=951)await expect(page.locator('.arena-left-column')).toHaveAttribute('data-context','local');await overflow(page,w,h);
  if(w===1920)await screenshot(page,'station-fight-finished-1920x1080');
  const fifth=await sale(page,'BILTVÄTT');evidence.sales.push(fifth);expect(f.person(await f.view(f.ids.internal)).points).toBe(99);expect(await f.view(f.ids.duel)).toEqual(final);evidence.steps.push('12: frozen 2–1 result/history and Station fallback; internal/national remain active and continue scoring');
  expect(await f.inspect('foreign-keys')).toEqual([]);
  evidence.snapshots.continued_after_final=snapshot(await f.all());
  evidence.summary={active_sales:(await f.stats()).count,internal_viktor:f.person(await f.view(f.ids.internal)).points,final:final.matches[0].score,requests:calls.length,registration_posts:calls.filter(c=>c.path==='/arena/registrations'&&c.method==='POST').length};
 }finally{await mkdir(root,{recursive:true});await writeFile(`${root}/evidence-${w}x${h}.json`,JSON.stringify(evidence,null,2));await f.close();}
});
