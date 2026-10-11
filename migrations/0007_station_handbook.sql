-- Additive V2.8 handbook storage. Existing sales, tasks, sessions and schedules are untouched.
CREATE TABLE station_handbook_heads (
  station_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('bakeoff','opening','closing')),
  published_version_id TEXT,
  draft_title TEXT,
  draft_description TEXT,
  draft_json TEXT,
  draft_reviewed INTEGER NOT NULL DEFAULT 0 CHECK(draft_reviewed IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(station_id,kind)
);
CREATE TABLE station_handbook_versions (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('bakeoff','opening','closing')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  content_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);
CREATE INDEX station_handbook_versions_kind ON station_handbook_versions(station_id,kind,published_at DESC);
CREATE TABLE station_handbook_checks (
  station_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('opening','closing')),
  task_date TEXT NOT NULL,
  item_id TEXT NOT NULL,
  done INTEGER NOT NULL CHECK(done IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(station_id,kind,task_date,item_id)
);
CREATE INDEX station_handbook_checks_day ON station_handbook_checks(station_id,kind,task_date);
