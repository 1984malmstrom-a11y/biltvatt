import {test,expect,type Page} from './arena-entry-fixture';
import {mkdirSync} from 'node:fs';
import {boot,initial,now} from './arena-release-fixture';
const dir=process.env.ARENA_HERO_REVIEW_DIR;
const sizes=[[1920,1080],[1536,864],[1448,1086],[1024,768],[390,844],[844,390]];
async function setup(page:Page,kind:'leader'|'station-goal',viewport:{width:number;height:number}){
 await page.setViewportSize(viewport);await page.clock.setFixedTime(now);
 await page.route('**/api/arena/bootstrap',r=>r.fulfill({json:boot}));
 await page.route('**/api/arena/stats*',r=>r.fulfill({json:initial}));
 await page.route('**/api/arena/registrations',r=>r.fulfill({json:{registration:{id:r.request().postDataJSON().request_id,points_awarded:2,tb_ore_awarded:3500,registered_at:now.toISOString(),voided_at:null},achievements:[kind==='leader'?{kind,level:3,special:true,text:'Ny etta!',previousLeader:'Alva'}:{kind,level:3,special:true,text:'Lagets mål uppnått!',goal:{...initial.station_goals[0],points:1000}}]}}));
 await page.goto('/arena?showcase=1');await expect(page.locator('.arena-stage .arena-orb')).toHaveCount(7);
 await page.getByRole('button',{name:'Biltvätt, +2 poäng',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Peter',exact:true}).click();
 await expect(page.locator('.is-champion-scene h2')).toHaveText(kind==='leader'?'NY ETTA!':'MÅL UPPNÅTT!');
 await expect.poll(()=>page.locator('.is-champion-scene').evaluate(e=>Number(getComputedStyle(e).opacity))).toBe(1);
 await expect.poll(()=>page.locator('.is-champion-scene .arena-champion-art').evaluate(e=>Number(getComputedStyle(e).opacity))).toBe(1);
 await page.locator('.is-champion-scene img').evaluate(async(e:HTMLImageElement)=>e.decode());
}
for(const kind of ['leader','station-goal'] as const)for(const[width,height]of sizes)test(`Champion correction: ${kind} opaque scene, separated text and immediate next sale ${width}x${height}`,async({page})=>{
 await setup(page,kind,{width,height});const scene=page.locator('.is-champion-scene');
 await expect(scene).toContainText(kind==='leader'?'Peter går om Alva':'Hela laget nådde målet!');await expect(scene).toContainText('+2 POÄNG!');await expect(scene).toContainText('Biltvätt');
 await expect(scene.locator('[data-champion-kind]')).toHaveAttribute('data-champion-kind','fictional-celebration-art');await expect(scene.locator('[data-avatar-kind]')).toHaveCount(0);
 expect(await scene.locator('img').evaluate(e=>getComputedStyle(e).maskImage)).toBe('none');
 const geometry=await scene.evaluate(e=>{
  const rect=(x:Element)=>x.getBoundingClientRect().toJSON();
  return {viewport:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],hero:rect(e.querySelector('.arena-victory-hero')!),copy:rect(e.querySelector('.arena-victory-copy')!),art:rect(e.querySelector('.arena-victory-art')!),nav:rect(document.querySelector('.arena-nav')!),stats:rect(document.querySelector('.arena-stats-bar')!),text:[...e.querySelectorAll('.arena-victory-copy>*')].map(rect)};
 });
 expect(geometry.viewport).toEqual([width,height]);expect(geometry.hero.y).toBeGreaterThanOrEqual(0);expect(geometry.hero.bottom).toBeLessThanOrEqual(Math.min(geometry.nav.y,geometry.stats.y));
 for(const r of geometry.text){expect(r.x).toBeGreaterThanOrEqual(geometry.hero.x);expect(r.right).toBeLessThanOrEqual(geometry.hero.right+1);expect(r.y).toBeGreaterThanOrEqual(geometry.hero.y);expect(r.bottom).toBeLessThanOrEqual(geometry.hero.bottom);}
 const ordered=geometry.text.toSorted((a,b)=>a.y-b.y);for(let i=1;i<ordered.length;i++)expect(ordered[i].y).toBeGreaterThanOrEqual(ordered[i-1].bottom-1);
 if(kind==='station-goal')await expect(scene.locator('.arena-reward-goal')).toContainText('1 000 / 1 000 poäng');
 if(dir){mkdirSync(dir,{recursive:true});await page.screenshot({path:`${dir}/${kind==='leader'?'ny-etta':'goal-hero'}-${width}x${height}.png`});}
 await page.getByRole('button',{name:'Korv med mos, +1 poäng',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(scene).toHaveCount(0);
});
for(const kind of ['leader','station-goal'] as const)test(`Champion correction: ${kind} reduced motion and automatic dismissal`,async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await setup(page,kind,{width:390,height:844});
 expect(await page.locator('.is-champion-scene').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
 expect(await page.locator('.arena-champion-art').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
 await expect(page.locator('.is-champion-scene')).toHaveCount(0,{timeout:5000});
});
