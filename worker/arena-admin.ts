import {challengeAdminApi} from './arena-challenges';
import {reportsApi} from "./arena-reports";
import {updateArenaPortrait,readArenaImage} from "./arena-portraits";
import type { Env } from "./index";
import { body, checkFields, fail, json, text } from "./http";
import { activityInput, campaignInput, goalInput } from "./arena-model";
import { resolveArenaStation } from "./arena-auth";

// Called only after legacy admin authentication or station-admin elevation in index.ts.
export async function arenaAdminApi(request: Request, env: Env,authorizedIdentity?:Awaited<ReturnType<typeof resolveArenaStation>>): Promise<Response> {
  if (!env.ARENA_DB) return fail(503, "Arena-databasen är inte konfigurerad.");
  const identity=authorizedIdentity??await resolveArenaStation(request,env);
  const db = env.ARENA_DB, key = identity.key, path = new URL(request.url).pathname, method = request.method, now = new Date().toISOString();
  if(path.startsWith('/api/admin/arena/challenges')||path==='/api/admin/arena/competition-availability')return challengeAdminApi(request,env,key);
  if(path.startsWith("/api/admin/arena/reports"))return reportsApi(request,db,key,{id:key,display_name:identity.station?.name??key,role:"station"});
  if (path === "/api/admin/arena/config" && method === "GET") {
    const queries = [
      "SELECT id,name,offer_text,price_text,points,tb_ore,display_mode,image_key,category,sort_order,active,arena_category_id FROM arena_activities WHERE station_id=? AND id NOT LIKE 'temp:%' ORDER BY sort_order,id",
      "SELECT id,name,activity_id,start_at,end_at,target_count,target_points,active FROM arena_campaigns WHERE station_id=? ORDER BY start_at DESC",
      "SELECT id,period_type,start_date,end_date,target_points FROM arena_station_goals WHERE station_id=? ORDER BY start_date DESC",
      "SELECT id,seller_id,period_type,start_date,end_date,target_points FROM arena_personal_goals WHERE station_id=? ORDER BY start_date DESC",
    ];
    const [activities, campaigns, station_goals, personal_goals] = await Promise.all(queries.map(sql => db.prepare(sql).bind(key).all()));
    const sellers=identity.kind==="arena" ? await db.prepare("SELECT id,external_staff_id,name,color,active,avatar_index,CASE WHEN profile_image_id IS NOT NULL THEN '/api/arena/portraits/'||profile_image_id END profile_url,source FROM arena_sellers WHERE station_id=? ORDER BY name COLLATE NOCASE,id").bind(key).all() : {results:[]};
    return json({ activities: activities.results, campaigns: campaigns.results, station_goals: station_goals.results, personal_goals: personal_goals.results,sellers:sellers.results });
  }
  const portraitRoute=path.match(/^\/api\/admin\/arena\/sellers\/([a-zA-Z0-9:_-]{1,120})\/portrait$/);
  if(portraitRoute)return updateArenaPortrait(request,env,portraitRoute[1],key);
  const sellerRoute=path.match(/^\/api\/admin\/arena\/sellers(?:\/([a-zA-Z0-9:_-]{1,120}))?$/);
  if(sellerRoute) {
    if(identity.kind!=="arena") fail(403,"Integrerade stationer hanterar personal i sin stationsdashboard.");
    const id=sellerRoute[1];if(!((method==="POST" && !id) || (method==="PATCH" && id))) fail(405,"Metoden stöds inte.");
    const data=await body(request);checkFields(data,["name","color","active"]);
    const name=text(data.name,"Säljarnamn"),color=text(data.color,"Färg",7);
    if(!/^#[a-f0-9]{6}$/i.test(color) || ![0,1].includes(data.active as number)) fail(400,"Välj en giltig färg och aktiv status.");
    const sellerId=id??crypto.randomUUID();
    const result=id ? await db.prepare("UPDATE arena_sellers SET name=?,color=?,active=?,updated_at=? WHERE id=? AND station_id=? AND source='arena'").bind(name,color,data.active as number,now,sellerId,key).run()
      : await db.prepare("INSERT INTO arena_sellers(id,station_id,external_staff_id,source,name,color,active,created_at,updated_at) VALUES(?,?,NULL,'arena',?,?,?,?,?)").bind(sellerId,key,name,color,data.active as number,now,now).run();
    if(!result.meta.changes) fail(404,"Säljaren finns inte.");return json({id:sellerId},id?200:201);
  }
  if (path === "/api/admin/arena/activity-images" && method === "POST") {
    if (!await db.prepare("SELECT id FROM arena_stations WHERE id=?").bind(key).first()) fail(409, "Öppna Arenan först för att synka stationen.");
    const {mime,bytes,width,height}=await readArenaImage(request),id=crypto.randomUUID();
    await db.prepare("INSERT INTO arena_activity_images(id,station_id,mime_type,image_bytes,width,height,created_at) VALUES(?,?,?,?,?,?,?)")
      .bind(id, key, mime, bytes.buffer, width, height, now).run();
    return json({ id }, 201);
  }
  const route = path.match(/^\/api\/admin\/arena\/(activities|campaigns|goals)(?:\/([a-zA-Z0-9:_-]{1,120}))?$/);
  if (!route) return fail(404, "Arena-administrationen finns inte.");
  const [, kind, itemId] = route;
  if (!((method === "POST" && !itemId) || (method === "PATCH" && itemId) || (method === "DELETE" && kind === "goals" && itemId))) fail(405, "Metoden stöds inte.");
  const id = itemId ?? crypto.randomUUID();
  if (method === "DELETE") {
    const result = await db.batch([
      db.prepare("DELETE FROM arena_station_goals WHERE id=? AND station_id=?").bind(id, key),
      db.prepare("DELETE FROM arena_personal_goals WHERE id=? AND station_id=?").bind(id, key),
    ]);
    if (!result.some(r => r.meta.changes)) fail(404, "Målet finns inte.");
    return json({ ok: true });
  }
  const data = await body(request);
  if (kind === "activities") {
    if(itemId?.startsWith("temp:"))fail(403,"Fight-aktiviteten hanteras av tävlingen, inte ordinarie aktivitetsregister.");
    const a = activityInput(data);
    if (a.image_key && !await db.prepare("SELECT id FROM arena_activity_images WHERE id=? AND station_id=?").bind(a.image_key, key).first()) fail(400, "Bilden tillhör inte stationen.");
    const result = itemId ? await db.prepare(`UPDATE arena_activities SET name=?,offer_text=?,price_text=?,points=?,image_key=?,category=?,sort_order=?,active=?,tb_ore=COALESCE(?,tb_ore),display_mode=COALESCE(?,display_mode),arena_category_id=?,updated_at=? WHERE id=? AND station_id=?`)
      .bind(a.name, a.offer_text, a.price_text, a.points, a.image_key, a.category, a.sort_order, a.active,a.tb_ore??null,a.display_mode??null, a.arena_category_id,now, id, key).run()
      : await db.prepare(`INSERT INTO arena_activities(id,station_id,name,offer_text,price_text,points,image_key,category,sort_order,active,tb_ore,display_mode,arena_category_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, key, a.name, a.offer_text, a.price_text, a.points, a.image_key, a.category, a.sort_order, a.active,a.tb_ore??0,a.display_mode??"points",a.arena_category_id, now, now).run();
    if (!result.meta.changes) fail(404, "Aktiviteten finns inte.");
  } else if (kind === "campaigns") {
    const c = campaignInput(data);
    if (!await db.prepare("SELECT id FROM arena_activities WHERE id=? AND station_id=? AND (?=0 OR active=1)").bind(c.activity_id, key, c.active).first()) fail(400, "Välj en aktiv aktivitet på stationen.");
    if (c.active && await db.prepare("SELECT id FROM arena_campaigns WHERE station_id=? AND active=1 AND id<>? AND start_at<? AND end_at>?").bind(key, id, c.end_at, c.start_at).first()) fail(409, "En aktiv kampanj överlappar perioden. Inaktivera den först.");
    const result = itemId ? await db.prepare(`UPDATE arena_campaigns SET name=?,activity_id=?,start_at=?,end_at=?,target_count=?,target_points=?,active=?,updated_at=? WHERE id=? AND station_id=?`)
      .bind(c.name, c.activity_id, c.start_at, c.end_at, c.target_count, c.target_points, c.active, now, id, key).run()
      : await db.prepare(`INSERT INTO arena_campaigns(id,station_id,name,activity_id,start_at,end_at,target_count,target_points,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, key, c.name, c.activity_id, c.start_at, c.end_at, c.target_count, c.target_points, c.active, now, now).run();
    if (!result.meta.changes) fail(404, "Kampanjen finns inte.");
  } else {
    const g = goalInput(data);
    if (g.seller_id && !await db.prepare("SELECT id FROM arena_sellers WHERE id=? AND station_id=?").bind(g.seller_id, key).first()) fail(400, "Säljaren tillhör inte stationen.");
    const table = g.seller_id ? "arena_personal_goals" : "arena_station_goals";
    const sql = itemId ? `UPDATE ${table} SET period_type=?,start_date=?,end_date=?,target_points=?,updated_at=? WHERE id=? AND station_id=?${g.seller_id ? " AND seller_id=?" : ""}`
      : `INSERT INTO ${table}(period_type,start_date,end_date,target_points,updated_at,id,station_id,created_at${g.seller_id ? ",seller_id" : ""}) VALUES(?,?,?,?,?,?,?,?${g.seller_id ? ",?" : ""})`;
    const values = [g.period_type, g.start_date, g.end_date, g.target_points, now, id, key, ...(itemId ? [] : [now]), ...(g.seller_id ? [g.seller_id] : [])];
    const result = await db.prepare(sql).bind(...values).run();
    if (!result.meta.changes) fail(404, "Målet finns inte.");
  }
  return json({ id }, itemId ? 200 : 201);
}
