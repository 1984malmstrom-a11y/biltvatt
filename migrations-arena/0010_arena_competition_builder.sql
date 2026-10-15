-- Extend the existing league/fight engine. Never rewrite historical results.
ALTER TABLE arena_leagues ADD COLUMN format TEXT NOT NULL DEFAULT 'league' CHECK(format IN ('sprint','daily','league','playoffs','cup'));
ALTER TABLE arena_leagues ADD COLUMN end_day TEXT;
ALTER TABLE arena_leagues ADD COLUMN rules_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(rules_json));
ALTER TABLE arena_leagues ADD COLUMN status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','cancelled'));
ALTER TABLE arena_leagues ADD COLUMN request_key TEXT;
ALTER TABLE arena_leagues ADD COLUMN match_win REAL NOT NULL DEFAULT 1 CHECK(match_win>0 AND match_win<=100);
ALTER TABLE arena_leagues ADD COLUMN match_draw REAL NOT NULL DEFAULT 0.5 CHECK(match_draw>=0 AND match_draw<=100);
ALTER TABLE arena_leagues ADD COLUMN cancellation_json TEXT CHECK(cancellation_json IS NULL OR json_valid(cancellation_json));
CREATE UNIQUE INDEX arena_competition_request ON arena_leagues(request_key) WHERE request_key IS NOT NULL;
ALTER TABLE arena_league_members ADD COLUMN snapshot_name TEXT;
ALTER TABLE arena_league_members ADD COLUMN seed INTEGER;
UPDATE arena_league_members SET snapshot_name=(SELECT name FROM arena_stations WHERE id=station_id);
ALTER TABLE arena_fights ADD COLUMN competition_id TEXT REFERENCES arena_leagues(id);
ALTER TABLE arena_fights ADD COLUMN scope_json TEXT CHECK(scope_json IS NULL OR json_valid(scope_json));
ALTER TABLE arena_fights ADD COLUMN match_win REAL CHECK(match_win>0 AND match_win<=100);
ALTER TABLE arena_fights ADD COLUMN match_draw REAL CHECK(match_draw>=0 AND match_draw<=100);
ALTER TABLE arena_fights ADD COLUMN knockout_json TEXT CHECK(knockout_json IS NULL OR json_valid(knockout_json));
ALTER TABLE arena_fights ADD COLUMN cancellation_json TEXT CHECK(cancellation_json IS NULL OR json_valid(cancellation_json));
ALTER TABLE arena_fights ADD COLUMN participant_json TEXT CHECK(participant_json IS NULL OR json_valid(participant_json));
-- Updating metadata on already frozen fights would hit the old immutable trigger;
-- only live legacy fixtures need association. Frozen fixtures stay byte-identical.
UPDATE arena_fights SET competition_id=(SELECT league_id FROM arena_league_fixtures WHERE fight_id=arena_fights.id) WHERE result_json IS NULL;
UPDATE arena_leagues SET end_day=(SELECT MAX(day) FROM arena_league_fixtures WHERE league_id=arena_leagues.id) WHERE result_json IS NULL;
CREATE INDEX arena_fight_competition ON arena_fights(competition_id,start_at);
CREATE TABLE arena_bracket_slots (
 competition_id TEXT NOT NULL REFERENCES arena_leagues(id),round_no INTEGER NOT NULL,slot_no INTEGER NOT NULL,
 home_id TEXT REFERENCES arena_stations(id),away_id TEXT REFERENCES arena_stations(id),fight_id TEXT UNIQUE REFERENCES arena_fights(id),
 winner_id TEXT REFERENCES arena_stations(id),result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
 PRIMARY KEY(competition_id,round_no,slot_no),CHECK(home_id IS NULL OR away_id IS NULL OR home_id<>away_id)
);
CREATE TRIGGER arena_bracket_immutable BEFORE UPDATE ON arena_bracket_slots WHEN OLD.result_json IS NOT NULL
BEGIN SELECT RAISE(ABORT,'arena_bracket_immutable'); END;
CREATE TABLE arena_station_bookings (
 station_id TEXT NOT NULL REFERENCES arena_stations(id),owner_id TEXT NOT NULL,start_at TEXT NOT NULL,end_at TEXT NOT NULL,
 released_at TEXT,PRIMARY KEY(station_id,owner_id),CHECK(end_at>start_at)
);
CREATE INDEX arena_booking_period ON arena_station_bookings(station_id,start_at,end_at) WHERE released_at IS NULL;
-- Grandfather any old overlaps; block new ones without altering old fights.
INSERT INTO arena_station_bookings(station_id,owner_id,start_at,end_at)
 SELECT m.station_id,COALESCE(f.competition_id,f.id),MIN(f.start_at),MAX(f.end_at)
 FROM arena_fight_stations m JOIN arena_fights f ON f.id=m.fight_id WHERE f.status<>'cancelled'
 GROUP BY m.station_id,COALESCE(f.competition_id,f.id);
CREATE TRIGGER arena_booking_exclusion BEFORE INSERT ON arena_station_bookings
WHEN NEW.released_at IS NULL AND EXISTS(SELECT 1 FROM arena_station_bookings b WHERE b.station_id=NEW.station_id AND b.owner_id<>NEW.owner_id AND b.released_at IS NULL AND b.start_at<NEW.end_at AND b.end_at>NEW.start_at)
BEGIN SELECT RAISE(ABORT,'arena_station_busy'); END;
CREATE TRIGGER arena_booking_update_exclusion BEFORE UPDATE OF start_at,end_at,released_at ON arena_station_bookings
WHEN NEW.released_at IS NULL AND EXISTS(SELECT 1 FROM arena_station_bookings b WHERE b.station_id=NEW.station_id AND b.owner_id<>NEW.owner_id AND b.released_at IS NULL AND b.start_at<NEW.end_at AND b.end_at>NEW.start_at)
BEGIN SELECT RAISE(ABORT,'arena_station_busy'); END;
CREATE TRIGGER arena_fight_booking AFTER INSERT ON arena_fight_stations
BEGIN INSERT INTO arena_station_bookings(station_id,owner_id,start_at,end_at)
 SELECT NEW.station_id,COALESCE(f.competition_id,f.id),f.start_at,f.end_at FROM arena_fights f WHERE f.id=NEW.fight_id AND f.status<>'cancelled'
 ON CONFLICT(station_id,owner_id) DO NOTHING; END;
CREATE TRIGGER arena_fight_cancel_booking AFTER UPDATE OF status ON arena_fights WHEN NEW.status='cancelled' AND NEW.competition_id IS NULL
BEGIN UPDATE arena_station_bookings SET released_at=NEW.updated_at WHERE owner_id=NEW.id; END;
CREATE TRIGGER arena_competition_cancel_booking AFTER UPDATE OF status ON arena_leagues WHEN NEW.status='cancelled'
BEGIN UPDATE arena_station_bookings SET released_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE owner_id=NEW.id; END;
CREATE TABLE arena_activity_categories (
 id TEXT PRIMARY KEY,name TEXT NOT NULL
);
INSERT INTO arena_activity_categories VALUES('wash','BILTVÄTT'),('fika','KAFFE / FIKA'),('food','MAT'),('drink','DRYCK'),('car-care','BILVÅRD'),('campaign','KAMPANJ'),('other','ÖVRIGT');
ALTER TABLE arena_activities ADD COLUMN arena_category_id TEXT REFERENCES arena_activity_categories(id);
CREATE TABLE arena_fight_activity_rules (
 fight_id TEXT NOT NULL REFERENCES arena_fights(id),station_id TEXT NOT NULL REFERENCES arena_stations(id),
 activity_id TEXT NOT NULL REFERENCES arena_activities(id),snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 PRIMARY KEY(fight_id,station_id,activity_id)
);
CREATE TRIGGER arena_fight_mapping_immutable BEFORE UPDATE ON arena_fight_activity_rules BEGIN SELECT RAISE(ABORT,'arena_fight_mapping_immutable'); END;
CREATE TRIGGER arena_fight_mapping_no_delete BEFORE DELETE ON arena_fight_activity_rules BEGIN SELECT RAISE(ABORT,'arena_fight_mapping_immutable'); END;
-- Temporary activity support is intentionally NOT wired into the seven home slots.
CREATE TABLE arena_temporary_fight_activities (
 id TEXT PRIMARY KEY,fight_id TEXT NOT NULL REFERENCES arena_fights(id),station_id TEXT NOT NULL REFERENCES arena_stations(id),
 start_at TEXT NOT NULL,end_at TEXT NOT NULL,snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 CHECK(end_at>start_at),UNIQUE(fight_id,station_id)
);
CREATE TABLE arena_challenges (
 id TEXT PRIMARY KEY,request_key TEXT NOT NULL UNIQUE,challenger_id TEXT NOT NULL REFERENCES arena_stations(id),
 challenged_id TEXT NOT NULL REFERENCES arena_stations(id),day TEXT NOT NULL,expires_at TEXT NOT NULL,
 rules_json TEXT NOT NULL CHECK(json_valid(rules_json)),status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','withdrawn','expired','cancelled')),
 competition_id TEXT UNIQUE REFERENCES arena_leagues(id),response_json TEXT CHECK(response_json IS NULL OR json_valid(response_json)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 CHECK(challenger_id<>challenged_id)
);
CREATE INDEX arena_challenge_incoming ON arena_challenges(challenged_id,status,expires_at);
CREATE INDEX arena_challenge_outgoing ON arena_challenges(challenger_id,created_at);
CREATE TABLE arena_fight_notifications (
 id TEXT PRIMARY KEY,station_id TEXT NOT NULL REFERENCES arena_stations(id),event_key TEXT NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,
 resource_id TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT,push_state TEXT NOT NULL DEFAULT 'pending',UNIQUE(station_id,event_key)
);
CREATE INDEX arena_fight_notice_station ON arena_fight_notifications(station_id,read_at,created_at);
ALTER TABLE arena_registrations ADD COLUMN event_snapshot TEXT CHECK(event_snapshot IS NULL OR json_valid(event_snapshot));
CREATE TRIGGER arena_registration_identity_snapshot AFTER INSERT ON arena_registrations
BEGIN UPDATE arena_registrations SET event_snapshot=(SELECT json_object('seller_name',p.name,'station_name',s.name,'activity_name',a.name,'display_mode',a.display_mode,'avatar_index',p.avatar_index) FROM arena_sellers p JOIN arena_stations s ON s.id=NEW.station_id JOIN arena_activities a ON a.id=NEW.activity_id WHERE p.id=NEW.seller_id) WHERE id=NEW.id; END;
CREATE TRIGGER arena_registration_identity_immutable BEFORE UPDATE OF event_snapshot ON arena_registrations WHEN OLD.event_snapshot IS NOT NULL
BEGIN SELECT RAISE(ABORT,'arena_registration_identity_immutable'); END;
CREATE TRIGGER arena_challenge_state_guard BEFORE UPDATE OF status ON arena_challenges
WHEN NOT ((OLD.status='pending' AND NEW.status IN ('accepted','declined','withdrawn','expired')) OR (OLD.status='accepted' AND NEW.status='cancelled') OR OLD.status=NEW.status)
BEGIN SELECT RAISE(ABORT,'arena_challenge_closed'); END;
CREATE TRIGGER arena_challenge_accept_guard BEFORE UPDATE OF status ON arena_challenges WHEN NEW.status='accepted' AND (OLD.status<>'pending' OR OLD.expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))
BEGIN SELECT RAISE(ABORT,'arena_challenge_closed'); END;
ALTER TABLE arena_reports ADD COLUMN competition_id TEXT REFERENCES arena_leagues(id);
CREATE INDEX arena_report_competition ON arena_reports(competition_id,created_at);
CREATE TRIGGER arena_temporary_fight_immutable BEFORE UPDATE ON arena_temporary_fight_activities
BEGIN SELECT RAISE(ABORT,'arena_temporary_fight_immutable'); END;
CREATE TRIGGER arena_temporary_fight_no_delete BEFORE DELETE ON arena_temporary_fight_activities
BEGIN SELECT RAISE(ABORT,'arena_temporary_fight_immutable'); END;
CREATE INDEX arena_knockout_window ON arena_fights(start_at,end_at) WHERE knockout_json IS NOT NULL;
CREATE TRIGGER IF NOT EXISTS arena_fight_scope_frozen BEFORE UPDATE OF scope_json,participant_json,match_win,match_draw,knockout_json,competition_id ON arena_fights
WHEN OLD.scope_json IS NOT NULL OR OLD.result_json IS NOT NULL
BEGIN SELECT RAISE(ABORT,'arena_fight_rules_immutable'); END;
CREATE TRIGGER IF NOT EXISTS arena_competition_rules_frozen BEFORE UPDATE OF rules_json,format,match_win,match_draw,start_day,end_day ON arena_leagues WHEN OLD.request_key IS NOT NULL
BEGIN SELECT RAISE(ABORT,'arena_competition_rules_immutable'); END;
CREATE TRIGGER IF NOT EXISTS arena_competition_member_frozen BEFORE UPDATE ON arena_league_members
WHEN OLD.snapshot_name IS NOT NULL AND EXISTS(SELECT 1 FROM arena_leagues WHERE id=OLD.league_id AND request_key IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'arena_competition_members_immutable'); END;
CREATE TRIGGER IF NOT EXISTS arena_competition_member_no_delete BEFORE DELETE ON arena_league_members
WHEN EXISTS(SELECT 1 FROM arena_leagues WHERE id=OLD.league_id AND request_key IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'arena_competition_members_immutable'); END;
CREATE TRIGGER IF NOT EXISTS arena_competition_member_guard BEFORE INSERT ON arena_league_members
WHEN EXISTS(SELECT 1 FROM arena_leagues WHERE id=NEW.league_id AND request_key IS NOT NULL AND NOT EXISTS(SELECT 1 FROM json_each(rules_json,'$.station_ids') WHERE value=NEW.station_id))
BEGIN SELECT RAISE(ABORT,'arena_competition_station_mismatch'); END;
