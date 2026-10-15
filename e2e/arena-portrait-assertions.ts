import {expect,type Locator} from '@playwright/test';
// Checking data-avatar-kind alone missed zero-sized sprite spans in production QA.
export async function expectSellerPortraits(sellers:Locator){
 const count=await sellers.count();expect(count).toBeGreaterThan(0);
 for(let index=0;index<count;index++){
  const button=sellers.nth(index),portrait=button.locator('[data-avatar-kind]');await expect(portrait).toHaveCount(1);
  const result=await portrait.evaluate(async(el)=>{
   const style=getComputedStyle(el),r=el.getBoundingClientRect(),button=el.closest('button')!,b=button.getBoundingClientRect();
   let visible=true;for(let node:Element|null=el;node;node=node.parentElement){const s=getComputedStyle(node);if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)<.9)visible=false;}
   const img=el.querySelector('img');let loaded=false,naturalWidth=0,naturalHeight=0;
   if(img){try{await img.decode();}catch{/* Report failure below. */}loaded=img.complete;naturalWidth=img.naturalWidth;naturalHeight=img.naturalHeight;const imageStyle=getComputedStyle(img),imageRect=img.getBoundingClientRect();if(imageStyle.display==='none'||imageStyle.visibility!=='visible'||Number(imageStyle.opacity)<.9||imageRect.width*imageRect.height<r.width*r.height*.7)visible=false;}
   else {const url=style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];if(url){const image=new Image();image.src=url;try{await image.decode();loaded=true;naturalWidth=image.naturalWidth;naturalHeight=image.naturalHeight;}catch{/* Report failure below. */}}}
   const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
   return {kind:el.getAttribute('data-avatar-kind'),loaded,naturalWidth,naturalHeight,visible,portraitArea:r.width*r.height,buttonArea:b.width*b.height,width:r.width,height:r.height,insideButton:r.x>=b.x&&r.y>=b.y&&r.right<=b.right&&r.bottom<=b.bottom,notOccluded:!!hit&&button.contains(hit)};
  });
  expect(result.kind).not.toBe('fallback');expect(result.loaded).toBe(true);expect(result.naturalWidth).toBeGreaterThan(0);expect(result.naturalHeight).toBeGreaterThan(0);expect(result.visible).toBe(true);expect(result.width).toBeGreaterThanOrEqual(44);expect(result.height).toBeGreaterThanOrEqual(44);expect(result.portraitArea/result.buttonArea).toBeGreaterThan(.7);expect(result.insideButton).toBe(true);expect(result.notOccluded).toBe(true);
 }
}
