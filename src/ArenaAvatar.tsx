import {createContext,memo,useContext,useState} from "react";
import type {CSSProperties,ReactNode} from "react";
import {UserRound} from "lucide-react";
import {readShowcaseMode,resolveArenaAvatar,type AvatarIdentity} from "./arena-avatars";

const ShowcaseContext=createContext(false);
export const useArenaShowcase=()=>useContext(ShowcaseContext);
export function ArenaShowcaseProvider({children}:{children:ReactNode}) {
  const [showcase]=useState(()=>{try{return readShowcaseMode(window.location.search,window.sessionStorage);}catch{return new URLSearchParams(window.location.search).get("showcase")==="1";}});
  return <ShowcaseContext.Provider value={showcase}>{children}</ShowcaseContext.Provider>;
}
export default memo(function ArenaAvatar({id,name,imageUrl,avatarIndex,champion=false,className="arena-leader-avatar"}:AvatarIdentity & {champion?:boolean;className?:string}) {
  const showcase=useArenaShowcase(),[failed,setFailed]=useState("");
  const source=resolveArenaAvatar({id,name,avatarIndex,imageUrl:imageUrl===failed ? null:imageUrl},showcase);
  const style=source.kind==="demo" ? {backgroundImage:`url(/arena-showroom/${champion ? "champions":"portraits"}${source.sheet}.webp)`,backgroundPosition:source.position} as CSSProperties:undefined;
  return <span className={`${className}${source.kind==="demo" ? " arena-demo-portrait":""}`} data-avatar-kind={source.kind} data-avatar-index={source.kind==="demo" ? source.index:undefined} style={style} aria-hidden="true" title={source.kind==="demo" ? `${name} · fiktivt demoporträtt`:name}>
    {source.kind==="uploaded" ? <img src={source.url} alt="" decoding="async" onError={()=>setFailed(source.url)} />:source.kind==="fallback" ? <UserRound />:null}
  </span>;
});
