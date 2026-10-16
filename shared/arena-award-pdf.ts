import type {ArenaReportSnapshot} from './arena-reports';
import {arenaPDFDocument} from './arena-pdf';
import {arenaAwardScene,awardPage} from './arena-award-scene';
import {awardArt,awardArtSize} from './arena-award-art';
const extra:Record<string,number>={'–':150,'—':151,'·':183,'…':133,'’':146};
const hex=(s:string)=>Array.from(s.normalize('NFC'),c=>(extra[c]??(c.charCodeAt(0)>=32&&c.charCodeAt(0)<=255?c.charCodeAt(0):63)).toString(16).padStart(2,'0')).join('');
const rgb=(color:string)=>[1,3,5].map(i=>(parseInt(color.slice(i,i+2),16)/255).toFixed(4)).join(' ');
// All real exports use only the archived snapshot. Decorative plates are embedded,
// with no remote fetch, live profile data, current timestamp or synthetic metrics.
export function arenaAwardPDF(s:ArenaReportSnapshot,options:{testPreview?:boolean}={}):Uint8Array{
 const {template,ops}=arenaAwardScene(s,options),{width:W,height:H}=awardPage;
 const q=[`q ${W} 0 0 ${H} 0 0 cm /AwardBackdrop Do Q`];
 for(const op of ops){
  if(op.kind==='text')q.push(`BT /${op.italic?'F3':op.bold?'F2':'F1'} ${op.size} Tf ${rgb(op.color)} rg 1 0 0 1 ${op.x} ${H-op.y-op.size} Tm <${hex(op.value)}> Tj ET`);
  else if(op.kind==='rect')q.push(`${rgb(op.color)} rg ${op.x} ${H-op.y-op.height} ${op.width} ${op.height} re f`);
  else q.push(`${rgb(op.color)} rg ${op.points.map(([x,y],i)=>`${x} ${H-y} ${i?'l':'m'}`).join(' ')} h f`);
 }
 const jpeg=Uint8Array.from(atob(awardArt[template]),c=>c.charCodeAt(0));
 return arenaPDFDocument([q],[{name:'AwardBackdrop',...awardArtSize,jpeg}]);
}
