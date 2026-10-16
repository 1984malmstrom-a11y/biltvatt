import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {v2Scene} from './arena-contest-v2-fixture';
import {now} from './arena-release-fixture';

const review=process.env.ARENA_BATTLE_REVIEW==='1';
const root='/workspace/work/artifacts/arena-battle-visual-v2';
async function scene(page:Page,{count=7,minutes=120,leading=false,station=false}:{count?:number;minutes?:number;leading?:boolean;station?:boolean}={}) {
 const data=v2Scene(count,true,minutes),fight=data.stats.fight!;
 const own=fight.standings.find(s=>s.id==='review')!,other=fight.standings.find(s=>s.id!=='review')!;
 if(!leading){other.points=own.points;other.points_milli=own.points_milli;other.rank=1;fight.leader_ids=['review','k'];}
 data.stats.fight_objective!.scope=count===7?'all':count===1?'focus':'activity';
 await page.addInitScript(station=>{sessionStorage.setItem('arena:intro-seen:v1','1');if(station)localStorage.setItem('arena:battle-mode:review:v2-demo-match','station');},station);
 await page.clock.install({time:now});
 await page.route('**/api/**',r=>{
  const path=new URL(r.request().url()).pathname;
  return r.fulfill({json:path==='/api/arena/bootstrap'?data.boot:path==='/api/arena/stats'?data.stats:path.endsWith('/registrations')?{registration:{id:'synthetic-sale',points_awarded:8,registered_at:now.toISOString(),voided_at:null},achievements:[]}:{ok:true}});
 });
 await page.goto('/arena');
 await expect(page.locator('.arena-orb')).toHaveCount(7);
 await expect(page.locator('.arena-intro')).toHaveCount(0);
 await page.clock.runFor(1800);
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(im=>im.decode().catch(()=>{})));});
}
async function snap(page:Page,name:string,selector?:string) {
 if(!review)return;
 await mkdir(root,{recursive:true});
 await page.evaluate(()=>{
  if(document.getElementById('review-synthetic'))return;
  const el=document.createElement('div');el.id='review-synthetic';el.textContent='TESTFÖRHANDSVISNING · SYNTETISKA DEMODATA';el.style.cssText='position:fixed;bottom:3px;right:5px;z-index:1000;background:#031c16f0;color:#f0d691;border:1px solid #ad955d;padding:3px 6px;font:9px Arial;pointer-events:none';document.body.append(el);
 });
 if(selector)await page.locator(selector).screenshot({path:`${root}/${name}.png`,animations:'disabled'});
 else await page.screenshot({path:`${root}/${name}.png`,fullPage:false,animations:'disabled'});
}
async function fit(page:Page,w:number,h:number) {
 const size=await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight}));expect(size.w).toBeLessThanOrEqual(w);expect(size.h).toBeLessThanOrEqual(h);
 const panel=page.locator('.arena-war-fight');
 const bounds=await panel.evaluate(e=>({sw:e.scrollWidth,cw:e.clientWidth,sh:e.scrollHeight,ch:e.clientHeight,children:[...e.children].map(c=>({cls:c.className,h:c.getBoundingClientRect().height}))}));expect(bounds.sw,JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.cw+1);expect(bounds.sh,JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.ch+1);
 for(const selector of ['.arena-war-header','.arena-war-scoreboard','.arena-war-clock','.arena-war-scope','.arena-war-lead']){
  const b=await panel.boundingBox(),c=await panel.locator(selector).boundingBox();expect(c!.x).toBeGreaterThanOrEqual(b!.x);expect(c!.x+c!.width).toBeLessThanOrEqual(b!.x+b!.width+1);expect(c!.y+c!.height).toBeLessThanOrEqual(b!.y+b!.height+1);
 }
 const widths=await page.locator('.arena-mode-switch button').evaluateAll(es=>es.map(e=>({s:e.scrollWidth,c:e.clientWidth})));for(const e of widths)expect(e.s).toBeLessThanOrEqual(e.c+1);
 const sw=await page.locator('.arena-mode-switch').boundingBox();
 const decorations=await page.locator('.arena-crown,.arena-focus-arc text').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};}));
 for(const b of decorations)expect(sw!.x+sw!.width<=b.x+1||sw!.y+sw!.height<=b.y+1||sw!.x>=b.x+b.width-1||sw!.y>=b.y+b.height-1).toBe(true);
 // Circular hit areas can have overlapping bounding-box corners without occlusion.
 for(const b of await page.locator('.arena-orb').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};}))){const cx=b.x+b.width/2,cy=b.y+b.height/2,dx=cx-Math.max(sw!.x,Math.min(cx,sw!.x+sw!.width)),dy=cy-Math.max(sw!.y,Math.min(cy,sw!.y+sw!.height));expect(Math.hypot(dx,dy)).toBeGreaterThanOrEqual(b.width/2-1);}

}
for(const [w,h] of [[1920,1080],[1536,864],[1448,1086],[1024,768],[390,844],[844,390]])test(`Battle neutral, geometry and responsive ${w}x${h}`,async({page})=>{
 await page.setViewportSize({width:w,height:h});await scene(page);
 const nav=page.getByRole('navigation',{name:'Visningsläge'});await expect(nav.getByRole('button')).toHaveCount(2);await expect(nav.getByRole('link')).toHaveCount(0);
 await expect(page.locator('.arena-war-fight')).toHaveClass(/is-tied/);await expect(page.locator('.arena-war-clock')).toHaveClass(/urgency-calm/);
 const geometry=()=>page.locator('.arena-orb').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height};}));const before=await geometry();
 await nav.getByRole('button',{name:'STATIONSLÄGE',exact:true}).click();await expect(page.locator('.arena-battle-swords')).toHaveCount(0);expect(await geometry()).toEqual(before);
 if(w===1920||w===390)await snap(page,`station-${w}x${h}`);
 await nav.getByRole('button',{name:'BATTLE MODE',exact:true}).click();await page.clock.runFor(1800);expect(await geometry()).toEqual(before);
 await expect(page.locator('.arena-battle-swords')).toHaveCSS('opacity','0.76');await expect(page.locator('.arena-battle-swords')).toHaveAttribute('aria-hidden','true');
 await expect(page.locator('.is-battle .is-fight-objective')).toHaveCount(7);await fit(page,w,h);await snap(page,`battle-neutral-${w}x${h}`);
 if(w===1920)await snap(page,'mode-switch-desktop','.arena-mode-switch');
});
test('Own lead is based on actual standings and retains a quiet green highlight',async({page})=>{
 await page.setViewportSize({width:1920,height:1080});await scene(page,{leading:true});await expect(page.locator('.arena-war-fight')).toHaveClass(/is-own-leading/);await expect(page.locator('.arena-war-lead')).toContainText('Demostation Nord leder');await snap(page,'battle-leading-1920x1080');
});
for(const [minutes,urgency] of [[60,'hour'],[15,'quarter'],[5,'final']] as const)test(`Progressive urgency ${minutes} minutes`,async({page})=>{
 await page.setViewportSize({width:1920,height:1080});await scene(page,{minutes,leading:true});await expect(page.locator('.arena-war-clock')).toHaveClass(new RegExp(`urgency-${urgency}`));await expect(page.locator('.arena-fight-perimeter')).toHaveCSS('animation-name','arena-war-breathe');await snap(page,`battle-urgency-${minutes}m-1920x1080`);
 if(minutes===5){await page.setViewportSize({width:390,height:844});await fit(page,390,844);await snap(page,'battle-urgency-5m-390x844');}
});
for(const [count,label] of [[3,'selected'],[1,'focus']] as const)test(`Frozen ${label} categories alone remain highlighted`,async({page})=>{
 for(const [w,h] of [[1920,1080],[390,844]]){
  await page.setViewportSize({width:w,height:h});await scene(page,{count});await expect(page.locator('.arena-orb:disabled')).toHaveCount(7-count);await expect(page.locator('.arena-orb:not(:disabled).is-fight-objective')).toHaveCount(count);await expect(page.locator('.arena-war-scope')).toContainText(count===1?'MÅNADENS FOKUS':'Biltvätt');await fit(page,w,h);await snap(page,`battle-${label}-${w}x${h}`);
 }
});
test('Reduced motion disables pulse, manual choice persists through sale and refresh',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await scene(page,{minutes:4});await expect(page.locator('.arena-fight-perimeter')).toHaveCSS('animation-name','none');expect(await page.locator('.arena-orb-focus').evaluate(e=>getComputedStyle(e,'::after').animationName)).toBe('none');
 await page.locator('.arena-orb-focus').click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'Peter',exact:true}).click();await expect(page.locator('.arena-celebration')).toBeVisible();await page.clock.runFor(15000);await expect(page.locator('.is-battle')).toBeVisible();await expect(page.locator('.arena-battle-intro')).toHaveCount(0);
 await page.getByRole('button',{name:'STATIONSLÄGE',exact:true}).click();await page.reload();await expect(page.locator('.arena-orb')).toHaveCount(7);await expect(page.locator('.is-battle')).toHaveCount(0);await expect(page.getByRole('button',{name:'STATIONSLÄGE',exact:true})).toHaveAttribute('aria-pressed','true');
});
