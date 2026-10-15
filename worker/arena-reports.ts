import type {ArenaReportSnapshot,ArenaReportType,ReportRow,ReportTotals,ReportIdentity} from '../shared/arena-reports';
import type {ArenaFight} from '../shared/arena-fights';
import {roundedPoints} from '../shared/arena';
import {arenaReportPDF} from '../shared/arena-pdf';
import {goalBounds} from './arena-model';
import {stockholmDay,addDays,dateRange} from './stats';
import {body,checkFields,fail,json,text} from './http';
import {audit,type ArenaActor} from './arena-audit';
import {tokenHash} from '../shared/arena-crypto';
const empty=():ReportTotals=>({count:0,points:0,tb_ore:0,unknown_tb_count:0});
const add=(a:ReportTotals,b:ReportTotals)=>({count:a.count+b.count,points:roundedPoints(a.points+b.points),tb_ore:a.tb_ore+b.tb_ore,unknown_tb_count:a.unknown_tb_count+b.unknown_tb_count});
async function persist(db:D1Database,source:string,s:ArenaReportSnapshot,fight:string|null=null){
  await db.prepare('INSERT OR IGNORE INTO arena_reports(id,source_key,station_id,fight_id,report_type,title,snapshot_json,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(s.id,source,s.station?.id??null,fight,s.type,s.title,JSON.stringify(s),s.created_at).run();
  return db.prepare('SELECT id FROM arena_reports WHERE source_key=?').bind(source).first<{id:string}>();
}
export async function freezeStationReport(db:D1Database,station:string,input:{type:Exclude<ArenaReportType,'fight'>;start:string;end:string;seller_id?:string;activity_id?:string;source?:string}){
  let range;try{range=dateRange(new URL(`https://arena.test/?${new URLSearchParams({period:'custom',start:input.start,end:input.end})}`));}catch{return fail(400,'Välj en giltig avslutad period, högst 367 dagar.');}
  const {from,to}=range;if(Date.parse(to)>Date.now())fail(409,'Rapporter kan bara frysas för avslutade perioder.');
  const source=input.source??`${station}:${input.type}:${input.start}:${input.end}:${input.seller_id??''}:${input.activity_id??''}`;
  const existing=await db.prepare('SELECT id FROM arena_reports WHERE source_key=?').bind(source).first<{id:string}>();if(existing)return existing;
  const st=await db.prepare('SELECT id,name FROM arena_stations WHERE id=?').bind(station).first<{id:string;name:string}>();if(!st)fail(404,'Stationen finns inte.');
  const seller=input.seller_id?await db.prepare(`SELECT id,name,avatar_index,CASE WHEN profile_image_id IS NOT NULL THEN '/api/arena/portraits/'||profile_image_id END profile_url FROM arena_sellers WHERE id=? AND station_id=?`).bind(input.seller_id,station).first<ReportIdentity>():null;
  if(input.type==='seller'&&!seller)fail(404,'Säljaren finns inte på stationen.');
  const activity=input.activity_id?await db.prepare('SELECT id,name FROM arena_activities WHERE id=? AND station_id=?').bind(input.activity_id,station).first<{id:string;name:string}>():null;
  if(input.activity_id&&!activity)fail(404,'Aktiviteten finns inte på stationen.');
  const rows=await db.prepare(`SELECT s.id,s.name,s.avatar_index,CASE WHEN s.profile_image_id IS NOT NULL THEN '/api/arena/portraits/'||s.profile_image_id END profile_url,COUNT(r.id) count,COALESCE(SUM(r.points_awarded),0) points,COALESCE(SUM(r.tb_ore_awarded),0) tb_ore,COALESCE(SUM(r.tb_ore_awarded IS NULL),0) unknown_tb_count FROM arena_registrations r JOIN arena_sellers s ON s.id=r.seller_id AND s.station_id=r.station_id WHERE r.station_id=? AND r.registered_at>=? AND r.registered_at<? AND (r.voided_at IS NULL OR r.voided_at>=?) AND (? IS NULL OR r.activity_id=?) GROUP BY s.id ORDER BY points DESC,count DESC,s.name,s.id`).bind(station,from,to,to,input.activity_id??null,input.activity_id??null).all<ReportRow>();
  const board=rows.results.map((r,i)=>({...r,rank:i+1,points:roundedPoints(r.points)}));
  const subject=seller??(input.type==='diploma'?board[0]:null);
  const selected=seller?board.filter(r=>r.id===seller.id):input.type==='diploma'?board.slice(0,1):board;
  const activities=await db.prepare(`SELECT a.name,COUNT(*) count,SUM(r.points_awarded) points,COALESCE(SUM(r.tb_ore_awarded),0) tb_ore FROM arena_registrations r JOIN arena_activities a ON a.id=r.activity_id AND a.station_id=r.station_id WHERE r.station_id=? AND r.registered_at>=? AND r.registered_at<? AND (r.voided_at IS NULL OR r.voided_at>=?) AND (? IS NULL OR r.seller_id=?) AND (? IS NULL OR r.activity_id=?) GROUP BY a.id ORDER BY count DESC,a.name`).bind(station,from,to,to,subject?.id??null,subject?.id??null,input.activity_id??null,input.activity_id??null).all<ArenaReportSnapshot['activities'][number]>();
  const goals=await db.prepare(`SELECT 'Lagets mål' name,g.target_points,COALESCE((SELECT SUM(points_awarded) FROM arena_registrations WHERE station_id=g.station_id AND registered_at>=? AND registered_at<? AND (voided_at IS NULL OR voided_at>=?)),0) points FROM arena_station_goals g WHERE g.station_id=? AND g.start_date=? AND g.end_date=? UNION ALL SELECT s.name,p.target_points,COALESCE((SELECT SUM(points_awarded) FROM arena_registrations WHERE station_id=p.station_id AND seller_id=p.seller_id AND registered_at>=? AND registered_at<? AND (voided_at IS NULL OR voided_at>=?)),0) FROM arena_personal_goals p JOIN arena_sellers s ON s.id=p.seller_id WHERE p.station_id=? AND p.start_date=? AND p.end_date=? AND (? IS NULL OR p.seller_id=?)`).bind(from,to,to,station,input.start,input.end,from,to,to,station,input.start,input.end,subject?.id??null,subject?.id??null).all<ArenaReportSnapshot['goals'][number]>();
  const labels={diploma:'VINNARDIPLOM',summary:'RESULTATSAMMANSTÄLLNING',seller:'MIN ARENA · RESULTAT',station:'STATIONENS RESULTAT'};
  const s:ArenaReportSnapshot={version:1,id:crypto.randomUUID(),type:input.type,title:labels[input.type],created_at:new Date().toISOString(),period:{start:input.start,end:input.end},station:st!,...(seller?{subject:seller}:{}),...(activity?{activity}:{}),totals:selected.reduce(add,empty()),leaderboard:input.type==='diploma'?board.slice(0,1):selected,activities:activities.results,goals:goals.results,winner_names:board.slice(0,1).map(r=>r.name),metric:'points',source};
  if(input.type==='diploma'&&board[0])s.subject={id:board[0].id,name:board[0].name,avatar_index:board[0].avatar_index,profile_url:board[0].profile_url};
  return (await persist(db,source,s))!;
}
export async function freezeFightReport(db:D1Database,f:ArenaFight){
  if(f.phase!=='finished')return;
  const source=`fight:${f.id}`,s:ArenaReportSnapshot={version:1,id:`fight-${f.id}`,type:'fight',title:`BUTIKSFIGHT · ${f.name}`,created_at:f.end_at,period:{start:f.start_at,end:f.end_at},station:null,totals:f.standings.reduce(add,empty()),leaderboard:f.standings.map(r=>({...r,unknown_tb_count:r.unknown_tb_count??0})),activities:[],goals:[],winner_names:f.standings.filter(r=>f.winner_ids?.includes(r.id)).map(r=>r.name),metric:f.metric,source,...(f.scoring_mode==='daily'?{scoring_mode:'daily' as const,day_win_points:f.day_win_points,day_tie_points:f.day_tie_points}:{})};
  await persist(db,source,s,f.id);
}
// Bounded lazy archive on authenticated report reads. Also callable from a future
// scheduled maintenance job; never creates one report per ordinary sale.
export async function archiveStationReports(db:D1Database,station:string){
  const day=stockholmDay(new Date()),lastMonth=dateRange(new URL('https://arena.test/?period=month')),lastWeek=dateRange(new URL('https://arena.test/?period=week'));
  for(const [start,end,tag] of [[addDays(lastWeek.start,-7),addDays(lastWeek.start,-1),'week'],[lastMonth.start.slice(0,7)+'-01',addDays(lastMonth.start,-1),'month']] as string[][]){
    const actualStart=tag==='month'?end.slice(0,7)+'-01':start;
    const exists=await db.prepare('SELECT id FROM arena_registrations WHERE station_id=? AND registered_at>=? AND registered_at<? LIMIT 1').bind(station,...goalBounds(actualStart,end)).first();
    if(exists)for(const type of ['summary','diploma'] as const)await freezeStationReport(db,station,{type,start:actualStart,end});
  }
  const goals=await db.prepare(`SELECT id,seller_id,start_date,end_date FROM arena_personal_goals WHERE station_id=? AND end_date<? UNION ALL SELECT id,NULL,start_date,end_date FROM arena_station_goals WHERE station_id=? AND end_date<? ORDER BY end_date DESC LIMIT 12`).bind(station,day,station,day).all<{id:string;seller_id:string|null;start_date:string;end_date:string}>();
  for(const g of goals.results)await freezeStationReport(db,station,{type:g.seller_id?'seller':'station',start:g.start_date,end:g.end_date,...(g.seller_id?{seller_id:g.seller_id}:{}),source:`goal:${g.id}`});
  const campaigns=await db.prepare('SELECT id,activity_id,start_at,end_at FROM arena_campaigns WHERE station_id=? AND end_at<=? ORDER BY end_at DESC LIMIT 6').bind(station,new Date().toISOString()).all<{id:string;activity_id:string;start_at:string;end_at:string}>();
  for(const c of campaigns.results)await freezeStationReport(db,station,{type:'summary',start:stockholmDay(new Date(c.start_at)),end:stockholmDay(new Date(Date.parse(c.end_at)-1)),activity_id:c.activity_id,source:`campaign:${c.id}`});
  const fights=await db.prepare('SELECT f.result_json FROM arena_fights f JOIN arena_fight_stations m ON m.fight_id=f.id WHERE m.station_id=? AND f.result_json IS NOT NULL ORDER BY f.end_at DESC LIMIT 12').bind(station).all<{result_json:string}>();for(const f of fights.results)await freezeFightReport(db,JSON.parse(f.result_json));
}
export async function reportsApi(request:Request,db:D1Database,station:string|null,actor:ArenaActor){
  const u=new URL(request.url),p=u.pathname,m=request.method,base=station?'/api/admin/arena/reports':'/api/arena/superadmin/reports';
  if(p===base&&m==='GET'){
    if(station)await archiveStationReports(db,station);
    const q=station?`WHERE station_id=? OR EXISTS(SELECT 1 FROM arena_fight_stations m WHERE m.fight_id=arena_reports.fight_id AND m.station_id=?)`:'';
    const rows=await db.prepare(`SELECT id,report_type,title,created_at,station_id,fight_id FROM arena_reports ${q} ORDER BY created_at DESC LIMIT 100`).bind(...(station?[station,station]:[])).all();return json({reports:rows.results});
  }
  if(p===base&&m==='POST'){
    const d=await body(request);checkFields(d,['type','start','end','seller_id','activity_id','station_id']);
    if(station&&d.station_id!==undefined)fail(400,'Stationen väljs av sessionen.');
    const key=station??text(d.station_id,'Station',120);
    if(!['diploma','summary','seller','station'].includes(String(d.type)))fail(400,'Välj en rapporttyp.');
    const result=await freezeStationReport(db,key,{type:d.type as Exclude<ArenaReportType,'fight'>,start:text(d.start,'Start',10),end:text(d.end,'Slut',10),...(d.seller_id?{seller_id:text(d.seller_id,'Säljare',120)}:{}),...(d.activity_id?{activity_id:text(d.activity_id,'Aktivitet',120)}:{})});
    await audit(db,actor,'report.frozen','report',result.id,null,{type:d.type},key);return json(result,201);
  }
  const suffix=p.startsWith(base+'/')?p.slice(base.length+1).split('/'):[];
  if(suffix.length&&suffix.length<=2&&/^[a-zA-Z0-9:_-]{1,160}$/.test(suffix[0])&&m==='GET'){
    const row=await db.prepare(`SELECT snapshot_json FROM arena_reports WHERE id=? ${station?'AND (station_id=? OR EXISTS(SELECT 1 FROM arena_fight_stations m WHERE m.fight_id=arena_reports.fight_id AND m.station_id=?))':''}`).bind(suffix[0],...(station?[station,station]:[])).first<{snapshot_json:string}>();
    if(!row)fail(404,'Rapporten finns inte.');const s=JSON.parse(row!.snapshot_json) as ArenaReportSnapshot;
    if(suffix[1]==='pdf'){
      await audit(db,actor,'report.pdf.exported','report',s.id,null,{snapshot_hash:await tokenHash(row!.snapshot_json)},station);
      return new Response(arenaReportPDF(s) as unknown as BodyInit,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="arena-${s.type}-${s.id}.pdf"`,'Cache-Control':'no-store'}});
    }
    if(suffix[1])fail(404,'Rapportfunktionen finns inte.');return json({snapshot:s});
  }
  return fail(404,'Rapportfunktionen finns inte.');
}
