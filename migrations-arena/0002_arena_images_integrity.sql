-- Product bytes never travel in bootstrap or statistics responses.
CREATE TABLE arena_activity_images (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL REFERENCES arena_stations(id),
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/webp','image/png')),
  image_bytes BLOB NOT NULL CHECK(length(image_bytes) <= 250000),
  width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 640),
  height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 640),
  created_at TEXT NOT NULL
);
CREATE INDEX arena_images_station ON arena_activity_images(station_id);
CREATE INDEX arena_valid_registrations ON arena_registrations(station_id, registered_at, seller_id, activity_id) WHERE voided_at IS NULL;

-- Defense in depth for future writers using the central database.
CREATE TRIGGER arena_registration_station_guard BEFORE INSERT ON arena_registrations
WHEN NOT EXISTS (SELECT 1 FROM arena_sellers WHERE id=NEW.seller_id AND station_id=NEW.station_id)
  OR NOT EXISTS (SELECT 1 FROM arena_activities WHERE id=NEW.activity_id AND station_id=NEW.station_id)
  OR (NEW.campaign_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM arena_campaigns WHERE id=NEW.campaign_id AND station_id=NEW.station_id AND activity_id=NEW.activity_id))
BEGIN SELECT RAISE(ABORT, 'arena_station_mismatch'); END;
CREATE TRIGGER arena_registration_snapshot_guard BEFORE UPDATE OF station_id,seller_id,activity_id,campaign_id,points_awarded,registered_at,request_id ON arena_registrations
BEGIN SELECT RAISE(ABORT, 'arena_snapshot_immutable'); END;
