// Synthetic frozen snapshots, exclusively for tests and visibly labelled previews.
import {awardSource} from '../e2e/arena-hardening-fixture';
import {awardFromSnapshot} from '../shared/arena-awards';
import type {AwardTemplate} from '../shared/arena-award-scene';
export function championshipAwardExample(template:AwardTemplate){
 const s=awardSource(template==='individual'?'monthly':template==='duel'?'fight':'cup');
 s.id=`synthetic-${template}-source`;s.source='synthetic-preview-only';s.created_at='2026-10-01T08:00:00Z';s.period={start:'2026-09-01',end:'2026-09-30'};
 if(template==='individual'){
  s.subject!.name='Lisa Andersson';s.leaderboard=Array.from({length:12},(_,i)=>({...s.leaderboard[0],id:i?`seller-${i}`:s.subject!.id,name:i?`Testsäljare ${i}`:s.subject!.name,rank:i+1,count:248-i*10,points:342-i*15,tb_ore:513800-i*10000}));
  s.totals={count:248,points:342,tb_ore:513800,unknown_tb_count:0};s.winner_ids=[s.subject!.id];s.winner_names=[s.subject!.name];
  s.activities=[{name:'Biltvätt',count:94,points:188,tb_ore:329000},{name:'Kaffe + bulle',count:154,points:154,tb_ore:184800}];
  s.goals=[{kind:'personal',seller_id:s.subject!.id,name:'Personligt septembermål',target_points:300,points:342}];
 }else if(template==='duel'){
  s.leaderboard=s.leaderboard.slice(0,2).map((r,i)=>({...r,name:i?'Ronneby':'Tingsryd',rank:i+1,count:i?115:124,points:i?230:248,tb_ore:i?402500:434000}));s.winner_ids=[s.leaderboard[0].id];s.winner_names=[s.leaderboard[0].name];
 }else{s.competition!.name='Arena Cup · September';}
 const variant=template==='individual'?'monthly':template==='duel'?'fight':'cup';
 return awardFromSnapshot(s,variant,template==='individual'?s.subject!.id:s.leaderboard[0].id,`synthetic-${template}-award`);
}
