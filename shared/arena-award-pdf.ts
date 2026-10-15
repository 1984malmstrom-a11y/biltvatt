import type {ArenaReportSnapshot} from './arena-reports';
import {awardLabel} from './arena-awards';
import {arenaPDFDocument} from './arena-pdf';
// Small vector-only award engine. No images, remote fonts, live data or timestamps.
// Helvetica/WinAnsi guarantees Swedish glyphs with standard PDF readers/printers.
const W=595.276,H=841.89,G='0.58 0.43 0.17',D='0.025 0.16 0.105',M='0.29 0.35 0.30',I='0.995 0.986 0.949';
const extra:Record<string,number>={'–':150,'—':151,'·':183,'…':133,'’':146};
const hex=(s:string)=>Array.from(s.normalize('NFC').replace(/[\r\n\t]/g,' '),c=>(extra[c]??(c.charCodeAt(0)>=32&&c.charCodeAt(0)<=255?c.charCodeAt(0):63)).toString(16).padStart(2,'0')).join('');
// Actual Helvetica ASCII widths; accented Latin characters use their base glyph.
const widths=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500];
const measure=(s:string,size:number,bold=false)=>Array.from(s.normalize('NFD').replace(/[\u0300-\u036f]/g,''),c=>(widths[c.charCodeAt(0)-32]??556)*size/1000*(bold?1.045:1)).reduce((a,b)=>a+b,0);
export function arenaAwardPDF(s:ArenaReportSnapshot):Uint8Array{
 const a=s.award;if(!a)throw Error('Fryst award saknas.');const q:string[]=[];
 const rect=(x:number,y:number,w:number,h:number,c:string)=>q.push(`${c} rg ${x} ${H-y-h} ${w} ${h} re f`);
 const line=(x:number,y:number,w:number,c=G)=>rect(x,y,w,.7,c);
 const path=(points:number[][],fill:string)=>q.push(`${fill} rg ${points.map(([x,y],i)=>`${x} ${H-y} ${i?'l':'m'}`).join(' ')} h f`);
 const text=(value:string,x:number,y:number,size:number,bold=true,color=D,max=495)=>{
  let t=value.replace(/[\r\n\t]/g,' '),n=size;while(measure(t,n,bold)>max&&n>8)n-=.5;while(measure(t,n,bold)>max&&t.length)t=t.slice(0,-2)+'…';q.push(`BT /${bold?'F2':'F1'} ${n} Tf ${color} rg 1 0 0 1 ${x} ${H-y-n} Tm <${hex(t)}> Tj ET`);
 };
 const center=(v:string,y:number,size:number,bold=true,c=D,max=475)=>{let n=size;while(measure(v,n,bold)>max&&n>9)n-=.5;const w=Math.min(max,measure(v,n,bold));text(v,(W-w)/2,y,n,bold,c,max);};
 const emblem=(x:number,y:number,scale=1,c=G)=>{path([[3,38],[21,4],[40,38],[31,38],[21,19],[12,38]].map(([a,b])=>[x+a*scale,y+b*scale]),c);path([[17,29],[31,38],[22,38],[13,32]].map(([a,b])=>[x+a*scale,y+b*scale]),c);};
 rect(0,0,W,H,I);q.push(`${G} RG 1.4 w 25 25 ${W-50} ${H-50} re S`,`${G} RG .45 w 32 32 ${W-64} ${H-64} re S`);
 rect(33,33,W-66,106,D);emblem(63,57,.95);text('A R E N A N',123,60,25,true,'0.94 0.83 0.53');text('SALES COMPETITION. BIGGER TOGETHER.',124,97,8,false,'0.82 0.88 0.81');
 // Watermark is static vector geometry in very pale ink.
 emblem(193,346,4.7,'0.968 0.949 0.886');
 center('ARENA AWARD',164,11,true,G);
 const cy=226;path([[258,cy-20],[275,cy-8],[W/2,cy-32],[320,cy-8],[337,cy-20],[329,cy+10],[266,cy+10]],G);line(267,cy+16,61);
 center('VINNARDIPLOM',269,13,true,M);center(awardLabel(a.variant),297,25,true,D);
 line(213,341,169);center(a.recipient.name,365,43,true,D);center(a.context,425,13,false,M);center(a.result.toLocaleUpperCase('sv-SE'),463,28,true,G);
 const nums=[s.totals.points.toLocaleString('sv-SE'),s.totals.count.toLocaleString('sv-SE'),(s.totals.tb_ore/100).toLocaleString('sv-SE')+' kr'],labels=['POÄNG','REGISTRERINGAR','UPPSKATTAT TB'];
 nums.forEach((n,i)=>{const x=55+i*164;rect(x,518,157,65,'0.946 0.931 0.871');line(x,518,157);text(n,x+12,530,19,true,D,132);text(labels[i],x+12,562,8,true,M,132);});
 const period=(v:string)=>new Intl.DateTimeFormat('sv-SE',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Stockholm'}).format(new Date(v.length===10?v+'T12:00:00Z':v));
 center(`${period(s.period.start)} – ${period(s.period.end)}`,605,11,false,M);
 if(a.standing)center(`${a.standing.played} matcher  ·  ${a.standing.won} vinster  ·  ${a.standing.drawn} oavgjorda  ·  ${a.standing.lost} förluster`,629,10,false,M);
 else if(a.variant==='personal-goal'||a.variant==='station-goal'){const g=s.goals.find(g=>g.name===(a.variant==='personal-goal'?a.recipient.name:'Lagets mål')&&g.points>=g.target_points);if(g)center(`${g.points} / ${g.target_points} poäng · Målet uppnått`,629,11,true,D);}
 else if(s.activity)center(s.activity.name,629,12,true,D);
 else if(s.type==='fight')center(s.leaderboard.slice(0,4).map(r=>`${r.name} ${r.match_points??(s.metric==='tb'?r.tb_ore/100:s.metric==='count'?r.count:r.points)}`).join('  –  '),629,10,false,M);
 center('EN INSATS ATT VARA STOLT ÖVER.',662,10,true,G);
 // Geometric champion seal, designed for a crisp monochrome-friendly print.
 const cx=W/2,sy=710,r=26;const seal=Array.from({length:24},(_,i)=>{const t=i*Math.PI/12,rad=i%2?r-3:r;return[cx+Math.cos(t)*rad,sy+Math.sin(t)*rad]});path(seal,G);center('ARENAN',697,8,true,I);center('CHAMPION',709,7,true,I);center(s.period.end.slice(0,4),720,6,true,I);
 line(49,753,W-98);text(`Fryst: ${s.created_at}`,49,763,7,false,M,495);text(`Award-ID: ${s.id}`,49,778,7,false,M,495);text(`Källrapport: ${a.source_report_id}`,49,791,6.5,false,M,495);
 if(s.totals.unknown_tb_count)text(`${s.totals.unknown_tb_count} äldre registreringar saknar historiskt TB.`,49,808,6.5,false,M,495);
 return arenaPDFDocument([q]);
}
