import type {ArenaReportSnapshot,ReportRow} from './arena-reports';
import {awardLabel} from './arena-awards';

export type AwardTemplate='individual'|'duel'|'championship';
export type AwardText={kind:'text';value:string;x:number;y:number;size:number;color:string;bold:boolean;italic?:boolean};
export type AwardShape={kind:'shape';points:number[][];color:string};
export type AwardRect={kind:'rect';x:number;y:number;width:number;height:number;color:string};
export type AwardOp=AwardText|AwardShape|AwardRect;
export const awardPage={width:595.276,height:841.89};
const GOLD='#f3d784',WHITE='#f9f6e9',INK='#09231b',MUTED='#c7cdbd';
// Helvetica widths. The same geometry is used by the PDF and responsive SVG preview.
const widths=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500];
const clean=(s:string)=>s.normalize('NFC').replace(/[\x00-\x1f\x7f-\x9f]/g,' ').replace(/\s+/g,' ').trim();
export const awardTextWidth=(s:string,size:number,bold=false)=>Array.from(s.normalize('NFD').replace(/[\u0300-\u036f]/g,''),c=>(widths[c.charCodeAt(0)-32]??556)*size/1000*(bold?1.07:1)).reduce((a,b)=>a+b,0);
const fmt=(n:number)=>n.toLocaleString('sv-SE',{maximumFractionDigits:2});
const value=(s:ArenaReportSnapshot,r:ReportRow)=>s.metric==='tb'?r.tb_ore/100:s.metric==='count'?r.count:r.points;
export function awardTemplate(s:ArenaReportSnapshot):AwardTemplate{
 if(!s.award)throw Error('Fryst award saknas.');
 if(s.type!=='fight')return 'individual';
 const c=s.competition;
 // A two-station cup is still a championship, never a duel certificate.
 if(c&&['league','playoffs','cup'].includes(c.format))return 'championship';
 return s.leaderboard.length===2?'duel':'championship';
}
export function awardDuel(s:ArenaReportSnapshot){
 if(awardTemplate(s)!=='duel')throw Error('Duell kräver två stationer.');
 const recipient=s.award!.recipient.id,rows=[...s.leaderboard].sort((a,b)=>Number(b.id===recipient)-Number(a.id===recipient));
 const daily=s.competition?.format==='daily'||s.scoring_mode==='daily';
 const direct=s.competition?.matches.find(m=>m.stage==='direct'&&m.phase==='finished'&&rows.every(r=>r.id===m.home_id||r.id===m.away_id));
 const scores=rows.map(r=>daily?(s.competition?s.competition.standings.find(t=>t.id===r.id)?.match_points:r.match_points):direct?direct.score[r.id===direct.home_id?0:1]:value(s,r));
 if(scores.some(n=>typeof n!=='number'||!Number.isFinite(n)))throw Error('Fryst slutpoäng saknas.');
 return {rows,scores:scores as number[],unit:daily?'MATCHPOÄNG':s.metric==='tb'?'KR TB':s.metric==='count'?'REGISTRERINGAR':'POÄNG'};
}
export function arenaAwardScene(s:ArenaReportSnapshot,{testPreview=false}:{testPreview?:boolean}={}){
 const template=awardTemplate(s),a=s.award!,ops:AwardOp[]=[],W=awardPage.width;
 const text=(value:string,x:number,y:number,size:number,max=480,bold=true,color=WHITE,italic=false)=>{
  value=clean(value);while(awardTextWidth(value,size,bold)>max&&size>5)size-=.25;size=Math.min(size,max/Math.max(1,awardTextWidth(value,1,bold)));
  ops.push({kind:'text',value,x:x-awardTextWidth(value,size,bold)/2,y,size,bold,color,italic});
 };
 const center=(v:string,y:number,size:number,max=480,bold=true,c=WHITE,italic=false)=>text(v,W/2,y,size,max,bold,c,italic);
 const rect=(x:number,y:number,width:number,height:number,color:string)=>ops.push({kind:'rect',x,y,width,height,color});
 const shape=(points:number[][],color=GOLD)=>ops.push({kind:'shape',points,color});
 const emblem=(cx:number,y:number,scale:number,c=GOLD)=>{
  // Exact locked ArenaEmblem geometry, not an AI-generated substitute.
  const x=cx-21.5*scale;
  shape([[3,38],[21,4],[40,38],[31,38],[21,19],[12,38]].map(([a,b])=>[x+a*scale,y+b*scale]),c);
  shape([[17,29],[31,38],[22,38],[13,32]].map(([a,b])=>[x+a*scale,y+b*scale]),c);
 };
 const name=(v:string,y:number,width:number,size:number,c=INK,x=W/2)=>{
  const words=clean(v).split(' ');let lines=[clean(v)];
  if(awardTextWidth(lines[0],size,false)>width&&words.length>1){let best=1;for(let i=1;i<words.length;i++)if(Math.max(awardTextWidth(words.slice(0,i).join(' '),size),awardTextWidth(words.slice(i).join(' '),size))<Math.max(awardTextWidth(words.slice(0,best).join(' '),size),awardTextWidth(words.slice(best).join(' '),size)))best=i;lines=[words.slice(0,best).join(' '),words.slice(best).join(' ')];}
  const n=lines.length===2?Math.min(size,19):size;lines.forEach((line,i)=>text(line,x,y+(i-(lines.length-1)/2)*(n+2),n,width,false,c,true));
 };
 const title=(v:string,y:number,size:number,max:number)=>{text(v,W/2+1,y+1.7,size,max,true,'#685022');center(v,y,size,max,true,GOLD);};
 const stars=(y:number)=>{for(let i=0;i<5;i++){const cx=W/2+(i-2)*19;shape(Array.from({length:10},(_,j)=>{const t=-Math.PI/2+j*Math.PI/5,r=j%2?2.3:5.6;return[cx+Math.cos(t)*r,y+Math.sin(t)*r];}));}};
 const meta=(values:{label:string;value:string}[],y:number)=>{const width=480/values.length;values.forEach((m,i)=>{const cx=57.6+(i+.5)*width;if(i)rect(57.6+i*width,y,0.5,47,'#846b38');text(m.value,cx,y+4,12,width-18,true,GOLD);text(m.label,cx,y+29,6.7,width-18,false,MUTED);});};
 const period=`${s.period.start.slice(0,10)} – ${s.period.end.slice(0,10)}`;
 const scope=s.activity?.name??(s.competition?({all:'ALLA KATEGORIER',focus:'MÅNADENS FOKUS',category:'VALD KATEGORI',activity:'VALDA AKTIVITETER'} as const)[s.competition.rules.scope.kind]:'ALLA KATEGORIER');
 const shared=(s.winner_ids?.length??s.winner_names.length)>1;
 if(template==='individual'){emblem(223,18,.7);text('A R E N A N',320,25,16,230,true,GOLD);text('SÄLJ MER. TILLSAMMANS.',320,47,6,230,false);}else{emblem(W/2,19,1);center('A R E N A N',59,18,260,true,GOLD);center('SÄLJ MER. TILLSAMMANS.',84,6.5,250,false);}
 if(template==='individual'){
  center('ARENAN',168,17,300,true,GOLD);title('CHAMPION',194,49,358);title('AWARD',247,24,300);stars(287);
  center('DENNA UTMÄRKELSE TILLDELAS',298,7,360,false,GOLD);
  name(a.recipient.name,324,390,32);
  center(awardLabel(a.variant),393,11,455,true,GOLD);center(a.context,416,10,440,false);
  center('FÖR EN INSATS ATT VARA STOLT ÖVER.',444,8,440,false,MUTED);
  const row=s.leaderboard.find(r=>r.id===a.recipient.id);
  const metrics=[{label:'REGISTRERINGAR',value:fmt(s.totals.count)},{label:'POÄNG',value:fmt(s.totals.points)}];
  if(row)metrics.push({label:'PLACERING',value:fmt(row.rank)});
  const goal=s.goals.find(g=>g.target_points>0&&(a.variant==='station-goal'?g.kind==='station':g.kind==='personal'&&g.seller_id===a.recipient.id));
  if(goal)metrics.push({label:'MÅLUPPFYLLELSE',value:`${fmt(goal.points/goal.target_points*100)} %`});
  else metrics.push({label:'UPPSKATTAT TB',value:`${fmt(s.totals.tb_ore/100)} kr`});
  const gap=7,w=(480-gap*(metrics.length-1))/metrics.length;
  metrics.forEach((m,i)=>{const x=57.6+i*(w+gap);rect(x,480,w,69,'#08281e');rect(x,480,w,1,'#c5a455');text(m.value,x+w/2,494,22,w-12,true,GOLD);text(m.label,x+w/2,531,6.7,w-10,false,WHITE);});
  center('STORA RESULTAT SKAPAS TILLSAMMANS.',574,9,470,true,GOLD);
  center(period,589,10,475,false);emblem(W/2,654,1.5,INK);center('CHAMPION',716,8,100,true,INK);
  if(s.totals.unknown_tb_count)center(`${s.totals.unknown_tb_count} registreringar saknar historiskt TB.`,752,7,470,false,MUTED);
 }else{
  // Sword motif is vector decoration, never a result or fabricated signature.
  shape([[285,103],[312,130],[316,127],[289,100]]);shape([[306,100],[279,127],[282,131],[310,103]]);
  title('BUTIKSFIGHT',138,21,330);title('CHAMPION',163,38,370);
  center(shared?'DELAD VINNANDE STATION':'VINNANDE STATION',207,8,340,true,GOLD);stars(224);
  emblem(W/2,302,1.35,'#f8e6a4');
  if(template==='duel'){
   const d=awardDuel(s);d.rows.forEach((r,i)=>{const cx=i?484:111;emblem(cx,333,1.05);name(r.name,380,125,18,WHITE,cx);text(fmt(d.scores[i]),cx,418,36,118,true,i?WHITE:GOLD);text(d.unit,cx,464,7,120,false,MUTED);text(i===0?(shared?'DELAD SEGER':'VINNARE'):'FINALRESULTAT',cx,312,7,122,true,i===0?GOLD:MUTED);});
   title('VS',465,26,90);name(a.recipient.name,574,370,30);
   center('TILLSAMMANS GJORDE NI SKILLNAD',638,9,440,true,GOLD);
   center('Stark insats. Starkt lag. Starkare tillsammans.',659,9,440,false);
   meta([{label:'TÄVLINGSPERIOD',value:period},{label:'OMFATTNING',value:scope},{label:`DIFFERENS · ${d.unit}`,value:fmt(Math.abs(d.scores[0]-d.scores[1]))}],701);
  }else{
   name(a.recipient.name,554,365,32);
   center('BUTIKSFIGHT CHAMPION',599,11,400,true,GOLD);
   center('TILLSAMMANS GÖR VI SKILLNAD',634,9,430,true,GOLD);
   center('Stark insats. Starkare lag. En gemensam seger.',657,9,450,false);
   // No opponent identities, match scores or leaderboard in this template.
   meta([{label:'TÄVLINGSPERIOD',value:period},{label:'OMFATTNING',value:scope},{label:'UTMÄRKELSE',value:awardLabel(a.variant)}],701);
  }
 }
 rect(57,778,482,33,INK);rect(58,780,480,.5,'#9d8448');
 center(`Fryst: ${s.created_at} · Award-ID: ${s.id}`,787,6.2,475,false,MUTED);
 center(`Källrapport: ${a.source_report_id}`,800,6.2,475,false,MUTED);
 if(testPreview){rect(102,812,391,15,INK);center('TESTFÖRHANDSVISNING · SYNTETISKA DATA',815,7,380,true,GOLD);}
 else center('ARENAN | SÄLJ MER. TILLSAMMANS.',815,6,420,false,GOLD);
 return {template,ops};
}
