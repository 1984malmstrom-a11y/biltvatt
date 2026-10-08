-- V1 registers sales only for active programs. Keep original active IDs privately in D1.
INSERT OR IGNORE INTO settings(key,value,updated_at)
VALUES('station_v2_launch_programs',
       (SELECT coalesce(json_group_array(id),'[]') FROM wash_programs WHERE active=1),
       strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT INTO settings(key,value,updated_at)
SELECT 'station_v2_launch_lock','1',strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS(SELECT 1 FROM settings WHERE key='station_v2_zero_reset_done')
ON CONFLICT(key) DO UPDATE SET value='1',updated_at=excluded.updated_at;
UPDATE wash_programs SET active=0
WHERE EXISTS(SELECT 1 FROM settings WHERE key='station_v2_launch_lock' AND value='1')
  AND NOT EXISTS(SELECT 1 FROM settings WHERE key='station_v2_zero_reset_done');
