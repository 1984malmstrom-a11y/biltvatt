import {useMemo,useState} from 'react';
import {ChevronLeft,ChevronRight,X,Play,Crown} from 'lucide-react';
import {ArenaEmblem} from './ArenaBrand';
import {createShowtime} from './arena-showtime-engine';
import {showtimeAward} from './arena-showtime-award';
import ArenaAwardPreview from './ArenaAwardPreview';
import ArenaDialog from './ArenaDialog';
import './arena-discover.css';
import {discoverChapters} from './arena-discover-chapters';
function OrganizationGraphic(){return <figure className="discover-organization"><svg viewBox="0 0 620 360" role="img" aria-label="Schematisk organisation: stationer, distrikt, region och nation"><g fill="none" stroke="#b59d57" strokeWidth="1.5"><path d="M310 62V78M310 142V157M155 157H465M155 157V167M465 157V167M155 233V251M465 233V251M75 251H235M385 251H545M75 251V268M235 251V268M385 251V268M545 251V268"/></g>{[[310,30,'NATION'],[310,110,'REGION'],[155,200,'DISTRIKT'],[465,200,'DISTRIKT'],[75,300,'STATION'],[235,300,'STATION'],[385,300,'STATION'],[545,300,'STATION']].map(([x,y,label],i)=><g key={i} transform={`translate(${x} ${y})`}><circle r={32} fill="#0a2b1a" stroke={i?'#569772':'#e7cf85'} strokeWidth="2"/><text textAnchor="middle" y="5" fill="#e9dda9" fontSize="13" letterSpacing="1">{label}</text></g>)}</svg><figcaption>Schematisk översikt · verifierade tävlingsnivåer</figcaption><p>INDIVID & STATION <i/> LIGA & CUP <i/> FAIR PLAY</p></figure>;}
export default function ArenaDiscover({onClose,onShowtime}:{onClose:()=>void;onShowtime:()=>void}){
 const [chapter,setChapter]=useState(0),[awardView,setAwardView]=useState(false),[awardOpen,setAwardOpen]=useState(false),c=discoverChapters[chapter];
 const award=useMemo(()=>{const engine=createShowtime();engine.go(5);engine.finish();const result=showtimeAward(engine)!;engine.dispose();return result;},[]);
 const go=(n:number)=>{setChapter(Math.max(0,Math.min(5,n)));setAwardView(false);setAwardOpen(false);};
 return <div className={`arena-discover arena-theme chapter-${chapter+1}${chapter===0||chapter===5?' is-brand-chapter':''}`} onKeyDown={e=>{if(awardOpen)return;if(e.key==='ArrowRight'){e.preventDefault();go(chapter+1);}if(e.key==='ArrowLeft'){e.preventDefault();go(chapter-1);}if(e.key==='Escape')onClose();}}>
  <header className="discover-header"><strong><ArenaEmblem/> UPPTÄCK ARENAN</strong><span>DEMOBILDER · SIMULERADE DATA</span><button aria-label="Stäng Upptäck Arenan" onClick={onClose}><X/></button></header>
  <main className="discover-main" key={chapter}>
   <section className="discover-copy"><p className="arena-eyebrow">0{chapter+1} / 06 · {c.name}</p>{(chapter===0||chapter===5)&&<ArenaEmblem className="discover-emblem"/>}<h1>{c.title}</h1><p>{c.copy}</p>{chapter===5&&<button className="showtime-gold discover-cta" onClick={onClose}>TILL ARENAN <ChevronRight/></button>}{chapter===0&&<p className="discover-brand-caption">MÄNNISKOR. MOTIVATION. RESULTAT.</p>}</section>
   {chapter===1&&<figure className="discover-product"><img src="/arena-presentation/product-station.webp" alt="Aktuell ARENAN-dashboard: sju produktcirklar, topplista, senaste aktiviteter och Stationspuls. Syntetiska demodata."/><figcaption>Riktig ARENAN, fångad i Showtime · simulerade resultat</figcaption></figure>}
   {chapter===2&&<section className="discover-motivation"><div className="discover-choice" aria-label="Motivationsexempel"><button aria-pressed={!awardView} onClick={()=>setAwardView(false)}><Crown/> NY ETTA</button><button aria-pressed={awardView} onClick={()=>setAwardView(true)}>GAMING AWARDS</button></div>{awardView?<div className="discover-award"><ArenaAwardPreview snapshot={award} testPreview/><button onClick={()=>setAwardOpen(true)}>Öppna demodiplomet</button></div>:<figure className="discover-product"><img src="/arena-presentation/product-leader.webp" alt="Riktig Ny etta-hero: Peter går om Alva i en simulerad registrering."/><figcaption>Befintlig champion-hero · fiktiv person och simulerat resultat</figcaption></figure>}</section>}
   {chapter===3&&<figure className="discover-product"><img src="/arena-presentation/product-battle.webp" alt="Aktuell Battle Mode med sju slots, två stationer, matchpoäng och den riktiga Fight-panelen. Syntetiska demodata."/><figcaption>Riktig Battle Mode · Tingsryd VS Ronneby · exakt två lag</figcaption></figure>}
   {chapter===4&&<OrganizationGraphic/>}
  </main>
  <footer className="discover-footer"><button disabled={chapter===0} aria-label="Föregående kapitel" onClick={()=>go(chapter-1)}><ChevronLeft/></button><nav aria-label="Presentationens kapitel">{discoverChapters.map((c,i)=><button key={c.name} aria-label={`Kapitel ${i+1}: ${c.name}`} aria-current={chapter===i?'step':undefined} onClick={()=>go(i)}><span>0{i+1}</span></button>)}</nav><button disabled={chapter===5} aria-label="Nästa kapitel" onClick={()=>go(chapter+1)}><ChevronRight/></button><button className="discover-showtime" onClick={onShowtime}><Play/> STARTA SHOWTIME</button></footer>
  {awardOpen&&<ArenaDialog title="Demodiplom · SIMULERADE DATA" onClose={()=>setAwardOpen(false)}><ArenaAwardPreview snapshot={award} testPreview/></ArenaDialog>}
 </div>;
}
