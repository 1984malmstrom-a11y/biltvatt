import {assignArenaIdentities} from "./arena-identities";
import {arenaPortrait} from "./arena-portraits";
import type { Env } from "./index";
import { body, checkFields, fail, json, text } from "./http";
import { arenaUUID } from "./arena-model";
import { arenaStats, currentCampaign } from "./arena-stats";
import type { ArenaRegistration } from "../shared/arena";
import { resolveArenaStation } from "./arena-auth";
import { arenaGroupApi } from "./arena-network";
import { arenaFightApi, refreshStationFights } from "./arena-fights";
import {arenaLeagueApi} from './arena-leagues';
import { achievementScopes } from "./arena-achievements";
import { evaluateArenaAchievements, type EvaluatedAchievement } from "../shared/arena-achievements";

const stationDisplayName = (key: string, env: Env) =>
  env.STATION_NAME?.trim() ||
  key
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export async function arenaApi(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (!path.startsWith("/api/arena/")) return null;
  if(url.searchParams.has("station_id")) fail(400,"Stationsidentiteten kan inte väljas i anropet.");

  if (!env.ARENA_DB) {
    return json(
      { error: "Arena-databasen är inte konfigurerad." },
      503,
    );
  }

  const arena = env.ARENA_DB;
  const portrait=path.match(/^\/api\/arena\/portraits\/([a-f0-9-]{36})$/);
  if(portrait && method==='GET')return arenaPortrait(request,env,portrait[1]);
  const identity=await resolveArenaStation(request,env),key=identity.key;
  const now = new Date().toISOString();
  if(path.startsWith("/api/arena/groups")) return arenaGroupApi(request,arena,key);
  if(path.startsWith("/api/arena/fights"))return arenaFightApi(request,arena,key);
  if(path.startsWith('/api/arena/leagues'))return arenaLeagueApi(request,arena,key);

  if (path === "/api/arena/stats" && method === "GET") return json(await arenaStats(arena, key, url));
  const image = path.match(/^\/api\/arena\/activity-images\/([a-f0-9-]{36})$/);
  if (image && method === "GET") {
    const row = await arena.prepare("SELECT mime_type,image_bytes FROM arena_activity_images WHERE id=? AND station_id=?")
      .bind(image[1], key).first<{ mime_type: string; image_bytes: ArrayBuffer }>();
    if (!row) return fail(404, "Bilden finns inte.");
    return new Response(new Uint8Array(row.image_bytes), { headers: {
      "Content-Type": row.mime_type, "Cache-Control": "private, max-age=86400, immutable", "Vary":"Cookie", "X-Content-Type-Options": "nosniff",
    } });
  }
  if (path === "/api/arena/registrations" && method === "POST") {
    const data = await body(request);
    checkFields(data, ["request_id", "activity_id", "seller_id", "achievement_context"]);
    const requestId = arenaUUID(data.request_id), activityId = text(data.activity_id, "Aktivitet", 80), sellerId = text(data.seller_id, "Säljare", 120);
    const lookup = () => arena.prepare(`SELECT id,seller_id,activity_id,points_awarded,tb_ore_awarded,registered_at,voided_at FROM arena_registrations WHERE request_id=? AND station_id=?`)
      .bind(requestId, key).first<ArenaRegistration>();
    let registration = await lookup();
    if (!registration) {
      const seller = await arena.prepare("SELECT external_staff_id,source FROM arena_sellers WHERE id=? AND station_id=? AND active=1")
        .bind(sellerId, key).first<{ external_staff_id: string | null;source:string }>();
      if(identity.kind==="integrated" && !identity.staffDB) fail(503,"Stationens personaldatabas är inte konfigurerad på den här Arena-servern.");
      if (!seller || (identity.kind==="arena" ? seller.source!=="arena" : seller.source!=="station" || !await identity.staffDB!.prepare("SELECT id FROM staff WHERE id=? AND active=1 AND deleted_at IS NULL").bind(seller.external_staff_id).first()))
        fail(400, "Säljaren är inte aktiv. Uppdatera Arenan.");
      // SELECT snapshots points and campaign at the same instant as the atomic insert.
      const scopes=await achievementScopes(arena,key,activityId,data.achievement_context,new Date(now),sellerId);
      const beforeQueries=scopes.statements();
      const result=await arena.batch([...beforeQueries,arena.prepare(`INSERT OR IGNORE INTO arena_registrations(id,station_id,seller_id,activity_id,campaign_id,request_id,points_awarded,tb_ore_awarded,registered_at,created_at)
        SELECT ?,?,s.id,a.id,(SELECT c.id FROM arena_campaigns c WHERE c.station_id=a.station_id AND c.activity_id=a.id AND c.active=1 AND c.start_at<=clock.instant AND c.end_at>clock.instant ORDER BY c.start_at DESC,c.id LIMIT 1),?,a.points,a.tb_ore,clock.instant,clock.instant
        FROM arena_sellers s JOIN arena_activities a ON a.station_id=s.station_id CROSS JOIN (SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now') instant) clock
        WHERE s.id=? AND a.id=? AND s.station_id=? AND s.active=1 AND a.active=1
        AND EXISTS(SELECT 1 FROM arena_stations station WHERE station.id=s.station_id AND station.status='active')`)
        .bind(crypto.randomUUID(), key, requestId, sellerId, activityId, key),...scopes.statements()]);
      registration = await lookup();
      if (registration && result[beforeQueries.length].meta.changes) {
        const before=scopes.snapshot(result.slice(0,beforeQueries.length).flatMap(r=>r.results) as unknown as Parameters<typeof scopes.snapshot>[0]);
        const after=scopes.snapshot(result.slice(beforeQueries.length+1).flatMap(r=>r.results) as unknown as Parameters<typeof scopes.snapshot>[0]);
        const events=evaluateArenaAchievements(before,after,sellerId);
        await arena.prepare("INSERT OR IGNORE INTO arena_registration_achievements(registration_id,station_id,events_json,created_at) VALUES(?,?,?,?)")
          .bind(registration.id,key,JSON.stringify(events),now).run();
      }
    }
    if (!registration) fail(409, "Aktiviteten är inte aktiv eller registrerings-ID har redan använts.");
    if (registration!.seller_id !== sellerId || registration!.activity_id !== activityId) fail(409, "Registrerings-ID har redan använts för en annan försäljning.");
    const receipt=await arena.prepare("SELECT events_json FROM arena_registration_achievements WHERE registration_id=? AND station_id=?").bind(registration!.id,key).first<{events_json:string}>();
    // A fight refresh never changes whether an acknowledged sale was saved.
    try{await refreshStationFights(arena,key);}catch{console.warn("Arena fight refresh deferred; sale receipt is intact.");}
    return json({ registration: registration!, achievements: receipt ? JSON.parse(receipt.events_json) as EvaluatedAchievement[] : [] });
  }
  const undo = path.match(/^\/api\/arena\/registrations\/([a-f0-9-]{36})\/void$/);
  if (undo && method === "POST") {
    const data = await body(request); checkFields(data, ["request_id"]);
    const receipt = arenaUUID(data.request_id);
    const registration = await arena.prepare("SELECT id,request_id,registered_at,voided_at FROM arena_registrations WHERE id=? AND station_id=?")
      .bind(undo[1], key).first<{ id: string; request_id: string; registered_at: string; voided_at: string | null }>();
    if (!registration) fail(404, "Registreringen finns inte.");
    if (registration!.request_id !== receipt) fail(403, "Ångring kräver kvittot från din registrering.");
    if (!registration!.voided_at && Date.now() - Date.parse(registration!.registered_at) > 5 * 60000) fail(409, "Registreringen kan bara ångras inom fem minuter.");
    await arena.prepare("UPDATE arena_registrations SET voided_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),void_reason='SELLER_UNDO' WHERE id=? AND station_id=? AND voided_at IS NULL")
      .bind(undo[1], key).run();
    try{await refreshStationFights(arena,key);}catch{console.warn("Arena fight refresh deferred after undo.");}
    return json({ ok: true });
  }

  if (path === "/api/arena/bootstrap" && method === "GET") {
    if(identity.kind==="integrated" && !identity.staffDB) fail(503,"Stationens personaldatabas är inte konfigurerad på den här Arena-servern.");
    if(identity.kind==="integrated") {
    await arena
      .prepare(
        `INSERT INTO arena_stations(
          id, station_key, name, status, created_at, updated_at
        )
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          station_key=excluded.station_key,
          updated_at=excluded.updated_at`,
      )
      .bind(
        key,
        key,
        stationDisplayName(key, env),
        "active",
        now,
        now,
      )
      .run();

    const localStaff = await identity.staffDB!
      .prepare(
        `SELECT id,name,color
         FROM staff
         WHERE active=1 AND deleted_at IS NULL
         ORDER BY created_at,rowid`,
      )
      .all<{
        id: string;
        name: string;
        color: string;
      }>();

    const syncStatements = [
      arena
        .prepare(
          `UPDATE arena_sellers
           SET active=0, updated_at=?
           WHERE station_id=? AND source='station'`,
        )
        .bind(now, key),

      ...localStaff.results.map((person) =>
        arena
          .prepare(
            `INSERT INTO arena_sellers(
              id,
              station_id,
              external_staff_id,
              source,
              name,
              color,
              active,
              created_at,
              updated_at
            )
            VALUES(?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
              external_staff_id=excluded.external_staff_id,
              source='station',
              name=excluded.name,
              color=excluded.color,
              active=1,
              updated_at=excluded.updated_at`,
          )
          .bind(
            `${key}:${person.id}`,
            key,
            person.id,
            "station",
            person.name,
            person.color,
            1,
            now,
            now,
          ),
      ),
    ];

    await arena.batch(syncStatements);
    }

    await assignArenaIdentities(arena,key);
    const [station, sellers, activities, campaign] = await Promise.all([
      arena
        .prepare(
          `SELECT id,station_key,name,status,kind
           FROM arena_stations
           WHERE id=?`,
        )
        .bind(key)
        .first(),

      arena
        .prepare(
          `SELECT id,external_staff_id,name,color,active,avatar_index,CASE WHEN profile_image_id IS NOT NULL THEN '/api/arena/portraits/'||profile_image_id END profile_url
           FROM arena_sellers
           WHERE station_id=? AND active=1
           ORDER BY name COLLATE NOCASE,id`,
        )
        .bind(key)
        .all(),

      arena
        .prepare(
          `SELECT
            id,name,offer_text,price_text,points,tb_ore,display_mode,image_key,
            category,sort_order,active
           FROM arena_activities
           WHERE station_id=? AND active=1
           ORDER BY sort_order,id`,
        )
        .bind(key)
        .all(),

      currentCampaign(arena, key, now),
    ]);

    return json({
      station,
      sellers: sellers.results,
      activities: activities.results,
      campaign: campaign ?? null,
    });
  }

  return null;
}
