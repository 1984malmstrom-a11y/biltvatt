-- Additive only. Existing station credentials and sales remain intact.
ALTER TABLE arena_sellers ADD COLUMN profile_image_id TEXT;
CREATE TABLE arena_profile_images (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES arena_sellers(id),
  station_id TEXT NOT NULL REFERENCES arena_stations(id),
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/webp','image/png')),
  image_bytes BLOB NOT NULL,
  width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 512),
  height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 512),
  created_at TEXT NOT NULL
);
CREATE INDEX arena_profile_station ON arena_profile_images(station_id,seller_id);
CREATE TRIGGER arena_profile_station_guard BEFORE INSERT ON arena_profile_images
WHEN NOT EXISTS(SELECT 1 FROM arena_sellers WHERE id=NEW.seller_id AND station_id=NEW.station_id)
BEGIN SELECT RAISE(ABORT,'arena_station_mismatch'); END;
CREATE TABLE arena_superadmins (
  id TEXT PRIMARY KEY,
  email_normalized TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','superadmin')),
  status TEXT NOT NULL CHECK(status IN ('invited','active','disabled')),
  password_hash TEXT,
  password_salt TEXT,
  password_iterations INTEGER,
  email_verified_at TEXT,
  auth_epoch INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX arena_single_owner ON arena_superadmins(role) WHERE role='owner';
ALTER TABLE arena_superadmin_sessions ADD COLUMN account_id TEXT REFERENCES arena_superadmins(id);
ALTER TABLE arena_superadmin_sessions ADD COLUMN auth_epoch INTEGER NOT NULL DEFAULT 0;
ALTER TABLE arena_superadmin_sessions ADD COLUMN reauthenticated_at TEXT;
CREATE INDEX arena_super_session_account ON arena_superadmin_sessions(account_id,revoked_at,expires_at);
ALTER TABLE arena_station_accounts ADD COLUMN email_verified_at TEXT;
CREATE TABLE arena_security_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  realm TEXT NOT NULL CHECK(realm IN ('superadmin','station')),
  account_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('reset','verify','invite')),
  email_normalized TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE arena_recovery_codes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES arena_superadmins(id),
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE arena_dev_outbox (
  id TEXT PRIMARY KEY,
  recipient TEXT NOT NULL,
  purpose TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  created_at TEXT NOT NULL
);
CREATE TABLE arena_audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_display TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  station_id TEXT,
  before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK(after_json IS NULL OR json_valid(after_json)),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
  created_at TEXT NOT NULL
);
CREATE INDEX arena_audit_time ON arena_audit_log(created_at,action,actor_id);
CREATE TRIGGER arena_audit_no_update BEFORE UPDATE ON arena_audit_log
BEGIN SELECT RAISE(ABORT,'arena_audit_append_only'); END;
CREATE TRIGGER arena_audit_no_delete BEFORE DELETE ON arena_audit_log
BEGIN SELECT RAISE(ABORT,'arena_audit_append_only'); END;
CREATE TABLE arena_reports (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL UNIQUE,
  station_id TEXT REFERENCES arena_stations(id),
  fight_id TEXT REFERENCES arena_fights(id),
  report_type TEXT NOT NULL CHECK(report_type IN ('diploma','summary','seller','station','fight')),
  title TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  created_at TEXT NOT NULL
);
CREATE INDEX arena_reports_station ON arena_reports(station_id,created_at);
CREATE TRIGGER arena_report_immutable BEFORE UPDATE ON arena_reports
BEGIN SELECT RAISE(ABORT,'arena_report_immutable'); END;
CREATE TRIGGER arena_report_no_delete BEFORE DELETE ON arena_reports
BEGIN SELECT RAISE(ABORT,'arena_report_immutable'); END;
