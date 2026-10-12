-- Extend only the handbook type checks. The daily checklist table stays unchanged:
-- FreshFood and Bakeoff are read-only, while opening/closing retain their history.
CREATE TABLE station_handbook_heads_v29 (
  station_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('bakeoff','opening','closing','freshfood')),
  published_version_id TEXT,
  draft_title TEXT,
  draft_description TEXT,
  draft_json TEXT,
  draft_reviewed INTEGER NOT NULL DEFAULT 0 CHECK(draft_reviewed IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(station_id,kind)
);
INSERT INTO station_handbook_heads_v29 SELECT * FROM station_handbook_heads;
DROP TABLE station_handbook_heads;
ALTER TABLE station_handbook_heads_v29 RENAME TO station_handbook_heads;

CREATE TABLE station_handbook_versions_v29 (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('bakeoff','opening','closing','freshfood')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  content_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);
INSERT INTO station_handbook_versions_v29 SELECT * FROM station_handbook_versions;
DROP TABLE station_handbook_versions;
ALTER TABLE station_handbook_versions_v29 RENAME TO station_handbook_versions;
CREATE INDEX station_handbook_versions_kind ON station_handbook_versions(station_id,kind,published_at DESC);
