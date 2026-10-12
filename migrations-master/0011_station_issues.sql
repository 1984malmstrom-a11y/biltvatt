-- V3.3: additive issue register. No existing table or row is changed.
CREATE TABLE station_issues (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX station_issues_open ON station_issues(station_id,completed,created_at DESC,id DESC);
CREATE INDEX station_issues_completed ON station_issues(station_id,completed,completed_at DESC,id DESC);

CREATE TABLE station_issue_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('created','edited','note','completed','reopened')),
  note_text TEXT,
  occurred_at TEXT NOT NULL,
  FOREIGN KEY(issue_id) REFERENCES station_issues(id)
);
CREATE INDEX station_issue_events_issue ON station_issue_events(station_id,issue_id,id DESC);

-- Triggers make the audit events part of the successful issue mutation.
CREATE TRIGGER station_issue_created AFTER INSERT ON station_issues
BEGIN
  INSERT INTO station_issue_events(station_id,issue_id,action,occurred_at)
  VALUES(NEW.station_id,NEW.id,'created',NEW.created_at);
END;
CREATE TRIGGER station_issue_edited AFTER UPDATE OF title,description,location ON station_issues
WHEN OLD.title<>NEW.title OR OLD.description<>NEW.description OR OLD.location<>NEW.location
BEGIN
  INSERT INTO station_issue_events(station_id,issue_id,action,occurred_at)
  VALUES(NEW.station_id,NEW.id,'edited',NEW.updated_at);
END;
CREATE TRIGGER station_issue_status AFTER UPDATE OF completed ON station_issues
WHEN OLD.completed<>NEW.completed
BEGIN
  INSERT INTO station_issue_events(station_id,issue_id,action,occurred_at)
  VALUES(NEW.station_id,NEW.id,CASE WHEN NEW.completed=1 THEN 'completed' ELSE 'reopened' END,NEW.updated_at);
END;
