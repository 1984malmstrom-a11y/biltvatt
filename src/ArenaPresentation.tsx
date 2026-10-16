import {useEffect,useMemo,useRef,useState,useSyncExternalStore,type MouseEvent} from 'react';
import {Play,Pause,ChevronLeft,ChevronRight,RotateCcw,X} from 'lucide-react';
import {api} from './api';
import {ArenaEmblem} from './ArenaBrand';
import {ArenaHome} from './ArenaApp';
import {ArenaRuntimeContext,type ArenaRuntime} from './arena-runtime';
import {ArenaShowcaseContext} from './ArenaAvatar';
import {createShowtime,showtimeBootstrap,showtimeScenes,type ShowtimeEngine} from './arena-showtime-engine';
import {arenaProductImage} from './arena-product-images';
import {arenaChampions} from './arena-champions';
import ArenaDialog from './ArenaDialog';
import ArenaAwardPreview from './ArenaAwardPreview';
import {showtimeAward} from './arena-showtime-award';
import './arena-presentation.css';

export function presentationReturn(search:string,origin:string){
 try{const url=new URL(new URLSearchParams(search).get('return')??'/arena/superadmin',origin);return url.origin===origin&&/^\/arena(?:\/|$)/.test(url.pathname)&&!/^\/arena\/(showtime|discover)/.test(url.pathname)?url.pathname+url.search:'/arena/superadmin';}catch{return '/arena/superadmin';}
}
const instructions=['Visa stationens sju aktiviteter, topplista och Stationspuls.','Fiktiva försäljningar kommer var sjätte sekund. Pausa när du vill prata.','Välj Biltvätt i Arenan och sedan Peter. +2 tar honom förbi Alva.','Starta tvåstationsduellen. Prova även att växla tillbaka till Stationsläge.','Demoklockan styr slutspurten. Prova en försäljning eller pausa inför avgörandet.','Avgör matchen, visa det simulerade diplomet och återvänd till Stationsläge.'];
export default function ArenaPresentation(){
 const [access,setAccess]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const back=presentationReturn(location.search,location.origin);
 useEffect(()=>{const controller=new AbortController();void api<{authorized:boolean}>('/arena/superadmin/presentation-access',{signal:controller.signal}).then(r=>{if(!controller.signal.aborted)setAccess(r.authorized===true);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[retry]);
 if(!access)return <main className="arena-theme arena-presentation-gate"><ArenaEmblem/><p className="arena-eyebrow">ARENAN · PRESENTATION</p><h1>{error?'Behörig presentatör krävs':'Kontrollerar behörighet…'}</h1><p role={error?'alert':'status'}>{error||'Din befintliga Superadmin-/Owner-session verifieras.'}</p>{error&&<button onClick={()=>{setError('');setRetry(n=>n+1);}}>Försök igen</button>}<a href="/arena/superadmin">Till Superadmin-inloggning</a></main>;
 return <PresentationStudio back={back}/>;
}
function PresentationStudio({back}:{back:string}){
 const [engine,setEngine]=useState<ShowtimeEngine|null>(null);
 useEffect(()=>{const created=createShowtime();setEngine(created);const restore=(e:PageTransitionEvent)=>{if(e.persisted)location.reload();};window.addEventListener('pageshow',restore);return()=>{created.dispose();window.removeEventListener('pageshow',restore);};},[]);
 return engine?<ShowtimeSession engine={engine} back={back}/>:<p role="status">Förbereder Showtime…</p>;
}
function ShowtimeSession({engine,back}:{engine:ShowtimeEngine;back:string}){
 useSyncExternalStore(engine.subscribe,()=>engine.revision);
 const [started,setStarted]=useState(false),[assetsReady,setAssetsReady]=useState(false),[message,setMessage]=useState(''),[awardOpen,setAwardOpen]=useState(false);
 const images=useRef<HTMLImageElement[]>([]),memory=useMemo(()=>new Map<string,string>(),[engine]);
 const runtime=useMemo<ArenaRuntime>(()=>({request:engine.request,now:()=>engine.now,demo:true,storage:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>{memory.set(key,value);}},subscribe:engine.subscribe}),[engine,memory]);
 useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)engine.tick(1000);},1000);const hide=()=>{if(document.hidden)engine.pause();};document.addEventListener('visibilitychange',hide);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',hide);};},[engine]);
 useEffect(()=>{let alive=true;const paths=[...showtimeBootstrap.activities.map(a=>arenaProductImage(a)!),...arenaChampions.map(c=>c.src),'/arena-showroom/portraits.webp','/arena-showroom/portraits-extra.webp'];images.current=paths.map(src=>{const img=new Image();img.src=src;return img;});void Promise.all(images.current.map(img=>img.decode())).then(()=>{if(alive)setAssetsReady(true);}).catch(()=>{if(alive)setMessage('En demonstrationsbild kunde inte laddas. Ladda om presentationen med anslutning.');});return()=>{alive=false;images.current=[];};},[]);
 const go=(scene:number)=>{memory.clear();engine.go(scene);setAwardOpen(false);setMessage('');};
 const intercept=(event:MouseEvent)=>{if((event.target as Element).closest('a')){event.preventDefault();setMessage('Du är kvar i Showtime. Avsluta presentationen för att öppna den ordinarie administrationen.');}};
 const award=useMemo(()=>showtimeAward(engine),[engine,engine.revision]);
 return <ArenaShowcaseContext.Provider value={true}><ArenaRuntimeContext.Provider value={runtime}><div className="arena-showtime arena-theme" data-scene={engine.scene+1} data-playing={engine.playing}>
  <header className="showtime-presenter" aria-label="Showtime presentatörspanel">
   <div className="showtime-topline"><strong><ArenaEmblem/> ARENAN SHOWTIME</strong><span className="showtime-demo-label">DEMOLÄGE · SIMULERADE DATA</span><span className="showtime-context">Intern månadstävling · Nationell individ & station</span><button className="showtime-exit" onClick={()=>{engine.dispose();location.assign(back);}}><X/> <span>AVSLUTA SHOWTIME</span></button></div>
   <div className="showtime-director"><div className="showtime-controls"><button aria-label="Föregående scen" disabled={!started||engine.scene===0} onClick={()=>go(engine.scene-1)}><ChevronLeft/></button><button className="showtime-play" disabled={!started} onClick={()=>engine.playing?engine.pause():engine.play()}>{engine.playing?<Pause/>:<Play/>}{engine.playing?'PAUSA':'FORTSÄTT'}</button><button aria-label="Nästa scen" disabled={!started||engine.scene===5} onClick={()=>go(engine.scene+1)}><ChevronRight/></button><button aria-label="Starta om Showtime" disabled={!started} onClick={()=>{memory.clear();engine.restart();setStarted(false);setAwardOpen(false);}}><RotateCcw/></button></div>
    <div className="showtime-scene-copy"><span>SCEN {engine.scene+1} / 6 · {engine.playing?'LIVE':'PAUSAD'}</span><strong>{showtimeScenes[engine.scene]}</strong><p>{instructions[engine.scene]}</p></div>
    <div className="showtime-scene-actions">{engine.scene===2&&<button onClick={()=>go(2)}>REPLAY NY ETTA</button>}{engine.scene===3&&!engine.fight()&&<button className="showtime-gold" onClick={()=>engine.startFight()}>STARTA BUTIKSFIGHT</button>}{engine.scene===4&&<><button onClick={()=>engine.urgency(10)}>10 MIN</button><button onClick={()=>engine.urgency(5)}>5 MIN</button><button onClick={()=>engine.urgency(1)}>1 MIN</button></>}{engine.scene===5&&!award&&<button className="showtime-gold" onClick={()=>engine.finish()}>AVGÖR MATCHEN</button>}{award&&<button className="showtime-gold" onClick={()=>setAwardOpen(true)}>VISA DEMODIPLOM</button>}</div>
   </div>
   {engine.receipt&&<div className="showtime-receipt" role="status"><b>{engine.receipt.seller} · {engine.receipt.product}</b><span>Intern +{engine.receipt.internal}</span><span>Nationell individ +{engine.receipt.nationalIndividual}</span><span>Nationell station +{engine.receipt.nationalStation}</span><span>Fight +{engine.receipt.fight}</span><small>En försäljning · bara kvalificerade tävlingar</small></div>}
  </header>
  <div className="showtime-product" onClickCapture={intercept}><ArenaHome key={engine.generation}/></div>
  {!started&&<section className="showtime-curtain"><ArenaEmblem/><span className="arena-eyebrow">EN LEVANDE DEMONSTRATION</span><h1>ARENAN<br/><em>SHOWTIME</em></h1><p>Riktiga Arenan. Simulerade försäljningar.<br/>Du styr tempot, laget visar kraften.</p><button className="showtime-gold" disabled={!assetsReady} onClick={()=>{setStarted(true);engine.play();}}>{assetsReady?'STARTA SHOWTIME':'FÖRBEREDER BILDER…'}</button><small>DEMOLÄGE · SIMULERADE DATA</small></section>}
  {message&&<ArenaDialog title="Showtime" onClose={()=>setMessage('')}><p>{message}</p></ArenaDialog>}
  {awardOpen&&award&&<ArenaDialog title="SIMULERAT SLUTRESULTAT · DEMODIPLOM" onClose={()=>setAwardOpen(false)}><p>Fiktiv match i Showtime. Inget diplom sparas i den ordinarie historiken.</p><ArenaAwardPreview snapshot={award} testPreview/></ArenaDialog>}
 </div></ArenaRuntimeContext.Provider></ArenaShowcaseContext.Provider>;
}
