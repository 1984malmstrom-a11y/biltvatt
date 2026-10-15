import {arenaFightView} from './arena-fights';
import type {ArenaActor} from './arena-audit';
import {competitionAudit,notice} from './arena-competition-model';
import {body,checkFields,fail,json,text} from './http';
export async function cancelOfficialFight(request:Request,db:D1Database,id:string,actor:ArenaActor){
 const d=await body(request);checkFields(d,['confirm','reason']);if(d.confirm!==true)fail(400,'Bekräfta avbrottet.');const reason=text(d.reason,'Anledning',240),view=await arenaFightView(db,id);
 if(view.phase==='cancelled')return json({ok:true});if(view.phase==='finished')fail(409,'Matchen har redan ett fryst slutresultat.');
 const at=new Date().toISOString(),cancelled={at,actor:actor.display_name,reason},snapshot={...view,phase:'cancelled',winner_ids:[],leader_ids:[],cancelled,standings:view.standings.map(s=>({...s,match_points:0}))};
 const result=await db.prepare("UPDATE arena_fights SET status='cancelled',result_json=?,cancellation_json=?,updated_at=? WHERE id=? AND result_json IS NULL").bind(JSON.stringify(snapshot),JSON.stringify(cancelled),at,id).run();
 if(!result.meta.changes)fail(409,'Matchen ändrades samtidigt. Uppdatera ställningen.');
 await db.batch([competitionAudit(db,actor,'match.cancelled',id,cancelled,`cancel-match:${id}`),...view.standings.map(s=>notice(db,s.id,'cancelled',id,'MATCHEN HAR AVBRUTITS',`${reason} · ingen vinnare utsågs.`,`cancel-match:${id}`))]);return json({ok:true});
}
