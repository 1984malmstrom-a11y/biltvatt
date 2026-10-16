-- Bound administrative lookups to the selected tenant as organisations grow.
CREATE INDEX arena_regions_organization ON arena_regions(organization_id,id);
CREATE INDEX arena_districts_organization ON arena_districts(organization_id,region_id,id);
