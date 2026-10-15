// Curated fictional showroom cast. These are demo art choices, not gender or
// identity inference for real people. Production uses uploaded photos or initials.
export const arenaDemoIdentities:Readonly<Record<string,number>>=Object.freeze({
 peter:0,alva:1,sofia:5,erik:2,linnea:3,anton:11,julia:7,oskar:6,
 maja:14,felix:8,jonas:4,sara:10,emma:12,alex:13,marcus:15,lina:9,
});
export function arenaDemoIdentity(name:string){return arenaDemoIdentities[name.trim().toLocaleLowerCase('sv-SE')];}
export function showroomIdentity(id:string|undefined,name:string,showcase:boolean){
 return showcase&&id&&/^(s-\d+$|demo-|showroom:|local-demo-)/.test(id) ? arenaDemoIdentity(name):undefined;
}
