import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {boot,initial,now,fight} from './arena-release-fixture';
const dir=process.env.ARENA_COMPACT_HEADER_REVIEW_DIR;
for(const[width,height]of[[1920,1080],[1536,864],[1448,1086],[1024,768],[390,844],[844,390],[951,768],[1100,768],[1200,768]])test(`Compact headers: readable titles, separate actions and five rows ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});await page.emulateMedia({reducedMotion:'reduce'});await page.clock.setFixedTime(now);await page.route('**/api/arena/bootstrap',r=>r.fulfill({json:boot}));await page.route('**/api/arena/stats*',r=>r.fulfill({json:initial}));await page.goto('/arena?showcase=1');await expect(page.locator('.arena-stage .arena-orb')).toHaveCount(7);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
 expect(await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}))).toEqual({width,height});
 if(width>=951){
  await expect(page.locator('.arena-leaderboard li')).toHaveCount(5);await expect(page.locator('.arena-recent-list li')).toHaveCount(5);
  const headers=await page.locator('.arena-left-column :is(.arena-leaderboard,.arena-recent)>header').evaluateAll(es=>es.map(e=>{const p=e.getBoundingClientRect(),title=e.querySelector('h2')!,action=e.querySelector('.arena-panel-more,.arena-live')!,range=document.createRange();range.selectNodeContents(title);const a=action.getBoundingClientRect(),t=title.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(action);return {title:title.textContent,lines:range.getClientRects().length,actionLines:action.classList.contains('arena-panel-more')?r.getClientRects().length:1,font:parseFloat(getComputedStyle(title).fontSize),inside:t.left>=p.left&&t.right<=a.left-2&&a.right<=p.right&&t.top>=p.top&&t.bottom<=p.bottom};}));
  for(const h of headers){expect(h.lines,h.title??'').toBe(1);expect(h.actionLines).toBe(1);expect(h.inside,h.title??'').toBe(true);expect(h.font).toBeGreaterThanOrEqual(13);}
  const fit=await page.locator('.arena-left-column :is(.arena-leader-list,.arena-recent-list)').evaluateAll(es=>es.every(e=>{const p=e.getBoundingClientRect();return e.scrollHeight<=e.clientHeight+1&&[...e.children].every(c=>{const r=c.getBoundingClientRect();return r.top>=p.top-1&&r.bottom<=p.bottom+1;});}));expect(fit).toBe(true);
 }
 if(dir&&[1920,1536,1024,390].includes(width)){mkdirSync(dir,{recursive:true});await page.screenshot({path:`${dir}/normal-${width}x${height}.png`});if(width===1024){await page.locator('.arena-leaderboard').screenshot({path:`${dir}/leaderboard-1024x768-close.png`});await page.locator('.arena-recent').screenshot({path:`${dir}/recent-activities-1024x768-close.png`});}}
});
test('Compact headers: live fight keeps separate header action and status',async({page})=>{
 await page.setViewportSize({width:1024,height:768});await page.clock.setFixedTime(now);await page.route('**/api/arena/bootstrap',r=>r.fulfill({json:boot}));await page.route('**/api/arena/stats*',r=>r.fulfill({json:{...initial,fight,fight_dashboard:{fight_id:fight.id,station_ids:['review','k'],metric:'points',leaderboard:initial.leaderboard.slice(0,5),recent:initial.recent}}}));await page.goto('/arena?showcase=1');await expect(page.locator('.arena-left-column')).toHaveAttribute('data-context','fight');
 for(const name of ['.arena-leaderboard','.arena-recent']){const header=page.locator(name+'>header');const t=(await header.locator('h2').boundingBox())!,a=(await header.locator('.arena-panel-more,.arena-live').boundingBox())!;expect(t.x+t.width).toBeLessThanOrEqual(a.x-2);}
});
