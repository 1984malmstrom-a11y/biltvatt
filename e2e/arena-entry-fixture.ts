import {test as base,expect} from '@playwright/test';
// Flow regressions exercise an established session. First entry/replay/error
// behaviour is tested separately in arena-splash-war-fight.spec.ts.
export const test=base.extend({page:async({page},use)=>{
 await page.addInitScript(()=>{sessionStorage.setItem('arena:intro-seen:v1','1');});
 await use(page);
}});
export {expect};
export type {Page} from '@playwright/test';
