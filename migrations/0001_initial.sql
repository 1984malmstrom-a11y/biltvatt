PRAGMA foreign_keys = ON;
CREATE TABLE staff (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE wash_programs (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
  price_sek INTEGER NOT NULL CHECK(price_sek >= 0), sort_order INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE sales (
  id TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff(id),
  wash_program_id TEXT NOT NULL REFERENCES wash_programs(id),
  price_sek INTEGER NOT NULL CHECK(price_sek >= 0), sold_at TEXT NOT NULL,
  voided_at TEXT, created_at TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE, undo_token_hash TEXT NOT NULL
);
CREATE INDEX sales_period ON sales(sold_at, voided_at);
CREATE INDEX sales_staff_period ON sales(staff_id, sold_at);
CREATE INDEX sales_program_period ON sales(wash_program_id, sold_at);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE admin_sessions (token_hash TEXT PRIMARY KEY, expires_at TEXT NOT NULL);
CREATE INDEX sessions_expiry ON admin_sessions(expires_at);
CREATE TABLE login_attempts (ip_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start TEXT NOT NULL);
INSERT INTO staff (id,name,color) VALUES
 ('peter','Peter','#0676ed'),('emma','Emma','#da40b9'),('johan','Johan','#14843e'),('lisa','Lisa','#f88721'),('kalle','Kalle','#8c45e8');
INSERT INTO wash_programs (id,name,price_sek,sort_order) VALUES
 ('preemium','Preemium',389,1),('finast-plus','Finast Plus',329,2),('hosttvatt','Hösttvätt',259,3),
 ('finast','Finast',219,4),('fin','Fin',179,5),('borstlos','Borstlös',199,6);
INSERT INTO settings (key,value,updated_at) VALUES
 ('daily_goal','25',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('monthly_goal','500',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
