-- V3.2: additive event history. Existing rows and tables are unchanged.
-- No backfill: only mutations after this migration create events.
CREATE TABLE station_task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,
  task_date TEXT NOT NULL,
  task_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('created','completed','reopened','edited','deleted')),
  occurred_at TEXT NOT NULL
);
CREATE INDEX station_task_events_day ON station_task_events(station_id,task_date,id DESC);

CREATE TABLE station_waste_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,
  waste_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('created','renamed','date_changed','resolved','reopened','deleted')),
  old_expires_on TEXT,
  new_expires_on TEXT,
  occurred_at TEXT NOT NULL
);
CREATE INDEX station_waste_events_latest ON station_waste_events(station_id,id DESC);

CREATE TRIGGER station_task_event_created AFTER INSERT ON station_tasks
BEGIN
  INSERT INTO station_task_events(station_id,task_date,task_id,action,occurred_at)
  VALUES(NEW.station_id,NEW.task_date,NEW.id,
    CASE WHEN NEW.done=1 THEN 'completed' ELSE 'created' END,NEW.created_at);
END;
CREATE TRIGGER station_task_event_completed AFTER UPDATE OF done ON station_tasks
WHEN OLD.done<>NEW.done AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL
BEGIN
  INSERT INTO station_task_events(station_id,task_date,task_id,action,occurred_at)
  VALUES(NEW.station_id,NEW.task_date,NEW.id,
    CASE WHEN NEW.done=1 THEN 'completed' ELSE 'reopened' END,NEW.updated_at);
END;
CREATE TRIGGER station_task_event_edited AFTER UPDATE OF text ON station_tasks
WHEN OLD.text<>NEW.text AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL
BEGIN
  INSERT INTO station_task_events(station_id,task_date,task_id,action,occurred_at)
  VALUES(NEW.station_id,NEW.task_date,NEW.id,'edited',NEW.updated_at);
END;
CREATE TRIGGER station_task_event_deleted AFTER UPDATE OF deleted_at ON station_tasks
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
  INSERT INTO station_task_events(station_id,task_date,task_id,action,occurred_at)
  VALUES(NEW.station_id,NEW.task_date,NEW.id,'deleted',NEW.updated_at);
END;

CREATE TRIGGER station_waste_event_created AFTER INSERT ON station_waste_items
BEGIN
  INSERT INTO station_waste_events(station_id,waste_id,action,new_expires_on,occurred_at)
  VALUES(NEW.station_id,NEW.id,'created',NEW.expires_on,NEW.created_at);
END;
CREATE TRIGGER station_waste_event_renamed AFTER UPDATE OF product_name ON station_waste_items
WHEN OLD.product_name<>NEW.product_name
BEGIN
  INSERT INTO station_waste_events(station_id,waste_id,action,occurred_at)
  VALUES(NEW.station_id,NEW.id,'renamed',NEW.updated_at);
END;
CREATE TRIGGER station_waste_event_date AFTER UPDATE OF expires_on ON station_waste_items
WHEN OLD.expires_on<>NEW.expires_on
BEGIN
  INSERT INTO station_waste_events(station_id,waste_id,action,old_expires_on,new_expires_on,occurred_at)
  VALUES(NEW.station_id,NEW.id,'date_changed',OLD.expires_on,NEW.expires_on,NEW.updated_at);
END;
CREATE TRIGGER station_waste_event_status AFTER UPDATE OF resolved ON station_waste_items
WHEN OLD.resolved<>NEW.resolved
BEGIN
  INSERT INTO station_waste_events(station_id,waste_id,action,occurred_at)
  VALUES(NEW.station_id,NEW.id,
    CASE WHEN NEW.resolved=1 THEN 'resolved' ELSE 'reopened' END,NEW.updated_at);
END;
CREATE TRIGGER station_waste_event_deleted AFTER DELETE ON station_waste_items
BEGIN
  INSERT INTO station_waste_events(station_id,waste_id,action,occurred_at)
  VALUES(OLD.station_id,OLD.id,'deleted',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
