import {arenaDayStart,arenaNextDay,roundRobin} from './arena-leagues';
import type {ArenaMetric} from './arena-network';
import type {ArenaFight} from './arena-fights';
export const competitionFormats=[['sprint','Sprint','Högst totalresultat under perioden vinner.'],['daily','Dagsserie','Två stationer. Varje dag ger matchpoäng.'],['league','Liga','Alla möter alla, enkel- eller dubbelserie.'],['playoffs','Liga + slutspel','Ligatabellen seedar ett avgörande slutspel.'],['cup','Cup','Direkt utslagning, från första match till final.']] as const;
export type CompetitionFormat=typeof competitionFormats[number][0];
export type FightScope={kind:'all'|'focus'|'category'|'activity';category_id?:string;activity_ids?:Record<string,string>};
export type CompetitionRules={contest?:import("./arena-contest").ContestRules;format:CompetitionFormat;metric:ArenaMetric;station_ids:string[];start_day:string;end_day:string;double_round:boolean;playoff_size:2|4|8;match_days:number;win:number;draw:number;secondary_metric:ArenaMetric;tie_rule:'secondary'|'seed'|'sudden-death';scope:FightScope};
export type CompetitionInput=CompetitionRules&{name:string;request_id:string};
export type CompetitionMatch={tie_break_reason?:string;id:string;round:number;day:string;stage:'league'|'knockout'|'direct';slot:number;home_id:string;away_id:string;home_name:string;away_name:string;phase:ArenaFight['phase'];score:number[];winner_ids:string[];sudden_death?:boolean;start_at:string;end_at:string};
export type CompetitionStanding={id:string;name:string;rank:number;played:number;won:number;drawn:number;lost:number;match_points:number;metric_for:number;metric_against:number;seed:number};
export type Competition={entries?:import("./arena-contest").ContestEntry[];entry_count?:number;temporary_activities?:import("./arena").ArenaFightActivity[];paused_reason?:string;catching_up?:boolean;station_id?:string;id:string;name:string;format:CompetitionFormat;rules:CompetitionRules;phase:ArenaFight['phase'];matches:CompetitionMatch[];standings:CompetitionStanding[];bracket:{round:number;slot:number;home_id:string|null;away_id:string|null;fight_id:string|null;winner_id:string|null}[];champion_ids:string[];frozen:boolean;cancelled?:{reason:string;at:string;actor:string};own_match?:ArenaFight|null};
export type FightChallenge={activity_suggestions?:{id:string;name:string}[];id:string;challenger_id:string;challenged_id:string;challenger_name:string;challenged_name:string;day:string;status:string;rules:CompetitionRules&{activity_snapshots?:{id:string;station_id:string;name:string;arena_category_id:string|null}[]};competition_id:string|null;response?:{reason?:string};busy?:string};
export type FightNotice={id:string;kind:string;title:string;body:string;resource_id:string;read_at:string|null};
export type FightCenter={station_id:string;competitions:{id:string;name:string;format:CompetitionFormat;phase:string}[];challenges:FightChallenge[];notifications:FightNotice[];incoming:number;stations:{id:string;name:string}[];activities:{id:string;name:string;arena_category_id:string|null;category:string}[];bookings:{station_id:string;start_at:string;end_at:string;name:string}[];categories:{id:string;name:string}[]};
export function competitionSchedule(r:CompetitionRules){
 if(!competitionFormats.some(f=>f[0]===r.format))throw Error('Välj tävlingsformat.');
 const board=r.contest&&['individual','station'].includes(r.contest.kind);const n=r.station_ids.length;if(board){if(r.format!=='sprint'||n<1||n>100||new Set(r.station_ids).size!==n)throw Error('Topplistetävling kräver 1–100 olika stationer och totalformat.');if(!r.start_day||!r.end_day||arenaDayStart(r.end_day)<arenaDayStart(r.start_day)||Date.parse(arenaDayStart(r.end_day))-Date.parse(arenaDayStart(r.start_day))>365*86400000)throw Error('Välj giltig tävlingsperiod, högst ett år.');return [];}if(r.contest?.kind==='fight'&&n!==2)throw Error('En Butiksfight har exakt två stationer.');if(r.contest?.kind==='championship'&&['sprint','daily'].includes(r.format))throw Error('Välj liga, cup eller slutspel för mästerskap.');if(new Set(r.station_ids).size!==n||n<2||n>(r.contest?40:16))throw Error('Välj 2–16 olika stationer.');
 if(r.format==='daily'&&n!==2)throw Error('Dagsserie har exakt två stationer.');
 if(r.format==='cup'&&![2,4,8].includes(n))throw Error('Cup kräver 2, 4 eller 8 stationer.');
 if(r.format==='playoffs'&&(![2,4,8].includes(r.playoff_size)||r.playoff_size>n))throw Error('Slutspelet måste ha 2, 4 eller 8 platser, högst antal deltagare.');
 if(!Number.isInteger(r.match_days)||r.match_days<1||r.match_days>14)throw Error('En matchperiod är 1–14 kalenderdagar.');
 if(!Number.isFinite(r.win)||r.win<=0||r.win>100||!Number.isFinite(r.draw)||r.draw<0||r.draw>r.win||r.win*2%1||r.draw*2%1)throw Error('Matchpoäng anges i halva steg; oavgjort får inte ge mer än vinst.');
 if(arenaDayStart(r.end_day)<arenaDayStart(r.start_day)||Date.parse(arenaDayStart(r.end_day))-Date.parse(arenaDayStart(r.start_day))>365*86400000)throw Error('Välj giltig period, högst ett år.');
 if(r.format==='sprint'||r.format==='daily')return [];
 if(r.format==='cup')return [];
 const first=roundRobin(r.station_ids,r.start_day,r.contest?40:16);const rounds=Math.max(...first.map(f=>f.round));
 const schedule=first.map(f=>({...f,day:arenaNextDay(r.start_day,(f.round-1)*r.match_days)}));
 if(r.double_round)schedule.push(...schedule.map(f=>({...f,round:f.round+rounds,day:arenaNextDay(f.day,rounds*r.match_days),home:f.away,away:f.home})));
 return schedule;
}
export function bracketSeeds(size:number):number[]{if(![2,4,8].includes(size))throw Error('Välj 2, 4 eller 8 platser.');let seeds=[1,2];while(seeds.length<size){const total=seeds.length*2+1;seeds=seeds.flatMap(s=>[s,total-s]);}return seeds;}
export function competitionEnd(r:CompetitionRules){const plan=competitionSchedule(r),rounds=plan.length?Math.max(...plan.map(p=>p.round)):0;return r.format==='sprint'||r.format==='daily'?arenaNextDay(r.end_day):arenaNextDay(r.start_day,(rounds+(r.format==='cup'?Math.log2(r.station_ids.length):r.format==='playoffs'?Math.log2(r.playoff_size):0))*r.match_days);}
export function competitionByes(r:CompetitionRules){const plan=competitionSchedule(r);return [...new Set(plan.map(p=>p.round))].flatMap(round=>r.station_ids.filter(id=>!plan.some(p=>p.round===round&&(p.home===id||p.away===id))).map(station_id=>({round,station_id,day:plan.find(p=>p.round===round)!.day})));}
export function overlap(a:string,b:string,c:string,d:string){return a<d&&b>c;}
export const competitionMetricLabel=(metric:ArenaMetric)=>({points:'POÄNG',tb:'TB',count:'ANTAL REGISTRERINGAR'})[metric];
export const competitionDayLabel=(day:string)=>new Intl.DateTimeFormat('sv-SE',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Stockholm'}).format(new Date(`${day}T12:00:00Z`));
export function competitionMonthEnd(day:string){arenaDayStart(day);const original=new Date(`${day}T12:00:00Z`),date=new Date(original);date.setUTCDate(1);date.setUTCMonth(original.getUTCMonth()+2);date.setUTCDate(0);date.setUTCDate(Math.min(original.getUTCDate(),date.getUTCDate()));return arenaNextDay(date.toISOString().slice(0,10),-1);}
