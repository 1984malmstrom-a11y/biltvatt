import type {ArenaReportSnapshot,ReportIdentity,ReportTotals} from './arena-reports';
export const awardTypes=[['weekly','VECKANS ETTA'],['monthly','MÅNADENS ETTA'],['individual','INDIVIDUELL VINNARE'],['station','STATIONSVINNARE'],['fight','BUTIKSFIGHT-MÄSTARE'],['league','LIGAMÄSTARE'],['playoffs','SLUTSPELSMÄSTARE'],['cup','CUPMÄSTARE'],['personal-goal','PERSONLIGT MÅL UPPNÅTT'],['station-goal','STATIONSMÅL UPPNÅTT']] as const;
export type AwardVariant=typeof awardTypes[number][0];
export type ArenaAward={variant:AwardVariant;recipient:ReportIdentity;source_report_id:string;context:string;result:string;standing?:{rank:number;played:number;won:number;drawn:number;lost:number;match_points:number}};
export const awardLabel=(variant:AwardVariant)=>awardTypes.find(([v])=>v===variant)![1];
export function awardOptions(s:ArenaReportSnapshot):{variant:AwardVariant;recipient:ReportIdentity}[]{
 if(s.award)return [];if(s.type==='fight'&&(s.winner_ids?s.winner_ids.length!==1:s.winner_names.length!==1))return [];if(s.competition?.rules.contest&&(!s.competition.frozen||s.competition.phase!=='finished'||s.competition.champion_ids.length!==1))return [];
 const out:{variant:AwardVariant;recipient:ReportIdentity}[]=[],add=(variant:AwardVariant,recipient:ReportIdentity)=>out.push({variant,recipient});
 if(s.type==='diploma'&&s.subject&&s.totals.count>0){
  add('individual',s.subject);
  const start=new Date(s.period.start+'T12:00:00Z'),end=new Date(s.period.end+'T12:00:00Z');
  if(start.getUTCDay()===1&&(end.getTime()-start.getTime())===6*86400000)add('weekly',s.subject);
  if(s.period.start.endsWith('-01')&&new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate()===end.getUTCDate()&&s.period.start.slice(0,7)===s.period.end.slice(0,7))add('monthly',s.subject);
 }
 if(s.type==='seller'&&s.subject&&s.goals.some(g=>g.kind==='personal'&&g.seller_id===s.subject!.id&&g.target_points>0&&g.points>=g.target_points))add('personal-goal',s.subject);
 if(s.type==='station'&&s.station&&s.goals.some(g=>g.kind==='station'&&g.target_points>0&&g.points>=g.target_points))add('station-goal',s.station);
 if(s.type==='fight'&&(!s.competition||(s.competition.frozen&&s.competition.phase==='finished'))){
  const variant:AwardVariant=s.competition?.rules.contest?.kind==='station'?'station':s.competition?({league:'league',playoffs:'playoffs',cup:'cup'} as Record<string,AwardVariant>)[s.competition.format]??'fight':'fight';
  for(const row of s.leaderboard)if((s.winner_ids?s.winner_ids.includes(row.id):row.rank===1&&s.winner_names.includes(row.name))&&(!s.competition||s.competition.champion_ids.includes(row.id))){add(variant,{id:row.id,name:row.name});if(variant!=='station')add('station',{id:row.id,name:row.name});}
 }
 return out;
}
export function awardFromSnapshot(s:ArenaReportSnapshot,variant:AwardVariant,recipientId:string,id:string):ArenaReportSnapshot{
 const option=awardOptions(s).find(o=>o.variant===variant&&o.recipient.id===recipientId);if(!option)throw Error('Award kan inte skapas från detta frysta resultat.');
 const row=s.leaderboard.find(r=>r.id===recipientId),standing=s.competition?.entries?undefined:s.competition?.standings.find(r=>r.id===recipientId);
 const totals:ReportTotals=s.type==='fight'&&row?{count:row.count,points:row.points,tb_ore:row.tb_ore,unknown_tb_count:row.unknown_tb_count}:s.totals;
 const fmt=(n:number)=>n.toLocaleString('sv-SE',{maximumFractionDigits:2});
 const result=standing?`#${standing.rank} · ${fmt(standing.match_points)} matchpoäng`:s.scoring_mode==='daily'?`${fmt(row?.match_points??0)} matchpoäng`:s.metric==='tb'?`${fmt(totals.tb_ore/100)} kr TB`:s.metric==='count'?`${fmt(totals.count)} registreringar`:`${fmt(totals.points)} poäng`;
 return {...structuredClone(s),id,title:`${awardLabel(variant)} · ${option.recipient.name}`,source:`award:${s.id}:${variant}:${recipientId}`,totals:structuredClone(totals),award:{variant,recipient:structuredClone(option.recipient),source_report_id:s.id,context:s.competition?.name??s.station?.name??s.title,result,...(standing?{standing:{rank:standing.rank,played:standing.played,won:standing.won,drawn:standing.drawn,lost:standing.lost,match_points:standing.match_points}}:{})}};
}
