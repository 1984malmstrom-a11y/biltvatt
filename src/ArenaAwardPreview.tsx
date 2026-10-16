import {useId,useMemo} from 'react';
import type {ArenaReportSnapshot} from '../shared/arena-reports';
import {awardLabel} from '../shared/arena-awards';
import {arenaAwardScene,awardPage} from '../shared/arena-award-scene';
import {awardArt} from '../shared/arena-award-art';
import './arena-awards.css';
// Exactly the same text, layout and artwork as the PDF; responsive vector text
// remains crisp without depending on a browser's built-in PDF viewer.
export default function ArenaAwardPreview({snapshot,testPreview=false}:{snapshot:ArenaReportSnapshot;testPreview?:boolean}){
 const id=useId(),scene=useMemo(()=>arenaAwardScene(snapshot,{testPreview}),[snapshot,testPreview]);
 return <article className="arena-award-paper" aria-label={`Arena Award: ${awardLabel(snapshot.award!.variant)}`}>
  <h2 className="arena-award-accessible">{awardLabel(snapshot.award!.variant)}</h2>
  <svg viewBox={`0 0 ${awardPage.width} ${awardPage.height}`} role="img" aria-labelledby={id}>
   <title id={id}>{awardLabel(snapshot.award!.variant)} · {snapshot.award!.recipient.name}. {testPreview?'Demoläge · simulerade data.':'Fryst resultat.'}</title>
   <image href={`data:image/jpeg;base64,${awardArt[scene.template]}`} width={awardPage.width} height={awardPage.height} preserveAspectRatio="none"/>
   {scene.ops.map((op,i)=>op.kind==='text'?<text key={i} x={op.x} y={op.y+op.size} fill={op.color} fontSize={op.size} fontWeight={op.bold?700:400} fontStyle={op.italic?'italic':undefined} fontFamily="Arial, Helvetica, sans-serif">{op.value}</text>:op.kind==='rect'?<rect key={i} x={op.x} y={op.y} width={op.width} height={op.height} fill={op.color}/>:<polygon key={i} points={op.points.map(p=>p.join(',')).join(' ')} fill={op.color}/>)}
  </svg>
  <footer className="arena-award-accessible">Fryst: {snapshot.created_at}. Award-ID: {snapshot.id}. Källrapport: {snapshot.award!.source_report_id}.</footer>
 </article>;
}
