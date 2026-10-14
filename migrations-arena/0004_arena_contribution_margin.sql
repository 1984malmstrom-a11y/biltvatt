-- Money is always an integer number of öre. Existing sales retain unknown TB.
ALTER TABLE arena_activities ADD COLUMN tb_ore INTEGER NOT NULL DEFAULT 0 CHECK(typeof(tb_ore)='integer' AND tb_ore BETWEEN 0 AND 100000000);
ALTER TABLE arena_activities ADD COLUMN display_mode TEXT NOT NULL DEFAULT 'points' CHECK(display_mode IN ('points','tb'));
ALTER TABLE arena_registrations ADD COLUMN tb_ore_awarded INTEGER CHECK(tb_ore_awarded IS NULL OR (typeof(tb_ore_awarded)='integer' AND tb_ore_awarded BETWEEN 0 AND 100000000));
CREATE TRIGGER arena_tb_snapshot_guard BEFORE UPDATE OF tb_ore_awarded ON arena_registrations
BEGIN SELECT RAISE(ABORT,'arena_snapshot_immutable'); END;
