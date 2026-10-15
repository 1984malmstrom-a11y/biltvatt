import {test,expect,type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {boot,initial,now,fight} from './arena-release-fixture';
import {fightDashboardFixture as context} from './arena-fight-context-fixture';
import type {ArenaStats,ArenaFightActivity} from '../shared/arena';
const dir=process.env.ARENA_OBJECTIVE_REVIEW_DIR;
const sizes=[[1920,1080],[1536,864],[1448,1086],[1024,768],[390,844],[844,390]];
const temp:ArenaFightActivity={...boot.activities[3],id:'temp:review-objective',name:'Fight-fika',image_key:'review-fika',fight_id:fight.id,start_at:fight.start_at,end_at:fight.end_at,points:3,tb_ore:800};
const active=(ids:string[]|null,scope:NonNullable<ArenaStats['fight_objective']>['scope']='activity'):ArenaStats=>({...structuredClone(initial),fight:structuredClone(fight),fight_dashboard:context,fight_objective:{fight_id:fight.id,scope,activity_ids:ids}});
async function setup(page:Page,get:()=>ArenaStats){
 await page.clock.install({time:now});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/arena/bootstrap',r=>r.fulfill({json:boot}));await page.route('**/api/arena/stats*',r=>r.fulfill({json:get()}));
 await page.route('**/api/arena/activity-images/review-fika',r=>r.fulfill({path:'public/arena-products/04_arena-kaffe-bulle.webp',contentType:'image/webp'}));
 await page.goto('/arena?showcase=1');await expect(page.locator('.arena-stage .arena-orb')).toHaveCount(7);await page.evaluate(()=>document.fonts.ready);await expect(page.locator('.arena-state-panel')).toHaveAttribute('data-mode',get().fight?.phase==='active'?'fight':'pulse');await expect(page.locator('.arena-leaderboard li')).toHaveCount(5);await page.clock.runFor(100);
}
async function capture(page:Page,name:string){if(!dir)return;mkdirSync(dir,{recursive:true});await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});await page.screenshot({path:`${dir}/${name}.png`,animations:'disabled'});}
async function overflow(page:Page,width:number,height:number){
 expect(await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight])).toEqual([width,height]);
 const fit=await page.locator('.arena-state-panel .arena-pulse-card,.arena-state-panel .arena-fight-widget,.arena-temp-ring').evaluateAll(es=>es.map(e=>{const p=e.getBoundingClientRect();return {name:e.className,fit:e.scrollHeight<=e.clientHeight+2&&e.scrollWidth<=e.clientWidth+2&&[...e.querySelectorAll('h2,strong,small,.arena-temp-identity,.arena-fight-clock,.arena-fight-widget-gap')].every(x=>{const r=x.getBoundingClientRect();return !r.width||!r.height||r.left>=p.left-1&&r.right<=p.right+1&&r.top>=p.top-1&&r.bottom<=p.bottom+1;})};}));for(const r of fit)expect(r.fit,r.name).toBe(true);
}
const cluster=(page:Page)=>page.locator('.arena-stage .arena-orb').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
for(const[width,height]of sizes)test(`Fight objectives: compact pulse and unchanged stage ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});await setup(page,()=>initial);await expect(page.locator('.arena-state-panel')).toHaveAttribute('data-mode','pulse');await expect(page.locator('.is-fight-objective,.arena-temp-ring')).toHaveCount(0);await overflow(page,width,height);
 if(width>=951){const panel=(await page.locator('.arena-state-panel').boundingBox())!,main=(await page.locator('.arena-main').boundingBox())!;expect(panel.height/main.height).toBeCloseTo(.52,2);}
 await capture(page,`compact-stationspuls-${width}x${height}`);
});
for(const [name,scope,ids,count]of[['all-categories','all',boot.activities.map(a=>a.id),7],['single-category','activity',['a-3'],1],['monthly-focus','focus',['a-0'],1],['canonical-category','category',['a-2','a-6'],2]] as const)test(`Fight objectives: frozen ${scope} authority only`,async({page})=>{
 await page.setViewportSize({width:1920,height:1080});await setup(page,()=>active([...ids],scope));await expect(page.locator('.arena-stage .is-fight-objective')).toHaveCount(count);if(scope==='focus')await expect(page.locator('.arena-orb-focus')).toHaveClass(/is-fight-objective/);await expect(page.locator('.arena-temp-ring')).toHaveCount(0);await capture(page,`fight-${name}-1920x1080`);
});
for(const[width,height]of sizes)test(`Fight objectives: temporary ring outside orbit and seller flow ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});let current=active([]);await setup(page,()=>current);const before=await cluster(page);current={...current,fight_activities:[temp]};await page.clock.runFor(5200);await expect(page.locator('.arena-temp-ring')).toBeVisible();await expect(page.locator('.arena-stage .arena-orb')).toHaveCount(7);await expect(page.locator('.arena-stage .is-fight-objective')).toHaveCount(0);expect(await cluster(page)).toEqual(before);await overflow(page,width,height);await capture(page,`fight-temp-ring-${width}x${height}`);
 await page.getByRole('button',{name:/Registrera fight-aktivitet:/}).click();await expect(page.getByRole('dialog')).toContainText('Vem gjorde försäljningen?');await expect(page.getByRole('dialog')).toContainText('Fight-fika');if(width===1920)await capture(page,'temp-ring-seller-selector');
 let saves=0;await page.route('**/api/arena/registrations',r=>{saves++;expect(r.request().postDataJSON()).toMatchObject({activity_id:temp.id,seller_id:'s-0'});return r.fulfill({json:{registration:{id:'objective-sale',activity_id:temp.id,seller_id:'s-0',points_awarded:3,tb_ore_awarded:800,registered_at:now.toISOString(),voided_at:null}}});});
 await page.getByRole('dialog').getByRole('button',{name:'Peter',exact:true}).click();await expect(page.locator('.arena-quick-receipt')).toContainText('FÖRSÄLJNINGEN REGISTRERAD');expect(saves).toBe(1);await page.route('**/api/arena/registrations/objective-sale/void',r=>r.fulfill({json:{ok:true}}));await page.getByRole('button',{name:'Ångra fight-försäljningen'}).click();await expect(page.locator('.arena-quick-receipt')).toHaveCount(0);
 current={...current,fight:{...fight,phase:'cancelled'}};await page.clock.runFor(5200);await expect(page.locator('.arena-state-panel')).toHaveAttribute('data-mode','pulse');await expect(page.locator('.arena-temp-ring,.is-fight-objective')).toHaveCount(0);await expect(page.locator('.arena-left-column')).toHaveAttribute('data-context','local');await overflow(page,width,height);if(width===1920)await capture(page,'restored-normal-state');
});
test('Fight objectives: live transitions remove frozen emphasis, reduced motion and missing authority fail closed',async({page})=>{
 let current=active(['a-0'],'focus');await setup(page,()=>current);await expect(page.locator('.is-fight-objective')).toHaveCount(1);expect(await page.locator('.is-fight-objective .arena-objective-edge').evaluate(e=>getComputedStyle(e).transitionDuration)).toBe('0s');current={...current,fight_objective:undefined};await page.clock.runFor(5200);await expect(page.locator('.is-fight-objective')).toHaveCount(0);
 for(const phase of ['scheduled','finished','cancelled'] as const){current={...active(['a-0'],'focus'),fight:{...fight,phase,winner_ids:[]}};await page.clock.runFor(12500);await expect(page.locator('.is-fight-objective,.arena-temp-ring')).toHaveCount(0);}
});
for(const [width,height]of sizes)for(const metric of ['points','tb','count'] as const)test(`Fight objectives: daily ${metric} temporary panel fits ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});const current={...active([]),fight:{...fight,metric,scoring_mode:'daily' as const},fight_activities:[{...temp,display_mode:metric==='tb'?'tb' as const:'points' as const}]};await setup(page,()=>current);await expect(page.locator('.arena-temp-ring')).toBeVisible();await overflow(page,width,height);
});
for(const [width,height]of sizes)test(`Fight objectives: qualifying badges stay clear at ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});let current=active(boot.activities.map(a=>a.id),'all');await setup(page,()=>current);await expect(page.locator('.is-fight-objective')).toHaveCount(7);const before=await cluster(page);await overflow(page,width,height);
 const fit=await page.locator('.arena-objective-badge').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect(),product=e.parentElement!.querySelector('.arena-product')!.getBoundingClientRect(),nav=document.querySelector('.arena-nav')!.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=product.bottom&&r.bottom<nav.top;}));expect(fit).toBe(true);
 current={...current,fight:{...fight,phase:'finished',winner_ids:[]}};await page.clock.runFor(10000);await expect(page.locator('.arena-state-panel')).toHaveAttribute('data-mode','pulse');await expect(page.locator('.is-fight-objective')).toHaveCount(0);expect(await cluster(page)).toEqual(before);
});
test('Fight objectives: lightweight entry with static reduced-motion alternative',async({page})=>{
 await page.setViewportSize({width:1920,height:1080});await setup(page,()=>({...active(['a-0'],'focus'),fight_activities:[temp]}));await expect(page.locator('.arena-temp-ring')).toBeVisible();await page.emulateMedia({reducedMotion:'no-preference'});
 expect(await page.locator('.arena-temp-ring').evaluate(e=>getComputedStyle(e).animationDuration)).toBe('0.3s');expect(await page.locator('.is-fight-objective .arena-objective-edge').evaluate(e=>getComputedStyle(e).transitionDuration)).toBe('0.3s');await page.emulateMedia({reducedMotion:'reduce'});
 expect(await page.locator('.arena-temp-ring').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');expect(await page.locator('.is-fight-objective .arena-objective-edge').evaluate(e=>getComputedStyle(e).transitionDuration)).toBe('0s');
});
