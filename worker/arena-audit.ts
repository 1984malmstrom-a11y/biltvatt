import {fail,json} from './http';
export type ArenaActor={id:string;display_name:string;role:'owner'|'superadmin'|'station'|'system';email_normalized?:string;session_hash?:string;reauthenticated_at?:string|null;email_verified_at?:string|null};
function safe(value:unknown):unknown {
  if(Array.isArray(value))return value.map(safe);
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!/(password|secret|token|code_hash|recovery_codes|credential|cookie|(?:^|_)pin(?:_|$))/i.test(key)).map(([key,v])=>[key,safe(v)]));
  return value;
}
export function auditStatement(db:D1Database,actor:ArenaActor,action:string,resourceType:string,resourceId:string,before:unknown=null,after:unknown=null,station:string|null=null,metadata:unknown={}){
  return db.prepare('INSERT INTO arena_audit_log(id,actor_id,actor_display,actor_role,action,resource_type,resource_id,station_id,before_json,after_json,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),actor.id,actor.display_name,actor.role,action,resourceType,resourceId,station,before==null?null:JSON.stringify(safe(before)),after==null?null:JSON.stringify(safe(after)),JSON.stringify(safe(metadata)),new Date().toISOString());
}
export async function audit(db:D1Database,...args:Parameters<typeof auditStatement> extends [D1Database,...infer T]?T:never){await auditStatement(db,...args).run();}
export async function auditApi(request:Request,db:D1Database){
  const q=new URL(request.url).searchParams;
  if([...q.keys()].some(k=>!['actor','action','resource','start','end'].includes(k)))fail(400,'Ogiltigt loggfilter.');
  const conditions:string[]=[],values:string[]=[];
  for(const [key,column] of [['actor','actor_id'],['action','action'],['resource','resource_type'],['start','created_at'],['end','created_at']]){
    const value=q.get(key);if(!value)continue;
    if(value.length>120)fail(400,'För långt filter.');
    conditions.push(`${column}${key==='start'?'>=':key==='end'?'<=':'='}?`);values.push(key==='end'&&value.length===10?`${value}T23:59:59.999Z`:value);
  }
  const rows=await db.prepare(`SELECT * FROM arena_audit_log ${conditions.length?'WHERE '+conditions.join(' AND '):''} ORDER BY created_at DESC,id DESC LIMIT 200`).bind(...values).all();
  return json({events:rows.results,limit:200});
}
