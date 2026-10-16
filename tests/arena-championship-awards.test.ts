import {describe,it,expect} from 'vitest';
import {execFileSync,spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {arenaAwardPDF} from '../shared/arena-award-pdf';
import {arenaAwardScene,awardTemplate,awardDuel,awardTextWidth} from '../shared/arena-award-scene';
import {championshipAwardExample} from './arena-award-template-fixture';
import {competitionSample} from '../e2e/arena-competition-fixture';
const templates=['individual','duel','championship'] as const;
const poppler=Object.fromEntries(['pdfinfo','pdftotext'].map(t=>[t,existsSync('/usr/bin/'+t)?'/usr/bin/'+t:t]));
const hasPoppler=['pdfinfo','pdftotext'].every(t=>!spawnSync(poppler[t],['-v'],{timeout:3000}).error);
// Poppler stdin can block on embedded binary images; use a bounded temporary file.
const inspect=(pdf:Uint8Array,tool='pdftotext')=>{const dir=mkdtempSync(join(tmpdir(),'arena-award-'));try{const path=join(dir,'award.pdf');writeFileSync(path,pdf);return execFileSync(poppler[tool],tool==='pdftotext'?[path,'-']:[path],{timeout:10000}).toString();}finally{rmSync(dir,{recursive:true,force:true});}};
const extract=(pdf:Uint8Array)=>[...Buffer.from(pdf).toString('latin1').matchAll(/<([0-9a-f]+)> Tj/g)].map(m=>new TextDecoder('windows-1252').decode(Buffer.from(m[1],'hex'))).join('\n');
describe('Three cinematic frozen championship templates',()=>{
 for(const template of templates)it(`${template}: one A4, Swedish searchable text, embedded art, byte-correct resources and deterministic re-export`,()=>{
  const s=championshipAwardExample(template),pdf=arenaAwardPDF(s),raw=Buffer.from(pdf).toString('latin1'),text=extract(pdf);
  expect(awardTemplate(s)).toBe(template);expect(arenaAwardPDF(structuredClone(s))).toEqual(pdf);
  expect(raw).toContain('/Count 1');
  expect(raw).toContain('/MediaBox [0 0 595.276 841.89]');expect(raw).toContain('/Subtype /Image');expect(raw).toContain('/DCTDecode');
  for(const m of raw.matchAll(/(\d{10}) 00000 n/g))expect(raw.slice(Number(m[1]))).toMatch(/^\d+ 0 obj/);
  for(const m of raw.matchAll(/\/Length (\d+) >>\nstream\n/g)){const start=m.index!+m[0].length;expect(raw.slice(start+Number(m[1]),start+Number(m[1])+10)).toBe('\nendstream');}
  expect(text).toContain(s.award!.recipient.name);expect(text).toContain(s.award!.source_report_id);
  expect(text).not.toContain('SYNTETISKA DATA');expect(extract(arenaAwardPDF(s,{testPreview:true}))).toContain('TESTFÖRHANDSVISNING');
  expect(text).not.toContain('STATIONSCHEF');expect(text).not.toContain('REGIONCHEF');expect(text).not.toContain('ÖKNING');
 });
 for(const template of templates)it.skipIf(!hasPoppler)(`${template}: independent Poppler parses A4 and Swedish text`,()=>{const s=championshipAwardExample(template),pdf=arenaAwardPDF(s);expect(inspect(pdf,'pdfinfo')).toMatch(/Pages:\s+1/);expect(inspect(pdf,'pdfinfo')).toContain('A4');const text=inspect(pdf);expect(text).toContain(s.award!.recipient.name);expect(text).toContain('SÄLJ MER. TILLSAMMANS.');expect(text).toContain(s.award!.source_report_id);});
 it('individual: only frozen KPIs; a station goal is never claimed as personal goal fulfilment',()=>{
  const s=championshipAwardExample('individual');let text=extract(arenaAwardPDF(s));expect(text).toContain('114 %');expect(text).toContain('342');expect(text).toContain('248');expect(text).not.toContain('1 / 12');
  s.goals[0].kind='station';text=extract(arenaAwardPDF(s));expect(text).not.toContain('MÅLUPPFYLLELSE');expect(text).toContain('UPPSKATTAT TB');
  s.goals[0].kind='personal';s.goals[0].seller_id='another-seller';expect(extract(arenaAwardPDF(s))).not.toContain('MÅLUPPFYLLELSE');
 });
 it('duel: winner first, both frozen stations, actual final scores, unit and difference',()=>{
  const s=championshipAwardExample('duel');s.leaderboard.reverse();const d=awardDuel(s);expect(d.rows[0].name).toBe('Tingsryd');expect(d.scores).toEqual([248,230]);
  const text=extract(arenaAwardPDF(s));for(const value of ['VS','Ronneby','248','230','18','DIFFERENS'])expect(text).toContain(value);
 });
 it('daily duels use frozen match points; sprint duels use the frozen direct match, not aggregate sales',()=>{
  const s=championshipAwardExample('duel'),c=competitionSample('daily','finished');
  c.standings=s.leaderboard.map((r,i)=>({...c.standings[0],id:r.id,name:r.name,match_points:i?2.5:3.5}));s.competition=c;
  expect(awardDuel(s).scores).toEqual([3.5,2.5]);expect(awardDuel(s).unit).toBe('MATCHPOÄNG');
  c.format='sprint';c.matches=[{...c.matches[0],stage:'direct',phase:'finished',home_id:s.leaderboard[1].id,away_id:s.leaderboard[0].id,score:[17,19]}];expect(awardDuel(s).scores).toEqual([19,17]);
  c.format='daily';c.standings=[];expect(()=>arenaAwardPDF(s)).toThrow(/slutpoäng saknas/);
 });
 it('a two-station cup still has only a championship winner, no opponents or match scores',()=>{
  const s=championshipAwardExample('championship');s.leaderboard=s.leaderboard.slice(0,2);const text=extract(arenaAwardPDF(s));
  expect(awardTemplate(s)).toBe('championship');expect(text).not.toContain(s.leaderboard[1].name);expect(text).not.toMatch(/\bVS\b|DIFFERENS|FINALRESULTAT|MATCHPOÄNG/);
 });
 it('wraps long Swedish names and keeps all text inside the printable A4 safe area',()=>{
  for(const template of templates){const s=championshipAwardExample(template);s.award!.recipient.name='Åsa Ann-Christine Östermalm Andersson Söderström';if(template==='duel')s.leaderboard[0].name=s.award!.recipient.name;
   const scene=arenaAwardScene(s);for(const op of scene.ops)if(op.kind==='text'){expect(op.x).toBeGreaterThanOrEqual(24);expect(op.x+awardTextWidth(op.value,op.size,op.bold)).toBeLessThanOrEqual(572);expect(op.y+op.size).toBeLessThan(830);}
   const text=extract(arenaAwardPDF(s)).replace(/\s+/g,' ');expect(text).toContain(s.award!.recipient.name);
  }
 });
 it('marks a shared winner honestly instead of inventing an exclusive victory',()=>{
  const s=championshipAwardExample('duel');s.winner_ids=s.leaderboard.map(r=>r.id);s.leaderboard[1].points=248;expect(extract(arenaAwardPDF(s))).toContain('DELAD SEGER');
 });
});
