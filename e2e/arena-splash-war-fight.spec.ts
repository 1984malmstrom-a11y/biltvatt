import {test,expect,type Page} from '@playwright/test';
import {boot,initial,fight,now} from './arena-release-fixture';
import type {ArenaFightSummary} from '../shared/arena-fights';
const sizes=[[1920,1080],[1536,864],[1448,1086],[1024,768],[390,844],[844,390]];
async function session(page:Page){await page.addInitScript(()=>sessionStorage.setItem('arena:intro-seen:v1','1'));}
async function mock(page:Page,current:()=>ArenaFightSummary|null=()=>null){
 await page.route('**/api/arena/bootstrap',r=>r.fulfill({json:boot}));
 await page.route('**/api/arena/stats*',r=>r.fulfill({json:{...initial,fight:current(),fight_objective:{fight_id:fight.id,scope:'all',activity_ids:null}}}));
}
const active=(minutes=120):ArenaFightSummary=>({...fight,start_at:new Date(now.getTime()-3600000).toISOString(),end_at:new Date(now.getTime()+minutes*60000).toISOString()});
async function settled(page:Page){await expect(page.locator('.arena-intro')).toHaveCount(0);await expect(page.locator('.arena-orb')).toHaveCount(7);}
test('Intro: first session holds presentation for three seconds, then refresh and internal navigation skip it',async({page})=>{
 await page.clock.install({time:now});await mock(page);await page.goto('/arena');
 await expect(page.locator('.arena-intro')).toBeVisible();await expect(page.locator('.arena-orb')).toHaveCount(7);
 await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('arena:intro-seen:v1'))).toBe('1');
 await page.clock.runFor(1800);await expect(page.locator('.arena-intro')).toBeVisible();
 await page.clock.runFor(1500);await page.clock.runFor(300);await settled(page);
 expect(await page.evaluate(()=>sessionStorage.getItem('arena:intro-seen:v1'))).toBe('1');
 await page.reload();await settled(page);await page.getByRole('button',{name:'TOPPLISTOR',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('.arena-intro')).toHaveCount(0);
});
test('Intro: explicit showcase replay keeps the exact locked emblem artwork',async({page})=>{
 await session(page);await mock(page);await page.goto('/arena?showcase=1&intro=1');await expect(page.locator('.arena-intro')).toBeVisible();await expect(page.locator('.arena-brand>svg')).toBeAttached();
 const path=await page.locator('.arena-intro-symbol>svg path').evaluateAll(es=>es.map(e=>e.getAttribute('d')));
 expect(path).toEqual(await page.locator('.arena-brand>svg path').evaluateAll(es=>es.map(e=>e.getAttribute('d'))));
 await expect(page.locator('.arena-intro-symbol')).toHaveCSS('transform','none');
});
test('Intro: delayed readiness stays honest after three seconds and recovers when data arrives',async({page})=>{
 await page.clock.install({time:now});await mock(page);const held:import('@playwright/test').Route[]=[];
 await page.route('**/api/arena/bootstrap',r=>{held.push(r);});await page.goto('/arena');await expect.poll(()=>held.length).toBeGreaterThan(0);
 await page.clock.runFor(3300);await expect(page.locator('.arena-intro')).toContainText('ANSLUTER TILL ARENAN');await expect(page.locator('.arena-intro')).toHaveAttribute('aria-busy','true');
 for(const r of held)await r.fulfill({json:boot});await expect(page.locator('.arena-orb')).toHaveCount(7);await page.clock.runFor(300);await settled(page);
});
test('Intro: failed initialization offers retry instead of an endless progress loop',async({page})=>{
 let failed=true;await mock(page);await page.route('**/api/arena/bootstrap',r=>r.fulfill({status:failed?503:200,json:failed?{error:'Tillfälligt anslutningsfel'}:boot}));
 await page.goto('/arena');await expect(page.locator('.arena-intro-recovery')).toContainText('Tillfälligt anslutningsfel');failed=false;await page.locator('.arena-intro-recovery button').click();await settled(page);
});
test('Intro: blocked sessionStorage never blocks initialization or internal navigation',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(window,'sessionStorage',{get(){throw new Error('blocked');}}));await page.emulateMedia({reducedMotion:'reduce'});await mock(page);await page.goto('/arena');await settled(page);await page.getByRole('button',{name:'TOPPLISTOR',exact:true}).click();await expect(page.locator('.arena-intro')).toHaveCount(0);
});
test('Intro: a late bootstrap success cannot erase an initial statistics failure',async({page})=>{
 await mock(page);await page.route('**/api/arena/stats*',r=>r.fulfill({status:503,json:{error:'Statistiken är otillgänglig'}}));
 await page.route('**/api/arena/bootstrap',async r=>{await new Promise(resolve=>setTimeout(resolve,350));await r.fulfill({json:boot});});await page.goto('/arena');await expect(page.locator('.arena-intro-recovery')).toBeVisible();await expect(page.locator('.arena-intro-recovery')).toContainText(/Statistiken/);
});
test('Intro: failed lazy application chunk has a clear reload action',async({page})=>{
 await page.route(/\/(?:assets\/ArenaApp-[^/]+\.js|src\/ArenaApp\.tsx)(?:\?.*)?$/,r=>r.abort());await page.goto('/arena');await expect(page.locator('.arena-intro-recovery')).toContainText('Arenan kunde inte startas');await expect(page.locator('.arena-intro-recovery button')).toHaveText('Försök igen');
});
test('Intro: a stalled initialization offers retry after the bounded wait',async({page})=>{
 await page.clock.install({time:now});await mock(page);await page.route('**/api/arena/bootstrap',()=>new Promise(()=>{}));await page.goto('/arena');await expect(page.locator('.arena-intro')).toBeVisible();await page.clock.runFor(15500);await expect(page.locator('.arena-intro-recovery')).toContainText('Anslutningen tar längre tid');await expect(page.locator('.arena-intro-recovery button')).toBeVisible();
});
test('Intro: reduced motion is static, exits as soon as ready and leaves keyboard access',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await mock(page);const held:import('@playwright/test').Route[]=[];await page.route('**/api/arena/bootstrap',r=>{held.push(r)});await page.goto('/arena');
 await expect(page.locator('.arena-intro')).toBeVisible();expect(await page.locator('.arena-intro-track i').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
 await expect.poll(()=>held.length).toBeGreaterThan(0);for(const r of held)await r.fulfill({json:boot});await settled(page);await page.getByRole('button',{name:'Biltvätt, +2 poäng',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
});
for(const[width,height]of sizes)test(`War Fight: responsive contents and unchanged stage geometry ${width}x${height}`,async({page})=>{
 await session(page);await page.clock.install({time:now});let current:ArenaFightSummary|null=null;await mock(page,()=>current);await page.setViewportSize({width,height});await page.goto('/arena');await settled(page);
 const boxes=()=>page.locator('.arena-stage .arena-orb').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}));const before=await boxes();current=active();
 await page.clock.runFor(12500);await expect(page.locator('.arena-war-fight')).toBeVisible();expect(await boxes()).toEqual(before);
 expect(await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight])).toEqual([width,height]);
 const card=page.locator('.arena-war-fight');expect(await card.evaluate(e=>e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1)).toBe(true);
 for(const selector of ['.arena-war-header','.arena-war-scoreboard','.arena-war-clock','.arena-war-scope','.arena-war-lead']){
  const r=await card.boundingBox(),b=await card.locator(selector).boundingBox();expect(b,selector).not.toBeNull();expect(b!.x).toBeGreaterThanOrEqual(r!.x);expect(b!.x+b!.width).toBeLessThanOrEqual(r!.x+r!.width+1);expect(b!.y+b!.height).toBeLessThanOrEqual(r!.y+r!.height+1);
 }
 await expect(card.locator('.arena-war-station svg')).toHaveCount(0);
});
for(const[minutes,urgency]of [[60,'hour'],[15,'quarter'],[5,'final']] as const)test(`War Fight: inclusive ${minutes} minute threshold`,async({page})=>{
 await session(page);await page.clock.install({time:now});await mock(page,()=>active(minutes));await page.goto('/arena');await expect(page.locator(`.arena-war-clock.urgency-${urgency}`)).toBeVisible();if(minutes<=15)await expect(page.locator('.arena-fight-sprint')).toBeVisible();
});
for(const metric of ['points','tb','count'] as const)test(`War Fight: honest ${metric} metric, station identity and lead`,async({page})=>{
 await session(page);await page.clock.install({time:now});await mock(page,()=>({...active(),metric}));await page.goto('/arena');await expect(page.locator('.arena-war-scoreboard')).toContainText(metric==='tb'?'kr TB':metric==='count'?'st':'p');await expect(page.locator('.arena-war-lead')).toHaveText(metric==='tb'?'Karlskrona leder med 50 kr TB!':metric==='count'?'Karlskrona leder med 1 registrering!':'Karlskrona leder med 2 poäng!');await expect(page.locator('.arena-war-station')).toHaveText(['T','K']);await expect(page.locator('.arena-war-scope')).toContainText('ALLA KATEGORIER');
});
test('War Fight: daily series distinguishes match points from today and shows tie and frozen server result',async({page})=>{
 await session(page);await page.clock.install({time:now});let current:ArenaFightSummary={...active(),scoring_mode:'daily',standings:fight.standings.map(s=>({...s,match_points:3}))};await mock(page,()=>current);await page.goto('/arena');await expect(page.locator('.arena-war-metric')).toHaveText('MATCHPOÄNG');await expect(page.locator('.arena-war-lead')).toHaveText('DET ÄR LIKA!');await expect(page.locator('.arena-war-scoreboard')).toContainText('3 mp');
 current={...current,phase:'finished',winner_ids:['k'],version:2};await page.clock.runFor(5100);await expect(page.locator('.arena-war-lead')).toHaveText('Karlskrona vann');await expect(page.locator('.arena-war-live')).toHaveText('FINAL');await expect(page.locator('.arena-war-clock')).toContainText('FRYST SLUTRESULTAT');await expect(page.locator('.arena-war-clock')).toHaveClass(/urgency-calm/);
});
test('War Fight: isolated local second tick, no per-second requests, zero awaits server and hidden tab pauses',async({page})=>{
 await session(page);await page.clock.install({time:now});let current=active(2),calls=0;await mock(page,()=>current);await page.route('**/api/arena/stats*',r=>{calls++;return r.fulfill({json:{...initial,fight:current}})});await page.goto('/arena');await expect(page.locator('.arena-war-clock')).toBeVisible();
 await page.evaluate(()=>{(window as any).stageMutations=0;new MutationObserver(ms=>(window as any).stageMutations+=ms.length).observe(document.querySelector('.arena-stage')!,{subtree:true,childList:true,attributes:true,characterData:true});});const n=calls,first=await page.getByRole('timer').innerText();await page.clock.runFor(2100);expect(await page.getByRole('timer').innerText()).not.toBe(first);expect(calls).toBe(n);expect(await page.evaluate(()=>(window as any).stageMutations)).toBe(0);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('.is-clock-hidden')).toBeAttached();const hidden=await page.getByRole('timer').innerText();await page.clock.runFor(60000);expect(calls).toBe(n);expect(await page.getByRole('timer').innerText()).toBe(hidden);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(()=>calls).toBeGreaterThan(n);
 await page.clock.runFor(60000);await expect(page.locator('.arena-war-clock')).toContainText('INVÄNTAR SLUTRESULTAT');await expect(page.getByRole('timer')).toHaveText('00:00:00');await expect(page.locator('.arena-war-clock')).toHaveClass(/urgency-calm/);await expect(page.locator('.arena-war-lead')).not.toContainText('vann');
});
test('War Fight: reduced motion stops perimeter pulse and keeps countdown readable',async({page})=>{
 await session(page);await page.emulateMedia({reducedMotion:'reduce'});await page.clock.install({time:now});await mock(page,()=>active(4));await page.goto('/arena');await expect(page.locator('.arena-war-clock.urgency-final')).toBeVisible();await expect(page.locator('.arena-fight-perimeter')).toHaveCSS('animation-name','none');await expect(page.getByRole('timer')).toHaveText(/00:03:\d\d|00:04:00/);
});
