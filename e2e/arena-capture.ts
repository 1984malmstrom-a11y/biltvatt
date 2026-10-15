import type {Page} from '@playwright/test';
// Freeze only completed reveal poses. Cancelling the committed animation also
// flushes Chromium's compositor when Playwright's virtual clock is paused.
// Lifetime/fade timers and the actual runtime UI are never changed.
export async function finishChampionCapture(page:Page){
 await page.evaluate(()=>document.querySelectorAll('.celebration-leader *').forEach(el=>el.getAnimations().forEach(a=>{
  if(a instanceof CSSAnimation&&a.animationName.startsWith('arena-champion-')){a.finish();a.commitStyles();a.cancel();}
 })));
}
