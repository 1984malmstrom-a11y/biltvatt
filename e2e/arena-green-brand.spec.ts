import {test,expect,type Page} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {boot,initial,now,fight} from './arena-release-fixture';
import {expectSellerPortraits} from './arena-portrait-assertions';
import type {ArenaFightSummary} from '../shared/arena-fights';
import type {ArenaStats} from '../shared/arena';
const dir=process.env.ARENA_GREEN_SCREENSHOT_DIR;
async function capture(page:Page,name:string){
 if(!dir)return;
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));document.querySelectorAll('.arena-state-content').forEach(el=>el.getAnimations().forEach(a=>{a.currentTime=400;a.pause();}));document.querySelectorAll('.arena-celebration').forEach(el=>el.getAnimations({subtree:true}).forEach(a=>{a.currentTime=350;a.pause();}));});
 await page.mouse.move(0,0);await page.screenshot({path:`${dir}/${name}.png`});
}
async function setup(page:Page,get:()=>ArenaStats){await page.clock.install({time:now});await page.route('**/api/arena/bootstrap',r=>r.fulfill({json:boot}));await page.route('**/api/arena/stats*',r=>r.fulfill({json:get()}));await page.goto('/arena?showcase=0');await expect(page.locator('.arena-stage .arena-orb')).toHaveCount(7);await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));await page.clock.runFor(400);}
async function overflow(page:Page,width:number,height:number){expect(await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}))).toEqual({width,height});}
for(const [width,height]of [[1920,1080],[1536,864],[1448,1086],[1024,768],[390,844],[844,390]]){
 test(`Green brand: Stationspuls, all seven touch targets and no clipped UI ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height});await setup(page,()=>initial);await expect(page.locator('.arena-state-panel')).toHaveAttribute('data-mode','pulse');await expect(page.locator('.arena-pulse-primary')).toContainText('42');await expect(page.locator('.arena-pulse-pair')).toContainText('7');await overflow(page,width,height);
  const theme=await page.locator('.arena-shell').evaluate(el=>({bg:getComputedStyle(el).getPropertyValue('--arena-bg').trim(),before:getComputedStyle(el,'::before').backgroundImage}));expect(theme.bg.toLowerCase()).toBe('#06110d');expect(theme.before).not.toContain('station-night');
  if(width>=951){await expect(page.locator('.arena-leaderboard li')).toHaveCount(5);await expect(page.locator('.arena-recent li')).toHaveCount(5);const r=await page.evaluate(()=>({l:document.querySelector('.arena-left-column')!.getBoundingClientRect().toJSON(),s:document.querySelector('.arena-stats-bar')!.getBoundingClientRect().toJSON(),n:document.querySelector('.arena-nav')!.getBoundingClientRect().toJSON()}));expect(r.s.x).toBeGreaterThan(r.l.right);expect(r.n.y-r.l.bottom).toBeLessThan(12);}
  await capture(page,`normal-${width}x${height}`);
  if(width===1920&&dir)await page.locator('.arena-stage').screenshot({path:`${dir}/center-normal-1920x1080.png`});
  for(const button of await page.locator('.arena-stage .arena-orb').all()){
   const rect=await button.boundingBox();expect(rect!.width).toBeGreaterThanOrEqual(44);expect(rect!.height).toBeGreaterThanOrEqual(44);expect(rect!.x).toBeGreaterThanOrEqual(0);expect(rect!.x+rect!.width).toBeLessThanOrEqual(width);expect(rect!.y).toBeGreaterThanOrEqual(0);expect(rect!.y+rect!.height).toBeLessThanOrEqual(height);
   await expect(button.locator('img')).toHaveCSS('object-fit','contain');await button.click();await expect(page.getByRole('dialog')).toBeVisible();await expectSellerPortraits(page.locator('.arena-sellers button'));await page.getByRole('dialog').getByRole('button',{name:'Stäng',exact:true}).click();
  }
  await expect(page.locator('.arena-orb-focus')).not.toContainText('Finast Plus');
 });
 test(`Green brand: live fight card and responsive layout ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height});await setup(page,()=>({...initial,fight}));await expect(page.locator('.arena-state-panel')).toHaveAttribute('data-mode','fight');await expect(page.locator('.arena-fight-widget')).toContainText('Karlskrona leder');await overflow(page,width,height);await capture(page,`fight-${width}x${height}`);if(width===1920&&dir)await page.locator('.arena-stage').screenshot({path:`${dir}/center-fight-1920x1080.png`});
  const stage=await page.locator('.arena-stage').innerHTML();await page.clock.runFor(1000);expect(await page.locator('.arena-stage').innerHTML()).toBe(stage);
 });
}
test('Green brand: exact TB, urgency, perimeter motion, lead surge, final and return to pulse',async({page})=>{
 await page.setViewportSize({width:1920,height:1080});let current:ArenaFightSummary={...structuredClone(fight),metric:'tb',end_at:new Date(now.getTime()+14*60000).toISOString(),standings:fight.standings.map(s=>({...s,tb_ore:s.id==='review'?119999:120000}))};let calls=0;
 await page.route('**/api/arena/stats*',r=>{calls++;return r.fulfill({json:{...initial,fight:current}});});
 // setup's stats handler is overridden below (last matching route wins).
 await setup(page,()=>({...initial,fight:current}));await page.unroute('**/api/arena/stats*');await page.route('**/api/arena/stats*',r=>{calls++;return r.fulfill({json:{...initial,fight:current}});});
 const widget=page.locator('.arena-fight-widget');await expect(widget).toContainText('0,01 kr TB skiljer');await expect(widget.locator('.arena-fight-sprint')).toContainText('SLUTSPURT');await capture(page,'fight-under-15-minutes');
 const before=calls;const time=await widget.getByRole('timer').textContent();await page.clock.runFor(1000);expect(await widget.getByRole('timer').textContent()).not.toBe(time);expect(calls).toBe(before);const requestsDuringOneSecond=calls-before;
 const motion=[];for(const at of [1000,4000]){motion.push(await widget.locator('.arena-fight-perimeter').evaluate((el,at)=>{const animation=el.getAnimations({subtree:true}).find(a=>(a as CSSAnimation).animationName==='arena-fight-orbit');if(animation){animation.currentTime=at;animation.pause();}return{at,animation:animation?(animation as CSSAnimation).animationName:null,transform:getComputedStyle(el,'::before').transform};},at));await capture(page,`fight-border-position-${at}`);}
 expect(motion[0].animation).toBe('arena-fight-orbit');expect(motion[0].transform).not.toBe(motion[1].transform);
 current={...current,version:2,end_at:new Date(now.getTime()+4*60000).toISOString(),leader_ids:['review'],standings:[{...current.standings[1],rank:1,tb_ore:120001},{...current.standings[0],rank:2}]};await page.clock.runFor(5000);await expect(widget).toHaveClass(/is-surging/);await expect(widget).toContainText('Tingsryd leder');await expect(widget.locator('.urgency-final')).toBeVisible();await capture(page,'fight-lead-change');await expect(page.locator('.fight-celebration-lead')).toBeVisible();await page.clock.runFor(4000);await expect(widget).not.toHaveClass(/is-surging/);await expect(page.locator('.fight-celebration-lead')).toHaveCount(0);await capture(page,'fight-leader');await capture(page,'fight-under-5-minutes');
 current={...current,version:3,leader_ids:['review','k'],standings:current.standings.map(s=>({...s,rank:1,tb_ore:120001}))};await page.clock.runFor(5000);await expect(widget).toHaveClass(/is-tied/);await capture(page,'fight-tie');
 await page.emulateMedia({reducedMotion:'reduce'});expect(await widget.locator('.arena-fight-perimeter').evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('none');expect(await widget.evaluate(el=>getComputedStyle(el,'::after').animationName)).toBe('none');await capture(page,'fight-reduced-motion');await page.emulateMedia({reducedMotion:'no-preference'});
 current={...current,phase:'finished',version:4,winner_ids:['review','k']};await page.clock.runFor(5000);await expect(widget).toHaveAttribute('data-fight-phase','finished');await page.clock.runFor(350);await capture(page,'fight-final-tie');await page.clock.runFor(4500);await expect(page.locator('.arena-state-panel')).toHaveAttribute('data-mode','pulse');
 current={...current,id:'winner-green',version:5,winner_ids:['review'],leader_ids:['review'],standings:current.standings.map((s,i)=>({...s,rank:i+1,tb_ore:i?120000:120001}))};await page.clock.runFor(12000);await expect(page.locator('.fight-celebration-final h2')).toContainText('VINNER!');await page.clock.runFor(350);await capture(page,'fight-winner');
 if(dir)writeFileSync(`${dir}/motion-verification.json`,JSON.stringify({frames:motion,localSecondTimer:true,requestsDuringOneSecond,reducedMotion:'animation:none on perimeter and pulse'},null,2));
});
test('Green brand: sale hierarchy, portraits, Min Arena and full leaderboard',async({page})=>{
 await page.setViewportSize({width:1920,height:1080});await setup(page,()=>initial);let achievements:unknown[]=[];
 await page.route('**/api/arena/registrations',r=>r.fulfill({json:{registration:{id:r.request().postDataJSON().request_id,registered_at:now.toISOString(),points_awarded:2,tb_ore_awarded:3500,voided_at:null},achievements}}));
 await page.getByRole('button',{name:'Peter 34 p',exact:true}).click();await expect(page.locator('.arena-person-avatar')).toHaveAttribute('data-avatar-kind','demo');await capture(page,'min-arena');await page.getByRole('dialog').getByRole('button',{name:'Stäng',exact:true}).click();await page.getByRole('button',{name:'Visa alla',exact:true}).click();await capture(page,'full-leaderboard');await page.getByRole('dialog').getByRole('button',{name:'Stäng',exact:true}).click();
 for(const kind of ['standard','leader','goal']){
  achievements=kind==='leader'?[{kind:'leader',level:3,special:true,text:'Ny etta!',scope:'Idag',previousLeader:'Alva'}]:kind==='goal'?[{kind:'station-goal',level:3,special:true,text:'Målet uppnått!',scope:'Lagets mål',goal:{...initial.station_goals[0],points:1000}}]:[];
  await page.getByRole('button',{name:'Biltvätt, +2 poäng',exact:true}).click();await expectSellerPortraits(page.locator('.arena-sellers button'));if(kind==='standard')await capture(page,'seller-selector');await page.getByRole('dialog').getByRole('button',{name:'Peter',exact:true}).click();await page.clock.runFor(350);await capture(page,kind==='standard'?'standard-sale':kind==='leader'?'new-leader':'goal-hero');
  // The celebration never intercepts the next activity, even before it expires.
  await page.getByRole('button',{name:'Korv med mos, +1 poäng',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'Stäng',exact:true}).click();await page.clock.runFor(4000);
 }
});
