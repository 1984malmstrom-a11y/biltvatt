import {sampleReport} from './arena-release-fixture';
import {competitionSample} from './arena-competition-fixture';
import {awardFromSnapshot,type AwardVariant} from '../shared/arena-awards';
import type {ArenaReportSnapshot} from '../shared/arena-reports';
export function awardSource(variant:AwardVariant):ArenaReportSnapshot{
 const station=variant==='station-goal',goal=variant==='personal-goal';
 const s=sampleReport(station?'station':goal?'seller':['station','fight','league','playoffs','cup'].includes(variant)?'fight':'diploma');
 if(variant==='individual'){s.subject!.name='Åsa Östermalm';s.leaderboard[0].name=s.subject!.name;s.winner_names=[s.subject!.name];}
 s.id='hardening-'+variant;s.title=station?'Stationens oktoberresultat':s.title;
 s.goals=[{kind:goal?'personal':'station',seller_id:goal?s.subject!.id:null,name:goal?s.subject!.name:'Lagets mål',points:s.totals.points,target_points:140}];
 if(variant==='weekly')s.period={start:'2026-10-05',end:'2026-10-11'};
 if(['league','playoffs','cup'].includes(variant)){
 const c=competitionSample(variant==='league'?'league':variant==='cup'?'cup':'playoffs','finished');c.phase='finished';c.frozen=true;c.champion_ids=[c.standings[0].id];s.competition=c;s.winner_names=[c.standings[0].name];s.winner_ids=[c.standings[0].id];s.leaderboard=c.standings.map((r,i)=>({id:r.id,name:r.name,rank:i+1,count:87-i*5,points:142-i*8,tb_ore:1246000-i*20000,unknown_tb_count:0}));
 }
 return s;
}
export function awardExample(variant:AwardVariant):ArenaReportSnapshot{const s=awardSource(variant),recipient=['station','fight','league','playoffs','cup'].includes(variant)?s.leaderboard[0].id:variant==='station-goal'?s.station!.id:s.subject!.id;return awardFromSnapshot(s,variant,recipient,'award-review-'+variant);}
