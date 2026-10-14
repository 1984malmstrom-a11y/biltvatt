ALTER TABLE arena_fights ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE arena_fights ADD COLUMN score_metric TEXT NOT NULL DEFAULT 'points' CHECK(score_metric IN ('points','tb','count'));
UPDATE arena_fights SET score_metric=scoring;
ALTER TABLE arena_fights ADD COLUMN result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json));
ALTER TABLE arena_fights ADD COLUMN finished_at TEXT;
ALTER TABLE arena_fights ADD COLUMN leader_signature TEXT NOT NULL DEFAULT '';
ALTER TABLE arena_fights ADD COLUMN leader_checked_at TEXT NOT NULL DEFAULT '';
ALTER TABLE arena_fights ADD COLUMN live_json TEXT CHECK(live_json IS NULL OR json_valid(live_json));
ALTER TABLE arena_fights ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE arena_fights ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
CREATE INDEX arena_fight_period ON arena_fights(status,start_at,end_at);
CREATE INDEX arena_fight_station_lookup ON arena_fight_stations(station_id,fight_id);
CREATE TABLE arena_fight_lead_events (
  id TEXT PRIMARY KEY,
  fight_id TEXT NOT NULL REFERENCES arena_fights(id),
  version INTEGER NOT NULL,
  station_id TEXT NOT NULL REFERENCES arena_stations(id),
  station_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(fight_id,version)
);
CREATE TRIGGER arena_fight_result_immutable BEFORE UPDATE OF result_json,start_at,end_at,score_metric,scoring,status,name,description ON arena_fights
WHEN OLD.result_json IS NOT NULL
BEGIN SELECT RAISE(ABORT,'arena_fight_result_immutable'); END;
CREATE TRIGGER arena_fight_finished_members_insert BEFORE INSERT ON arena_fight_stations
WHEN EXISTS(SELECT 1 FROM arena_fights WHERE id=NEW.fight_id AND result_json IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'arena_fight_result_immutable'); END;
CREATE TRIGGER arena_fight_finished_members_delete BEFORE DELETE ON arena_fight_stations
WHEN EXISTS(SELECT 1 FROM arena_fights WHERE id=OLD.fight_id AND result_json IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'arena_fight_result_immutable'); END;
