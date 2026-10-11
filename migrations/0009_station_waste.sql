-- V3.0: independent station waste register. Existing station data is untouched.
CREATE TABLE station_waste_items (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  expires_on TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0 CHECK(resolved IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX station_waste_active_date ON station_waste_items(station_id,resolved,expires_on,created_at,id);
