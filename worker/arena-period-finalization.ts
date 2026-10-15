import {freezeStationReport,freezeFightReport,freezeCompetitionReport} from './arena-reports';
import {arenaFightView} from './arena-fights';
import {competitionView} from './arena-competitions';
import {stockholmDay,addDays} from './stats';
import {goalBounds} from './arena-model';
import {awardFromSnapshot,awardOptions} from '../shared/arena-awards';
import type {ArenaReportSnapshot} from '../shared/arena-reports';
import {tokenHash} from '../shared/arena-crypto';
export async function freezeReportAwards(db:D1Database,sourceId:string){
 const row=await db.prepare('SELECT snapshot_json,station_id,fight_id,competition_id FROM arena_reports WHERE id=?').bind(sourceId).first<{snapshot_json:string;station_id:string|null;fight_id:string|null;competition_id:string|null}>();if(!row)return;
 const done=await db.prepare('SELECT source_report_id FROM arena_award_finalization WHERE source_report_id=?').bind(sourceId).first();if(done)return;
 const original=JSON.parse(row.snapshot_json) as ArenaReportSnapshot;
 for(const o of awardOptions(original)){
 const id='award-'+await tokenHash(`${original.id}:${o.variant}:${o.recipient.id}`),s=awardFromSnapshot(original,o.variant,o.recipient.id,id);
 await db.prepare('INSERT OR IGNORE INTO arena_reports(id,source_key,station_id,fight_id,competition_id,report_type,title,snapshot_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,s.source,row.station_id,row.fight_id,row.competition_id,s.type,s.title,JSON.stringify(s),s.created_at).run();
 }
 await db.prepare('INSERT OR IGNORE INTO arena_award_finalization(source_report_id) VALUES(?)').bind(sourceId).run();
}
const nextMonth=(day:string)=>{const d=new Date(day+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1,1);return d.toISOString().slice(0,10);};
// Explicit local/library entry point only. No scheduled handler or remote trigger.
// Each call is bounded by stations (10), work units (1..10), snapshot size and the
// existing competition catch-up bound. Cursors update after all writes succeed.
export async function processEndedArenaPeriods(db:D1Database,now=new Date(),budget=4){
 if(!Number.isInteger(budget)||budget<1||budget>10||!Number.isFinite(now.getTime())||now.getTime()>Date.now())throw Error('Ogiltig maintenance-budget eller framtida tid.');
 const today=stockholmDay(now),stations=await db.prepare(`SELECT s.id station_id,(SELECT MIN(r.registered_at) FROM arena_registrations r WHERE r.station_id=s.id) first_at FROM arena_stations s WHERE (NOT EXISTS(SELECT 1 FROM arena_period_finalization p WHERE p.station_id=s.id AND p.kind='week') OR NOT EXISTS(SELECT 1 FROM arena_period_finalization p WHERE p.station_id=s.id AND p.kind='month')) AND EXISTS(SELECT 1 FROM arena_registrations r WHERE r.station_id=s.id) ORDER BY s.id LIMIT 10`).all<{station_id:string;first_at:string}>();
 for(const st of stations.results){const day=stockholmDay(new Date(st.first_at)),weekday=new Date(day+'T12:00:00Z').getUTCDay();for(const [kind,start]of[['week',addDays(day,-((weekday+6)%7))],['month',day.slice(0,7)+'-01']])await db.prepare('INSERT OR IGNORE INTO arena_period_finalization(station_id,kind,next_start) VALUES(?,?,?)').bind(st.station_id,kind,start).run();}
 let processed=0;
 while(processed<budget){
 const job=await db.prepare('SELECT station_id,kind,next_start FROM arena_period_finalization WHERE next_start<? ORDER BY next_start,station_id,kind LIMIT 1').bind(today).first<{station_id:string;kind:string;next_start:string}>();if(!job)break;
 const next=job.kind==='month'?nextMonth(job.next_start):addDays(job.next_start,7);if(next>today){
 // Incomplete period must not starve a completed period of the other kind.
 const available=await db.prepare("SELECT station_id,kind,next_start FROM arena_period_finalization WHERE (kind='week' AND next_start<=?) OR (kind='month' AND next_start<?) ORDER BY next_start,station_id,kind LIMIT 1").bind(addDays(today,-7),today.slice(0,7)+'-01').first<typeof job>();if(!available)break;Object.assign(job,available);
 }
 const endExclusive=job.kind==='month'?nextMonth(job.next_start):addDays(job.next_start,7),end=addDays(endExclusive,-1);
 const exists=await db.prepare('SELECT id FROM arena_registrations WHERE station_id=? AND registered_at>=? AND registered_at<? LIMIT 1').bind(job.station_id,...goalBounds(job.next_start,end)).first();
 if(exists)for(const type of ['summary','diploma'] as const){const r=await freezeStationReport(db,job.station_id,{type,start:job.next_start,end});await freezeReportAwards(db,r.id);}
 await db.prepare('UPDATE arena_period_finalization SET next_start=? WHERE station_id=? AND kind=? AND next_start=?').bind(endExclusive,job.station_id,job.kind,job.next_start).run();processed++;
 }
 // Independent bounded lanes prevent old monthly backfill from starving goals,
 // campaigns and competitions. One item per lane, safely repeatable on failures.
 const goals=await db.prepare(`SELECT g.id,g.station_id,g.seller_id,g.start_date,g.end_date FROM (SELECT id,station_id,seller_id,start_date,end_date FROM arena_personal_goals UNION ALL SELECT id,station_id,NULL,start_date,end_date FROM arena_station_goals) g WHERE g.end_date<? AND NOT EXISTS(SELECT 1 FROM arena_reports r WHERE r.source_key='goal:'||g.id) ORDER BY g.end_date,g.id LIMIT 1`).bind(today).all<{id:string;station_id:string;seller_id:string|null;start_date:string;end_date:string}>();
 for(const g of goals.results){const r=await freezeStationReport(db,g.station_id,{type:g.seller_id?'seller':'station',start:g.start_date,end:g.end_date,...(g.seller_id?{seller_id:g.seller_id}:{}),source:`goal:${g.id}`});await freezeReportAwards(db,r.id);}
 const campaign=await db.prepare("SELECT id,station_id,activity_id,start_at,end_at FROM arena_campaigns c WHERE end_at<=? AND NOT EXISTS(SELECT 1 FROM arena_reports r WHERE r.source_key='campaign:'||c.id) ORDER BY end_at,id LIMIT 1").bind(now.toISOString()).first<{id:string;station_id:string;activity_id:string;start_at:string;end_at:string}>();
 if(campaign)await freezeStationReport(db,campaign.station_id,{type:'summary',start:stockholmDay(new Date(campaign.start_at)),end:stockholmDay(new Date(Date.parse(campaign.end_at)-1)),activity_id:campaign.activity_id,source:`campaign:${campaign.id}`});
 const markAttempt=async(kind:string,id:string)=>db.prepare('INSERT INTO arena_finalization_attempts(resource_type,resource_id,attempt_order) VALUES(?,?,(SELECT COALESCE(MAX(attempt_order),0)+1 FROM arena_finalization_attempts)) ON CONFLICT(resource_type,resource_id) DO UPDATE SET attempt_order=excluded.attempt_order').bind(kind,id).run();
 const fight=await db.prepare("SELECT id FROM arena_fights f WHERE f.end_at<=? AND f.status<>'cancelled' AND NOT EXISTS(SELECT 1 FROM arena_reports r WHERE r.source_key='fight:'||f.id) ORDER BY COALESCE((SELECT attempt_order FROM arena_finalization_attempts a WHERE a.resource_type='fight' AND a.resource_id=f.id),0),end_at,id LIMIT 1").bind(now.toISOString()).first<{id:string}>();
 if(fight){await markAttempt('fight',fight.id);await freezeFightReport(db,await arenaFightView(db,fight.id,now));await freezeReportAwards(db,`fight-${fight.id}`);}
 const competition=await db.prepare("SELECT id FROM arena_leagues c WHERE c.request_key IS NOT NULL AND c.end_day<? AND c.status<>'cancelled' AND NOT EXISTS(SELECT 1 FROM arena_reports r WHERE r.source_key='competition:'||c.id) ORDER BY COALESCE((SELECT attempt_order FROM arena_finalization_attempts a WHERE a.resource_type='competition' AND a.resource_id=c.id),0),end_day,id LIMIT 1").bind(today).first<{id:string}>();
 if(competition){await markAttempt('competition',competition.id);const c=await competitionView(db,competition.id,undefined,now);await freezeCompetitionReport(db,c);await freezeReportAwards(db,`competition-${c.id}`);}
 const pendingAwards=await db.prepare("SELECT id FROM arena_reports r WHERE json_extract(r.snapshot_json,'$.award') IS NULL AND NOT EXISTS(SELECT 1 FROM arena_award_finalization a WHERE a.source_report_id=r.id) ORDER BY created_at,id LIMIT ?").bind(budget).all<{id:string}>();for(const r of pendingAwards.results)await freezeReportAwards(db,r.id);
 return {award_units:pendingAwards.results.length,period_units:processed,goal_units:goals.results.length,campaign_units:campaign?1:0,fight_units:fight?1:0,competition_units:competition?1:0,more_periods:processed===budget};
}
