-- Additive only: no rewrite of existing sales, prices, PIN or applied migrations.
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  management_token_hash TEXT NOT NULL,
  staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
  device_label TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_success_at TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  disabled_at TEXT
);
CREATE INDEX push_active_staff ON push_subscriptions(active,staff_id);
CREATE TABLE notification_events (
  id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  event_date TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all',
  staff_id TEXT,
  subscription_id TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sending','complete','skipped')),
  total INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX notification_recent ON notification_events(created_at,event_type);
INSERT INTO settings(key,value,updated_at) VALUES
  ('push_enabled','0',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('push_goal_close_enabled','1',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('push_goal_close_threshold','5',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('push_goal_reached_enabled','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
-- Association is never silently changed into a shared device. Re-enabling is explicit.
CREATE TRIGGER push_staff_disabled AFTER UPDATE OF active,deleted_at ON staff
WHEN NEW.active=0 OR NEW.deleted_at IS NOT NULL BEGIN
  UPDATE push_subscriptions SET active=0,disabled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE staff_id=NEW.id;
END;
CREATE TRIGGER push_staff_removed BEFORE DELETE ON staff BEGIN
  UPDATE push_subscriptions SET active=0,disabled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE staff_id=OLD.id;
END;
