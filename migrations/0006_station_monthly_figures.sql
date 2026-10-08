-- Additive V2 data. Existing sales, wash records and notices remain unchanged.
CREATE TABLE station_monthly_figures (
  station_id TEXT NOT NULL,
  month TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (station_id, month),
  CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]')
);

ALTER TABLE station_notices ADD COLUMN expires_time TEXT;
