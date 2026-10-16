import {useId} from 'react';

/* Static vector materials: no raster asset, filter surface or particle engine. */
export function BattleSwords() {
 const id=useId();
 return <svg className="arena-battle-swords" viewBox="0 0 800 800" aria-hidden="true" focusable="false">
  <defs>
   <linearGradient id={`${id}-steel`}><stop stopColor="#141e1b"/><stop offset=".22" stopColor="#59605b"/><stop offset=".47" stopColor="#c7c9b6"/><stop offset=".5" stopColor="#e3ddbd"/><stop offset=".52" stopColor="#424e48"/><stop offset=".8" stopColor="#202d27"/><stop offset="1" stopColor="#7c8478"/></linearGradient>
   <linearGradient id={`${id}-gold`} x2=".8" y2="1"><stop stopColor="#463c24"/><stop offset=".35" stopColor="#b8a36c"/><stop offset=".48" stopColor="#eadba8"/><stop offset=".6" stopColor="#7b693f"/><stop offset="1" stopColor="#262b20"/></linearGradient>
   <linearGradient id={`${id}-leather`}><stop stopColor="#07110d"/><stop offset=".45" stopColor="#394336"/><stop offset="1" stopColor="#0b1812"/></linearGradient>
  </defs>
  {[-64,64].map(angle=><g key={angle} transform={`translate(400 400) rotate(${angle}) translate(-400 -400)`}>
   <path className="blade" fill={`url(#${id}-steel)`} d="M400 24 426 101 418 625 382 625 374 101Z"/>
   <path className="blade-edge" d="M400 27 400 616M375 102 383 618M425 102 417 618"/>
   <path className="blade-fuller" d="M394 128 391 583M406 128 409 583"/>
   <g transform="translate(0 80)">
   <path className="sword-guard" fill={`url(#${id}-gold)`} d="M328 536 351 528 385 540 415 540 449 528 472 536 466 558 434 554 416 562 384 562 366 554 334 558Z"/>
   <path fill={`url(#${id}-leather)`} stroke="#8f805b" d="M386 559 414 559 411 663 389 663Z"/>
   {Array.from({length:8},(_,i)=><path key={i} className="sword-binding" d={`M389 ${570+i*11}l22 6`}/>)}
   <path fill={`url(#${id}-gold)`} stroke="#b9a773" d="M388 659 412 659 424 680 415 702 400 713 385 702 376 680Z"/>
   <path className="sword-pommel" d="m400 670 10 12-10 15-10-15Z"/>
   </g>
  </g>)}
 </svg>;
}
