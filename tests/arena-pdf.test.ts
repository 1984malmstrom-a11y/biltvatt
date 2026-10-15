import {existsSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {execFileSync,spawnSync} from 'node:child_process';
import {arenaReportPDF} from '../shared/arena-pdf';
import type {ArenaReportSnapshot} from '../shared/arena-reports';
const pdfinfo=existsSync('/usr/bin/pdfinfo')?'/usr/bin/pdfinfo':'pdfinfo',pdftotext=existsSync('/usr/bin/pdftotext')?'/usr/bin/pdftotext':'pdftotext';
const snapshot=(type:ArenaReportSnapshot['type']):ArenaReportSnapshot=>({version:1,id:'frozen-review',type,title:'Höstfinal ÅÄÖ',created_at:'2026-10-15T12:00:00Z',period:{start:'2026-09-01',end:'2026-09-30'},station:{id:'station',name:'Tingsryd'},subject:{id:'person',name:'Åsa Östermalm'},winner_names:['Åsa Östermalm'],metric:'points',source:'frozen-test',totals:{count:87,points:142,tb_ore:1246000,unknown_tb_count:0},leaderboard:[{id:'person',name:'Åsa Östermalm',rank:1,count:87,points:142,tb_ore:1246000,unknown_tb_count:0}],activities:[{name:'Biltvätt',count:87,points:142,tb_ore:1246000}],goals:[{name:'Lagets mål',target_points:100,points:142}]});
for(const type of ['diploma','summary','seller','station','fight'] as const){
 describe(`Actual ${type} PDF bytes`,()=>{
  it('has byte-correct xref, streams, A4 boxes, fonts and deterministic frozen content',()=>{
   const source=snapshot(type),pdf=arenaReportPDF(source),str=Buffer.from(pdf).toString('latin1');expect(arenaReportPDF(source)).toEqual(pdf);
   const offset=Number(str.match(/startxref\n(\d+)/)![1]);expect(str.slice(offset,offset+4)).toBe('xref');
   for(const m of str.matchAll(/(\d{10}) 00000 n/g))expect(str.slice(Number(m[1]))).toMatch(/^\d+ 0 obj/);
   for(const m of str.matchAll(/\/Length (\d+) >>\nstream\n/g)){const start=m.index!+m[0].length;expect(str.slice(start+Number(m[1]),start+Number(m[1])+10)).toBe('\nendstream');}
   expect(str).toContain('/MediaBox [0 0 595.276 841.89]');expect(str).toContain('/Helvetica-Bold');expect(str.length).toBeGreaterThan(4000);
  });
  it.skipIf(spawnSync(pdfinfo,['-v']).error!==undefined)('parses and extracts Swedish text using independent Poppler',()=>{
   const pdf=arenaReportPDF(snapshot(type));const info=execFileSync(pdfinfo,['-'],{input:pdf}).toString();expect(info).toMatch(/A4/);
   const text=execFileSync(pdftotext,['-','-'],{input:pdf}).toString();expect(text).toContain('Åsa Östermalm');expect(text).toContain('Biltvätt');expect(text).toContain('frozen-review');
  });
 });
}
it('handles long hostile names, Unicode, controls and multi-page tables without corrupting syntax',()=>{
 const s=snapshot('summary');s.leaderboard=Array.from({length:150},(_,i)=>({...s.leaderboard[0],rank:i+1,name:'Åsa ) > / \\ ( '+ 'ÖW'.repeat(60)+'\n<script>😀'}));
 const bytes=arenaReportPDF(s);expect(Buffer.from(bytes).toString()).toContain('%%EOF');
 if(!spawnSync(pdftotext,['-v']).error){const r=spawnSync(pdftotext,['-','-'],{input:bytes});expect(r.status).toBe(0);expect(r.stderr.toString()).toBe('');expect(r.stdout.toString()).toContain('150.');}
});
