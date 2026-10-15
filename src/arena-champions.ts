// Celebration art is independent of employee identities and uploaded photos.
export const arenaChampions=[
 {id:'champion-a',src:'/arena-brand/champion-a.webp'},
 {id:'champion-b',src:'/arena-brand/champion-b.webp'},
] as const;
export function arenaChampion(eventKey:string){
 let hash=0;for(const c of eventKey)hash=(Math.imul(hash,31)+c.codePointAt(0)!)>>>0;
 return arenaChampions[hash%arenaChampions.length];
}
