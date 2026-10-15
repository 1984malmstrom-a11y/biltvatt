-- Additive only. Existing fights remain total scoring and frozen results are untouched.
ALTER TABLE arena_fights ADD COLUMN scoring_mode TEXT NOT NULL DEFAULT 'total' CHECK(scoring_mode IN ('total','daily'));
ALTER TABLE arena_fights ADD COLUMN day_win_points INTEGER NOT NULL DEFAULT 1 CHECK(day_win_points BETWEEN 1 AND 100);
ALTER TABLE arena_fights ADD COLUMN day_tie_points INTEGER NOT NULL DEFAULT 0 CHECK(day_tie_points IN (0,1));
CREATE TABLE arena_fight_days (
 fight_id TEXT NOT NULL REFERENCES arena_fights(id), day TEXT NOT NULL,
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 PRIMARY KEY(fight_id,day)
);
CREATE TRIGGER arena_fight_day_immutable BEFORE UPDATE ON arena_fight_days
BEGIN SELECT RAISE(ABORT,'arena_fight_day_immutable'); END;
CREATE TRIGGER arena_fight_day_no_delete BEFORE DELETE ON arena_fight_days
BEGIN SELECT RAISE(ABORT,'arena_fight_day_immutable'); END;
CREATE TRIGGER arena_fight_daily_rules_immutable BEFORE UPDATE OF scoring_mode,day_win_points,day_tie_points ON arena_fights
WHEN OLD.result_json IS NOT NULL OR EXISTS(SELECT 1 FROM arena_fight_days WHERE fight_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'arena_fight_result_immutable'); END;
CREATE TABLE arena_leagues (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, metric TEXT NOT NULL CHECK(metric IN ('points','tb','count')),
 start_day TEXT NOT NULL, day_win_points INTEGER NOT NULL CHECK(day_win_points BETWEEN 1 AND 100),
 day_tie_points INTEGER NOT NULL CHECK(day_tie_points IN (0,1)),
 result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)), created_at TEXT NOT NULL
);
CREATE TABLE arena_league_members (
 league_id TEXT NOT NULL REFERENCES arena_leagues(id),station_id TEXT NOT NULL REFERENCES arena_stations(id),
 PRIMARY KEY(league_id,station_id)
);
CREATE INDEX arena_league_member_station ON arena_league_members(station_id,league_id);
CREATE TABLE arena_league_fixtures (
 league_id TEXT NOT NULL REFERENCES arena_leagues(id), round_no INTEGER NOT NULL,
 day TEXT NOT NULL, fight_id TEXT NOT NULL UNIQUE REFERENCES arena_fights(id),
 home_id TEXT NOT NULL REFERENCES arena_stations(id),away_id TEXT NOT NULL REFERENCES arena_stations(id),
 CHECK(home_id<>away_id),PRIMARY KEY(league_id,home_id,away_id)
);
CREATE INDEX arena_league_round ON arena_league_fixtures(league_id,round_no);
CREATE TRIGGER arena_league_frozen BEFORE UPDATE ON arena_leagues WHEN OLD.result_json IS NOT NULL
BEGIN SELECT RAISE(ABORT,'arena_league_result_immutable'); END;
