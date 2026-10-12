-- Station data is independent of wash sales and notification data.
CREATE TABLE station_store_daily_sales (
  station_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  net_sales_ore INTEGER NOT NULL CHECK(net_sales_ore BETWEEN 0 AND 10000000000),
  source TEXT NOT NULL CHECK(source IN ('manual','import')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  correction_reason TEXT,
  PRIMARY KEY(station_id,business_date),
  CHECK(business_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
CREATE TABLE station_store_sales_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('CREATE','CORRECT')),
  actor TEXT NOT NULL,
  old_net_sales_ore INTEGER,
  new_net_sales_ore INTEGER NOT NULL,
  reason TEXT,
  changed_at TEXT NOT NULL
);
CREATE INDEX station_store_sales_audit_day ON station_store_sales_audit(station_id,business_date,id DESC);
CREATE TRIGGER station_store_sales_create AFTER INSERT ON station_store_daily_sales BEGIN
  INSERT INTO station_store_sales_audit(station_id,business_date,action,actor,old_net_sales_ore,new_net_sales_ore,reason,changed_at)
  VALUES(NEW.station_id,NEW.business_date,'CREATE',NEW.actor,NULL,NEW.net_sales_ore,NULL,NEW.created_at);
END;
CREATE TRIGGER station_store_sales_correct AFTER UPDATE OF revision ON station_store_daily_sales
WHEN NEW.revision != OLD.revision BEGIN
  INSERT INTO station_store_sales_audit(station_id,business_date,action,actor,old_net_sales_ore,new_net_sales_ore,reason,changed_at)
  VALUES(NEW.station_id,NEW.business_date,'CORRECT',NEW.actor,OLD.net_sales_ore,NEW.net_sales_ore,NEW.correction_reason,NEW.updated_at);
END;
CREATE TABLE station_activation_codes (
  code_hash TEXT PRIMARY KEY,
  device_label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE TABLE station_view_sessions (
  token_hash TEXT PRIMARY KEY,
  device_label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_seen_at TEXT
);
CREATE INDEX station_view_sessions_recent ON station_view_sessions(created_at DESC);
