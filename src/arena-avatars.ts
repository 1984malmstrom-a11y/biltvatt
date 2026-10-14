export type AvatarIdentity = { id?:string; name:string; imageUrl?:string | null };
export type AvatarSource = { kind:"uploaded"; url:string } | { kind:"demo"; index:number; position:string } | { kind:"fallback" };

// Presentation only. No seller, score or station data is changed by showcase mode.
export function demoAvatarIndex(identity:string):number {
  let hash=0;
  for(const character of identity.normalize("NFC"))hash=(Math.imul(hash,33)+character.codePointAt(0)!)>>>0;
  return hash%8;
}
export function resolveArenaAvatar(person:AvatarIdentity,showcase:boolean):AvatarSource {
  if(person.imageUrl && /^(\/[^/]|https:\/\/)/.test(person.imageUrl))return {kind:"uploaded",url:person.imageUrl};
  if(!showcase)return {kind:"fallback"};
  const index=demoAvatarIndex(person.id || person.name.trim().toLocaleLowerCase("sv-SE"));
  return {kind:"demo",index,position:`${(index%4)*100/3}% ${Math.floor(index/4)*100}%`};
}
export function readShowcaseMode(search:string,storage:Pick<Storage,"getItem"|"setItem"|"removeItem">):boolean {
  const value=new URLSearchParams(search).get("showcase");
  try {
    if(value==="1")storage.setItem("arena:showcase","1");
    if(value==="0")storage.removeItem("arena:showcase");
    return value==="1" || (value!=="0" && storage.getItem("arena:showcase")==="1");
  } catch { return value==="1"; }
}
