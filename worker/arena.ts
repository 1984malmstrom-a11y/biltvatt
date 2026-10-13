import type { Env } from "./index";
import { json } from "./http";
import { stationId } from "./station-config";

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

  if (!env.ARENA_DB) {
    return json(
      { error: "Arena-databasen är inte konfigurerad." },
      503,
    );
  }

  const arena = env.ARENA_DB;
  const key = stationId(env);
  const now = new Date().toISOString();

  if (path === "/api/arena/bootstrap" && method === "GET") {
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

    const localStaff = await env.DB
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

    const [station, sellers, activities, campaign] = await Promise.all([
      arena
        .prepare(
          `SELECT id,station_key,name,status
           FROM arena_stations
           WHERE id=?`,
        )
        .bind(key)
        .first(),

      arena
        .prepare(
          `SELECT id,external_staff_id,name,color,active
           FROM arena_sellers
           WHERE station_id=? AND active=1
           ORDER BY name COLLATE NOCASE,id`,
        )
        .bind(key)
        .all(),

      arena
        .prepare(
          `SELECT
            id,name,offer_text,price_text,points,image_key,
            category,sort_order,active
           FROM arena_activities
           WHERE station_id=? AND active=1
           ORDER BY sort_order,id`,
        )
        .bind(key)
        .all(),

      arena
        .prepare(
          `SELECT
            id,name,activity_id,start_at,end_at,
            target_count,target_points
           FROM arena_campaigns
           WHERE station_id=?
             AND active=1
             AND start_at<=?
             AND end_at>=?
           ORDER BY start_at DESC
           LIMIT 1`,
        )
        .bind(key, now, now)
        .first(),
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