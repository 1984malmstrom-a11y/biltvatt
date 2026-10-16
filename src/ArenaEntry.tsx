import {Component,createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {ArenaEmblem} from './ArenaBrand';
import {ARENA_INTRO_MS,finishArenaIntro,shouldShowArenaIntro} from './arena-intro';
import './arena-entry.css';

type EntryStatus={ready:boolean;error?:string;retry?:()=>void};
const EntryContext=createContext<(status:EntryStatus)=>void>(()=>{});
export function useArenaEntryStatus(ready:boolean,error?:string,retry?:()=>void){
 const report=useContext(EntryContext),retryRef=useRef(retry);retryRef.current=retry;
 useEffect(()=>report({ready,error,retry:()=>retryRef.current?.()}),[report,ready,error]);
}
function storage(){try{return window.sessionStorage;}catch{return null;}}
class EntryBoundary extends Component<{children:ReactNode;onError:(status:EntryStatus)=>void},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(){this.props.onError({ready:false,error:'Arenan kunde inte startas. Kontrollera anslutningen och försök igen.',retry:()=>window.location.reload()});}
 render(){return this.state.failed?null:this.props.children;}
}
export default function ArenaEntry({children}:{children:ReactNode}){
 const [intro]=useState(()=>shouldShowArenaIntro(storage(),window.location.search,import.meta.env.DEV));
 const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [status,setStatus]=useState<EntryStatus>({ready:false});
 const [elapsed,setElapsed]=useState(false),[visible,setVisible]=useState(intro),[leaving,setLeaving]=useState(false),[slow,setSlow]=useState(false);
 const report=useCallback((next:EntryStatus)=>setStatus(next),[]);
 // Remember first presentation immediately, including refresh/navigation before
 // its three-second window completes. Recovery never re-imposes that window.
 useEffect(()=>{if(intro)finishArenaIntro(storage());},[intro]);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 useEffect(()=>{const visibility=()=>{document.documentElement.dataset.arenaHidden=String(document.hidden);};visibility();document.addEventListener('visibilitychange',visibility);return()=>{document.removeEventListener('visibilitychange',visibility);delete document.documentElement.dataset.arenaHidden;};},[]);
 useEffect(()=>{const timer=setTimeout(()=>setElapsed(true),ARENA_INTRO_MS),timeout=setTimeout(()=>setSlow(true),15000);return()=>{clearTimeout(timer);clearTimeout(timeout);};},[]);
 useEffect(()=>{
  if(!visible||!status.ready||status.error||(!elapsed&&!reduced))return;
  finishArenaIntro(storage());setLeaving(true);
  if(reduced){setVisible(false);return;}
  const timer=setTimeout(()=>setVisible(false),240);return()=>clearTimeout(timer);
 },[visible,status.ready,status.error,elapsed,reduced]);
 const blocking=visible||!!status.error&&!status.ready;
 // Lazy React/data loading starts underneath immediately. The intro only gates presentation.
 return <EntryContext.Provider value={report}>
  <div className="arena-entry-content" inert={blocking||undefined} aria-hidden={blocking||undefined}><EntryBoundary onError={report}>{children}</EntryBoundary></div>
  {blocking&&<section className={`arena-intro${leaving?' is-leaving':''}${elapsed?' is-waiting':''}`} role={status.error?'alert':'status'} aria-label="Arenan startar" aria-busy={!status.ready&&!status.error}>
   <div className="arena-intro-stadium" aria-hidden="true"><i className="arena-intro-light light-left"/><i className="arena-intro-light light-right"/><i className="arena-intro-stands"/><i className="arena-intro-pitch"/></div>
   <div className="arena-intro-banner banner-left"><span>STARKARE SÄLJARE</span><span>STARKARE STATIONER</span></div>
   <div className="arena-intro-banner banner-right"><span>SÄLJ MER.</span><span>TILLSAMMANS.</span></div>
   <div className="arena-intro-center"><div className="arena-intro-symbol"><ArenaEmblem className="arena-intro-emblem"/><span aria-hidden="true"><ArenaEmblem className="arena-intro-emblem"/></span></div>
    <h1>ARENAN</h1><p>SÄLJ MER. TILLSAMMANS.</p>
    <div className="arena-intro-track" aria-hidden="true"><i/></div>
    <span className="arena-intro-caption">{status.error?'DET GICK INTE ATT STARTA':elapsed&&!status.ready?'ANSLUTER TILL ARENAN…':'LADDAR ARENAN...'}</span>
    {(status.error||slow&&!status.ready)&&<div className="arena-intro-recovery"><p>{status.error||'Anslutningen tar längre tid än väntat. Kontrollera nätverket eller försök igen.'}</p><button onClick={()=>{setStatus({ready:false});setSlow(false);if(status.retry)status.retry();else window.location.reload();}}>Försök igen</button></div>}
   </div>
  </section>}
 </EntryContext.Provider>;
}
