import type {Env} from './index';
import {configuredKeys,processEvent} from './notifications';
// Reuse established station push stores and sender. Never guess another tenant's
// store, create a subscription, or make push a condition for an accepted action.
export async function deliverFightNotifications(env:Env,resource:string){
 if(!env.ARENA_DB||!configuredKeys(env))return;
 const notices=await env.ARENA_DB.prepare("SELECT * FROM arena_fight_notifications WHERE resource_id=? AND push_state='pending' ORDER BY created_at LIMIT 16").bind(resource).all<{id:string;station_id:string;title:string;body:string;event_key:string}>();
 for(const n of notices.results){
  const target=n.station_id===env.STATION_ID?env.DB:n.station_id==='tingsryd'?env.STATION_DB_TINGSRYD:n.station_id==='karlshamn'?env.STATION_DB_KARLSHAMN:n.station_id==='karlskrona'?env.STATION_DB_KARLSKRONA:undefined;
  if(!target)continue;
  const claimed=await env.ARENA_DB.prepare("UPDATE arena_fight_notifications SET push_state='sending' WHERE id=? AND push_state='pending'").bind(n.id).run();if(!claimed.meta.changes)continue;
  try{const id=`arena:${n.id}`;await target.prepare(`INSERT OR IGNORE INTO notification_events(id,event_key,event_type,event_date,title,body,url,audience,staff_id,created_at) VALUES(?,?,'arena-fight',date('now'),?,?,'/arena/fights','shared',NULL,?)`).bind(id,`arena:${n.event_key}`,n.title,n.body,new Date().toISOString()).run();await processEvent({...env,DB:target},id);await env.ARENA_DB.prepare("UPDATE arena_fight_notifications SET push_state='attempted' WHERE id=?").bind(n.id).run();}catch{await env.ARENA_DB.prepare("UPDATE arena_fight_notifications SET push_state='failed' WHERE id=?").bind(n.id).run();}
 }
}
