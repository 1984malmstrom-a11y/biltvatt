-- The reset marker is permanent. Re-enable exactly the originally active programs.
UPDATE wash_programs SET active=CASE WHEN id IN
  (SELECT value FROM json_each((SELECT value FROM settings WHERE key='station_v2_launch_programs')))
  THEN 1 ELSE 0 END
WHERE EXISTS(SELECT 1 FROM settings WHERE key='station_v2_zero_reset_done')
  AND EXISTS(SELECT 1 FROM settings WHERE key='station_v2_launch_lock' AND value='1');
UPDATE settings SET value='0',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE key='station_v2_launch_lock' AND value='1'
  AND EXISTS(SELECT 1 FROM settings WHERE key='station_v2_zero_reset_done')
  AND NOT EXISTS(
    SELECT 1 FROM wash_programs WHERE active != CASE WHEN id IN
      (SELECT value FROM json_each((SELECT value FROM settings WHERE key='station_v2_launch_programs')))
      THEN 1 ELSE 0 END
  );
