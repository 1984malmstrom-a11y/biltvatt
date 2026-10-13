-- ARENA V1 - central multi-station game database

CREATE TABLE arena_stations (
  id TEXT PRIMARY KEY,
  station_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('pending','active','suspended')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE arena_sellers (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  external_staff_id TEXT,
  source TEXT NOT NULL DEFAULT 'station'
    CHECK(source IN ('station','arena')),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#0676ed',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(station_id) REFERENCES arena_stations(id)
);

CREATE UNIQUE INDEX arena_sellers_external
ON arena_sellers(station_id, external_staff_id)
WHERE external_staff_id IS NOT NULL;

CREATE INDEX arena_sellers_station
ON arena_sellers(station_id, active, name);

CREATE TABLE arena_activities (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  name TEXT NOT NULL,
  offer_text TEXT NOT NULL DEFAULT '',
  price_text TEXT NOT NULL DEFAULT '',
  points REAL NOT NULL DEFAULT 1 CHECK(points >= 0),
  image_key TEXT,
  category TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(station_id) REFERENCES arena_stations(id)
);

CREATE INDEX arena_activities_station
ON arena_activities(station_id, active, sort_order, id);

CREATE TABLE arena_campaigns (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  name TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  target_count INTEGER,
  target_points REAL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(station_id) REFERENCES arena_stations(id),
  FOREIGN KEY(activity_id) REFERENCES arena_activities(id)
);

CREATE INDEX arena_campaigns_station_period
ON arena_campaigns(station_id, active, start_at, end_at);

CREATE TABLE arena_registrations (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  campaign_id TEXT,
  request_id TEXT NOT NULL UNIQUE,
  points_awarded REAL NOT NULL,
  registered_at TEXT NOT NULL,
  voided_at TEXT,
  void_reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(station_id) REFERENCES arena_stations(id),
  FOREIGN KEY(seller_id) REFERENCES arena_sellers(id),
  FOREIGN KEY(activity_id) REFERENCES arena_activities(id),
  FOREIGN KEY(campaign_id) REFERENCES arena_campaigns(id)
);

CREATE INDEX arena_registrations_station_time
ON arena_registrations(station_id, registered_at DESC);

CREATE INDEX arena_registrations_seller_time
ON arena_registrations(seller_id, registered_at DESC);

CREATE INDEX arena_registrations_activity_time
ON arena_registrations(activity_id, registered_at DESC);

CREATE TABLE arena_personal_goals (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  period_type TEXT NOT NULL
    CHECK(period_type IN ('week','month','custom')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  target_points REAL NOT NULL CHECK(target_points >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(station_id) REFERENCES arena_stations(id),
  FOREIGN KEY(seller_id) REFERENCES arena_sellers(id)
);

CREATE INDEX arena_personal_goals_period
ON arena_personal_goals(station_id, seller_id, start_date, end_date);

CREATE TABLE arena_station_goals (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  period_type TEXT NOT NULL
    CHECK(period_type IN ('week','month','custom')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  target_points REAL NOT NULL CHECK(target_points >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(station_id) REFERENCES arena_stations(id)
);

CREATE INDEX arena_station_goals_period
ON arena_station_goals(station_id, start_date, end_date);

CREATE TABLE arena_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE arena_group_members (
  group_id TEXT NOT NULL,
  station_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY(group_id, station_id),
  FOREIGN KEY(group_id) REFERENCES arena_groups(id),
  FOREIGN KEY(station_id) REFERENCES arena_stations(id)
);

CREATE TABLE arena_fights (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  scoring TEXT NOT NULL DEFAULT 'points'
    CHECK(scoring IN ('points','count')),
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK(status IN ('scheduled','active','finished','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE arena_fight_stations (
  fight_id TEXT NOT NULL,
  station_id TEXT NOT NULL,
  PRIMARY KEY(fight_id, station_id),
  FOREIGN KEY(fight_id) REFERENCES arena_fights(id),
  FOREIGN KEY(station_id) REFERENCES arena_stations(id)
);