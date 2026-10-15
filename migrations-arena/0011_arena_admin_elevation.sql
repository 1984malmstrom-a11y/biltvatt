-- Arena-only station elevation; legacy integrated admin credentials stay unchanged.
CREATE TABLE arena_admin_pins (
 station_id TEXT PRIMARY KEY REFERENCES arena_stations(id),
 pin_hash TEXT NOT NULL,pin_salt TEXT NOT NULL,pin_iterations INTEGER NOT NULL CHECK(pin_iterations>=100000),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),updated_at TEXT NOT NULL
);
CREATE TABLE arena_admin_elevations (
 token_hash TEXT PRIMARY KEY,station_id TEXT NOT NULL REFERENCES arena_stations(id),
 station_session_id TEXT NOT NULL REFERENCES arena_station_sessions(id),pin_version INTEGER NOT NULL,
 created_at TEXT NOT NULL,last_active_at TEXT NOT NULL,expires_at TEXT NOT NULL,revoked_at TEXT
);
CREATE INDEX arena_admin_elevation_station ON arena_admin_elevations(station_id,revoked_at);
CREATE TABLE arena_admin_pin_attempts (
 station_id TEXT PRIMARY KEY REFERENCES arena_stations(id),attempts INTEGER NOT NULL,window_start TEXT NOT NULL
);
-- Per-station incremental week/month backfill. Advances only after frozen writes.
CREATE TABLE arena_period_finalization (
 station_id TEXT NOT NULL REFERENCES arena_stations(id),kind TEXT NOT NULL CHECK(kind IN ('week','month')),
 next_start TEXT NOT NULL,PRIMARY KEY(station_id,kind)
);
CREATE TABLE arena_award_finalization (
 source_report_id TEXT PRIMARY KEY REFERENCES arena_reports(id)
);
-- Fair retry order: unresolved sudden death cannot starve other finished events.
CREATE TABLE arena_finalization_attempts (
 resource_type TEXT NOT NULL CHECK(resource_type IN ('fight','competition')),resource_id TEXT NOT NULL,
 attempt_order INTEGER NOT NULL,PRIMARY KEY(resource_type,resource_id)
);
