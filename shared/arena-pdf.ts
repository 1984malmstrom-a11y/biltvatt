import type {ArenaReportSnapshot,ReportTotals} from './arena-reports';

// Dependency-free, deterministic A4 renderer. All document strings are WinAnsi
// hex strings; the PDF syntax itself is ASCII. Offsets and stream sizes are bytes.
const W=595.276,H=841.89,M=42;
const navy='0.025 0.065 0.12',gold='0.69 0.52 0.24',muted='0.32 0.39 0.45';
const enc=new TextEncoder();
const ansiExtra:Record<string,number>={'€':128,'‘':145,'’':146,'“':147,'”':148,'•':149,'–':150,'—':151,'…':133};
function ansi(text:string){return Array.from(text.normalize('NFC'),c=>ansiExtra[c]??(c.charCodeAt(0)>=32&&c.charCodeAt(0)<=255?c.charCodeAt(0):c==='\n'||c==='\r'||c==='\t'?32:63));}
const hex=(text:string)=>ansi(text).map(n=>n.toString(16).padStart(2,'0')).join('');
const number=(n:number)=>n.toLocaleString('sv-SE',{maximumFractionDigits:2}).replaceAll('\u00a0',' ');
const money=(ore:number)=>`${number(ore/100)} kr`;
// Conservative Helvetica advances, also used to truncate hostile/very long names.
function advance(c:string){return /[ilIjtfr.,:;'!| ]/.test(c)?.3:/[MW@%ÅÄÖA-Z]/.test(c)?.95:.62;}
const width=(text:string,size:number)=>Array.from(text).reduce((n,c)=>n+advance(c)*size,0);
function fit(text:string,size:number,max:number){let result=text.replace(/[\r\n\t]/g,' ');if(width(result,size)<=max)return result;while(result&&width(result+'…',size)>max)result=result.slice(0,-1);return result+'…';}
export function arenaReportPDF(s:ArenaReportSnapshot):Uint8Array {
  const pages:string[][]=[];let commands:string[]=[],y=0;
  function rect(x:number,top:number,w:number,h:number,color:string){commands.push(`${color} rg ${x} ${H-top-h} ${w} ${h} re f`);}
  function line(x:number,top:number,w:number,color=gold){rect(x,top,w,.8,color);}
  function text(value:string,x:number,top:number,size=11,bold=false,color=navy,max=W-2*M){const valueFit=fit(value,size,max);commands.push(`BT /${bold?'F2':'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${H-top-size} Tm <${hex(valueFit)}> Tj ET`);}
  function center(value:string,top:number,size:number,bold=true,color=navy){const fitted=fit(value,size,W-2*M-20);/* PDF text centering uses conservative measurement, bounded within the page. */text(fitted,Math.max(M,(W-width(fitted,size)*.86)/2),top,size,bold,color);}
  function page(continuation=false){
    commands=[];pages.push(commands);rect(0,0,W,H,'0.995 0.989 0.966');rect(0,0,W,91,navy);
    text('A R E N A N',M,24,22,true,'0.96 0.85 0.62');text('MÄNNISKOR. MOTIVATION. RESULTAT.',M,56,8,false,'0.76 0.83 0.89');line(M,90,W-2*M);
    if(continuation){text('RESULTAT · FORTSÄTTNING',M,113,18,true);text(s.station?.name??'Butiksfight · Arena-nätverket',M,141,11,false,muted);y=179;}
    else y=117;
  }
  function ensure(height:number){if(y+height>748)page(true);}
  function section(title:string){ensure(64);text(title,M,y,11,true);line(M,y+23,W-2*M,'0.81 0.79 0.72');y+=32;}
  function table(headers:string[],rows:string[][],columns:number[],empty='Inga registreringar i den frysta perioden.'){
    const rowHeight=24;
    const header=()=>{rect(M,y,W-2*M,28,navy);headers.forEach((h,i)=>text(h,columns[i]+7,y+8,9,true,'1 1 1',(columns[i+1]??W-M)-columns[i]-14));y+=28;};
    ensure(58);header();
    if(!rows.length){text(empty,M+8,y+12,10,false,muted);y+=40;return;}
    rows.forEach((row,index)=>{if(y+rowHeight>748){page(true);header();}if(index%2===0)rect(M,y,W-2*M,rowHeight,'0.95 0.95 0.93');row.forEach((cell,i)=>text(cell,columns[i]+7,y+9,10,i===0||i===headers.length-1,navy,(columns[i+1]??W-M)-columns[i]-14));line(M,y+rowHeight,W-2*M,'0.88 0.88 0.85');y+=rowHeight;});y+=12;
  }
  function kpis(t:ReportTotals){
    ensure(88);const tileHeight=s.type==='diploma'?70:78;const values=[number(t.points),number(t.count),money(t.tb_ore)],labels=['POÄNG','REGISTRERINGAR','UPPSKATTAT TB'];const gap=10,tile=(W-2*M-gap*2)/3;
    values.forEach((v,i)=>{const x=M+i*(tile+gap);rect(x,y,tile,tileHeight,'0.945 0.935 0.895');rect(x,y,3,tileHeight,gold);text(v,x+13,y+15,i===2?20:27,true,navy,tile-25);text(labels[i],x+13,y+53,8,true,muted,tile-25);});y+=90;
  }
  page();
  if(s.type==='diploma'){
    // Ornament and generous hierarchy make the downloaded document a diploma.
    commands.push(`${gold} RG 1 w 25 25 ${W-50} ${H-127} re S`);
    center('VINNARDIPLOM',123,32);center('FÖRSTAPLATS',173,11,true,gold);
    line(W/2-48,205,96);center(s.subject?.name??s.winner_names.join(' · ')??'Laget',227,43);
    center(s.station?.name??'Arena-nätverket',289,15,false,muted);center(`${s.period.start} – ${s.period.end}`,319,11,false,muted);
    y=344;kpis(s.totals);section('EN INSATS ATT VARA STOLT ÖVER');
    text('Varje registrering bidrar. Det här är ditt frysta resultat.',M,y,11,false,muted);y+=20;
    table(['AKTIVITET','ANTAL','POÄNG','TB'],s.activities.map(a=>[a.name,number(a.count),number(a.points),money(a.tb_ore)]),[M,304,363,422]);
  }else{
    const title={summary:'RESULTATSAMMANSTÄLLNING',seller:'INDIVIDUELL SÄLJARRAPPORT',station:'STATIONSRAPPORT',fight:'BUTIKSFIGHT · SLUTRESULTAT'}[s.type];
    text(title,M,y,23,true);y+=34;
    text(s.type==='fight'?s.title:s.subject?.name??s.station?.name??'Arena-nätverket',M,y,17,true);y+=24;
    text(`${s.period.start} – ${s.period.end}`,M,y,10,false,muted);y+=24;kpis(s.totals);
    if(s.type==='fight'){
      const unit=s.metric==='tb'?'UPPSKATTAT TB':s.metric==='count'?'REGISTRERINGAR':'POÄNG';
      rect(M,y,W-2*M,72,'0.94 0.92 0.85');text(`${s.winner_names.length>1?'OAVGJORT · DELAD SEGER':'VINNARE'} · ${unit}`,M+14,y+12,10,true,gold);
      text(s.winner_names.join(' · ')||'Ingen vinnare',M+14,y+34,19,true);y+=95;
    }
    section(s.type==='fight'?'DELTAGARE OCH SLUTSTÄLLNING':s.type==='seller'?'DITT FRYSTA RESULTAT':'LAGETS RESULTAT');
    table(['PLAC. / NAMN','ANTAL','POÄNG','TB'],s.leaderboard.map(r=>[`${r.rank}. ${r.name}`,number(r.count),number(r.points),money(r.tb_ore)]),[M,304,363,422]);
    if(s.activities.length){section('AKTIVITETER');table(['AKTIVITET','ANTAL','POÄNG','TB'],s.activities.map(a=>[a.name,number(a.count),number(a.points),money(a.tb_ore)]),[M,304,363,422]);}
  }
  if(s.goals.length){section('MÅL OCH UTVECKLING');s.goals.forEach(g=>{ensure(43);text(g.name,M,y,11,true,navy,270);text(`${number(g.points)} / ${number(g.target_points)} poäng`,337,y,10,false,muted,216);rect(M,y+23,W-2*M,4,'0.87 0.88 0.86');rect(M,y+23,(W-2*M)*Math.min(1,Math.max(0,g.target_points?g.points/g.target_points:0)),4,gold);y+=43;});}
  if(s.totals.unknown_tb_count){ensure(40);text(`${s.totals.unknown_tb_count} äldre registreringar saknar historiskt TB.`,M,y,10,false,muted);y+=30;}
  if(y<=724)text('Resultatet är låst. Senare registreringar ändrar inte denna rapport.',M,y+4,9,false,muted);
  pages.forEach((p,i)=>{commands=p;line(M,775,W-2*M);text(`Fryst: ${s.created_at}`,M,786,8,false,muted,420);text(`Rapport-ID: ${s.id}`,M,800,8,false,muted,420);text(`${i+1} / ${pages.length}`,502,794,9,true,navy,60);});
  const objects:string[]=['','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const kids:number[]=[];
  for(const p of pages){const pageId=objects.length+1,streamId=pageId+1;kids.push(pageId);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`);const stream=p.join('\n');objects.push(`<< /Length ${enc.encode(stream).byteLength} >>\nstream\n${stream}\nendstream`);}
  objects[0]='<< /Type /Catalog /Pages 2 0 R >>';objects[1]=`<< /Type /Pages /Count ${kids.length} /Kids [${kids.map(id=>`${id} 0 R`).join(' ')}] >>`;
  const parts:Uint8Array[]=[enc.encode('%PDF-1.4\n')],offsets:number[]=[0];let offset=parts[0].length;
  objects.forEach((obj,i)=>{offsets.push(offset);const bytes=enc.encode(`${i+1} 0 obj\n${obj}\nendobj\n`);parts.push(bytes);offset+=bytes.length;});
  const trailer=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  parts.push(enc.encode(trailer));const result=new Uint8Array(parts.reduce((sum,p)=>sum+p.length,0));let at=0;for(const part of parts){result.set(part,at);at+=part.length;}return result;
}
