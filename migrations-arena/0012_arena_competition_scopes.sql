-- Additive, opt-in tenant boundaries. Existing customers are never auto-grouped.
CREATE TABLE arena_organizations(id TEXT PRIMARY KEY,name TEXT NOT NULL,country_code TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE arena_regions(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES arena_organizations(id),name TEXT NOT NULL,UNIQUE(id,organization_id));
CREATE TABLE arena_districts(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,region_id TEXT NOT NULL,name TEXT NOT NULL,FOREIGN KEY(region_id,organization_id) REFERENCES arena_regions(id,organization_id),UNIQUE(id,region_id,organization_id));
CREATE TABLE arena_station_organization(station_id TEXT PRIMARY KEY REFERENCES arena_stations(id),organization_id TEXT NOT NULL REFERENCES arena_organizations(id),region_id TEXT NOT NULL,district_id TEXT NOT NULL,FOREIGN KEY(district_id,region_id,organization_id) REFERENCES arena_districts(id,region_id,organization_id));
CREATE INDEX arena_org_stations ON arena_station_organization(organization_id,region_id,district_id,station_id);
CREATE TABLE arena_organization_grants(account_id TEXT NOT NULL REFERENCES arena_superadmins(id),organization_id TEXT NOT NULL REFERENCES arena_organizations(id),level TEXT NOT NULL CHECK(level IN ('national','region','district')),region_id TEXT NOT NULL DEFAULT '',district_id TEXT NOT NULL DEFAULT '',PRIMARY KEY(account_id,organization_id,level,region_id,district_id));
ALTER TABLE arena_leagues ADD COLUMN organization_id TEXT REFERENCES arena_organizations(id);
CREATE INDEX arena_competition_org ON arena_leagues(organization_id,created_at);
CREATE TRIGGER arena_competition_org_frozen BEFORE UPDATE OF organization_id ON arena_leagues WHEN OLD.request_key IS NOT NULL BEGIN SELECT RAISE(ABORT,'arena_competition_scope_immutable'); END;
CREATE TABLE arena_customer_flow(id TEXT PRIMARY KEY,station_id TEXT NOT NULL REFERENCES arena_stations(id),customers_milli INTEGER NOT NULL CHECK(customers_milli BETWEEN 1 AND 1000000000),source TEXT NOT NULL,period_start TEXT NOT NULL,period_end TEXT NOT NULL,recorded_at TEXT NOT NULL,actor_id TEXT NOT NULL,CHECK(period_end>=period_start));
CREATE INDEX arena_customer_flow_latest ON arena_customer_flow(station_id,recorded_at DESC,id DESC);
CREATE TRIGGER arena_customer_flow_immutable BEFORE UPDATE ON arena_customer_flow BEGIN SELECT RAISE(ABORT,'arena_customer_flow_immutable'); END;
CREATE TRIGGER arena_customer_flow_no_delete BEFORE DELETE ON arena_customer_flow BEGIN SELECT RAISE(ABORT,'arena_customer_flow_immutable'); END;
CREATE INDEX arena_registration_competition ON arena_registrations(station_id,registered_at,activity_id,seller_id);
