-- One immutable event receipt per registration. Retries return the same events.
CREATE TABLE arena_registration_achievements (
  registration_id TEXT PRIMARY KEY REFERENCES arena_registrations(id),
  station_id TEXT NOT NULL REFERENCES arena_stations(id),
  events_json TEXT NOT NULL CHECK(json_valid(events_json)),
  created_at TEXT NOT NULL
);
CREATE INDEX arena_achievement_station ON arena_registration_achievements(station_id,created_at);
CREATE TRIGGER arena_achievement_snapshot_guard BEFORE UPDATE ON arena_registration_achievements
BEGIN SELECT RAISE(ABORT,'arena_achievement_immutable'); END;
