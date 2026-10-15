import {demoAvatarIndex} from "../shared/arena-identities";
import {showroomIdentity} from './arena-demo-identities';
export {demoAvatarIndex} from "../shared/arena-identities";
const initialSegmenter=new Intl.Segmenter('sv-SE',{granularity:'grapheme'});
export type AvatarIdentity = { id?:string; name:string; imageUrl?:string | null; avatarIndex?:number|null };
export type AvatarSource = { kind:"uploaded"; url:string } | { kind:"demo"; index:number; position:string; sheet:string } | { kind:"initial"; initial:string } | { kind:"fallback" };

// Presentation only. No seller, score or station data is changed by showcase mode.
export function resolveArenaAvatar(person:AvatarIdentity,showcase:boolean):AvatarSource {
  if(person.imageUrl && /^(\/[^/]|https:\/\/)/.test(person.imageUrl))return {kind:"uploaded",url:person.imageUrl};
  // Fictional faces are explicit showroom art. Production never invents a face.
  if(!person.id && !person.name.trim())return {kind:"fallback"};
  if(!showcase){const first=initialSegmenter.segment(person.name.trim().normalize('NFC'))[Symbol.iterator]().next().value?.segment;return first?{kind:'initial',initial:first.toLocaleUpperCase('sv-SE')}:{kind:'fallback'};}
  const curated=showroomIdentity(person.id,person.name,showcase);
  const index=curated??(person.avatarIndex!=null && Number.isInteger(person.avatarIndex) && person.avatarIndex>=0 && person.avatarIndex<16 ? person.avatarIndex:demoAvatarIndex(person.id || person.name.trim().toLocaleLowerCase("sv-SE")));
  return {kind:"demo",index,sheet:index>=8?"-extra":"",position:`${(index%4)*100/3}% ${Math.floor((index%8)/4)*100}%`};
}
export function readShowcaseMode(search:string,storage:Pick<Storage,"getItem"|"setItem"|"removeItem">):boolean {
  const value=new URLSearchParams(search).get("showcase");
  try {
    if(value==="1")storage.setItem("arena:showcase","1");
    if(value==="0")storage.removeItem("arena:showcase");
    return value==="1" || (value!=="0" && storage.getItem("arena:showcase")==="1");
  } catch { return value==="1"; }
}
