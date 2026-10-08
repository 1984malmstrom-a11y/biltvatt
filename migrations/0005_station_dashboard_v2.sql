-- Additive station V2 data. Existing sales, sessions and wash data are untouched.
CREATE TABLE station_schedule_periods (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  label TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE station_shifts (
  id TEXT PRIMARY KEY,
  period_id TEXT NOT NULL REFERENCES station_schedule_periods(id),
  work_date TEXT NOT NULL,
  first_name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled','leave','sick')),
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  CHECK(starts_at GLOB '[0-2][0-9]:[0-5][0-9]'),
  CHECK(ends_at GLOB '[0-2][0-9]:[0-5][0-9]')
);
CREATE INDEX station_shifts_day ON station_shifts(work_date,status,starts_at);
CREATE UNIQUE INDEX station_shifts_no_duplicates ON station_shifts(work_date,first_name,starts_at,ends_at);
CREATE TABLE station_tasks (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  task_date TEXT NOT NULL,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX station_tasks_day ON station_tasks(station_id,task_date,deleted_at,created_at);
CREATE TABLE station_task_write_limits (
  token_hash TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  requests INTEGER NOT NULL
);
CREATE TABLE station_notices (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
  expires_on TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX station_notices_current ON station_notices(station_id,published,expires_on,updated_at DESC);
