import type {ArenaReportSnapshot} from './arena-reports';
// Small deterministic PDF 1.4 writer. Embedded data is a frozen server snapshot,
// never HTML or live API results. Standard Helvetica uses WinAnsiEncoding (ÅÄÖ).
function winAnsi(text:string){return [...text].map(c=>{const n=c.codePointAt(0)!;return n<=255?n:c==='–'||c==='—'?45:c==='’'?39:c==='•'?183:63;});}
const hexText=(text:string)=>winAnsi(text).map(n=>n.toString(16).padStart(2,'0')).join('');
const money=(ore:number)=>`${(ore/100).toFixed(2).replace('.',',')} kr TB`;
export function reportLines(s:ArenaReportSnapshot){return [s.title,'ARENAN | Människor. Motivation. Resultat.',s.station?.name??'Arena-nätverket',`${s.period.start} - ${s.period.end}`,s.subject?`Säljare: ${s.subject.name}`:'',s.activity?`Aktivitet: ${s.activity.name}`:'',`Vinnare: ${s.winner_names.join(', ')||'Ingen vinnare'}`,`${s.totals.count} registreringar | ${s.totals.points} poäng | ${money(s.totals.tb_ore)}`,s.totals.unknown_tb_count?`${s.totals.unknown_tb_count} historiska registreringar saknar TB.`:'','RESULTAT',...s.leaderboard.map(r=>`${r.rank}. ${r.name} | ${r.count} st | ${r.points} p | ${money(r.tb_ore)}`),'AKTIVITETER',...s.activities.map(a=>`${a.name} | ${a.count} st | ${a.points} p | ${money(a.tb_ore)}`),'MÅL',...s.goals.map(g=>`${g.name}: ${g.points} / ${g.target_points} poäng`),'',`Fryst snapshot: ${s.created_at}`,`Rapport-ID: ${s.id}`,'Resultatet ändras inte av framtida registreringar eller namnändringar.'].filter(Boolean);}
export function arenaReportPDF(snapshot:ArenaReportSnapshot):Uint8Array{
  const lines=reportLines(snapshot).flatMap(line=>{const chunks:string[]=[];for(let i=0;i<line.length;i+=94)chunks.push(line.slice(i,i+94));return chunks;}),pages:string[][]=[];
  for(let i=0;i<lines.length;i+=43)pages.push(lines.slice(i,i+43));
  const objects:string[]=['',''];
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids:number[]=[];
  for(const [pageNo,page] of pages.entries()){
    const pageId=objects.length+1,streamId=pageId+1;kids.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`);
    const commands=['1 1 1 rg 0 0 595 842 re f','0.88 0.76 0.46 rg 40 785 515 2 re f','BT /F1 11 Tf 16 TL 0.04 0.08 0.13 rg 42 758 Td',...page.map((line,i)=>`${i?'T* ':''}<${hexText(line)}> Tj`),'ET',`BT /F1 9 Tf 0.3 0.36 0.42 rg 42 32 Td <${hexText(`ARENAN | ${pageNo+1} / ${pages.length}`)}> Tj ET`].join('\n');
    objects.push(`<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`);
  }
  objects[0]='<< /Type /Catalog /Pages 2 0 R >>';objects[1]=`<< /Type /Pages /Count ${kids.length} /Kids [${kids.map(id=>`${id} 0 R`).join(' ')}] >>`;
  let pdf='%PDF-1.4\n',offsets=[0];for(const [i,object] of objects.entries()){offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;}
  const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from([...pdf].map(c=>c.charCodeAt(0)));
}
