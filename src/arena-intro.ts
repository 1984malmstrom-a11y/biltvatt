export const ARENA_INTRO_KEY='arena:intro-seen:v1';
export const ARENA_INTRO_MS=3000;
let seenInDocument=false;
// Storage is optional, never a prerequisite for entering the product.
export function shouldShowArenaIntro(storage:Pick<Storage,'getItem'>|null,search:string,development=false){
 const params=new URLSearchParams(search);
 const force=params.get('intro')==='1'&&(development||params.get('showcase')==='1');
 if(force)return true;
 if(seenInDocument)return false;
 try{return storage?.getItem(ARENA_INTRO_KEY)!=='1';}catch{return true;}
}
export function finishArenaIntro(storage:Pick<Storage,'setItem'>|null){
 seenInDocument=true;
 try{storage?.setItem(ARENA_INTRO_KEY,'1');}catch{/* In-memory fallback for this document. */}
}
