ALTER TABLE arena_stations ADD COLUMN kind TEXT NOT NULL DEFAULT 'integrated' CHECK(kind IN ('integrated','arena'));
CREATE TABLE arena_station_accounts (
  station_id TEXT PRIMARY KEY REFERENCES arena_stations(id),
  email_normalized TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL CHECK(password_iterations>=100000),
  created_at TEXT NOT NULL
);
CREATE TABLE arena_station_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  station_id TEXT NOT NULL REFERENCES arena_stations(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX arena_sessions_station ON arena_station_sessions(station_id,revoked_at,expires_at);
CREATE TABLE arena_superadmin_sessions (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE TABLE arena_auth_limits (
  bucket_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
CREATE TRIGGER arena_achievement_station_guard BEFORE INSERT ON arena_registration_achievements
WHEN NOT EXISTS(SELECT 1 FROM arena_registrations WHERE id=NEW.registration_id AND station_id=NEW.station_id)
BEGIN SELECT RAISE(ABORT,'arena_station_mismatch'); END;
