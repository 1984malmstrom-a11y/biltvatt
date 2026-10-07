-- Forward-only maintenance support. Never remove sales or rewrite applied migrations.
ALTER TABLE staff ADD COLUMN deleted_at TEXT;
ALTER TABLE sales ADD COLUMN updated_at TEXT;
ALTER TABLE sales ADD COLUMN updated_by TEXT;
ALTER TABLE sales ADD COLUMN void_reason TEXT;
ALTER TABLE sales ADD COLUMN voided_by TEXT;
ALTER TABLE sales ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN reset_id TEXT;
UPDATE sales SET updated_at=created_at;
UPDATE sales SET void_reason='SELLER_UNDO' WHERE voided_at IS NOT NULL;

CREATE TABLE maintenance_previews (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, filters_json TEXT NOT NULL,
  label TEXT NOT NULL, period_label TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
  revenue INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, used_at TEXT
);
CREATE TABLE maintenance_preview_sales (
  preview_id TEXT NOT NULL REFERENCES maintenance_previews(id) ON DELETE CASCADE,
  sale_id TEXT NOT NULL REFERENCES sales(id), revision INTEGER NOT NULL,
  PRIMARY KEY(preview_id,sale_id)
);
CREATE TABLE reset_batches (
  id TEXT PRIMARY KEY REFERENCES maintenance_previews(id), label TEXT NOT NULL,
  period_label TEXT NOT NULL, count INTEGER NOT NULL, revenue INTEGER NOT NULL,
  created_at TEXT NOT NULL, created_by TEXT NOT NULL
);
CREATE INDEX sales_reset ON sales(reset_id,void_reason);
CREATE TABLE sales_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id TEXT NOT NULL REFERENCES sales(id),
  action TEXT NOT NULL, actor TEXT NOT NULL, changed_at TEXT NOT NULL,
  before_json TEXT NOT NULL, after_json TEXT NOT NULL
);
CREATE INDEX sales_audit_sale ON sales_audit(sale_id,id);
CREATE TRIGGER sales_maintenance_audit AFTER UPDATE OF revision ON sales
WHEN NEW.revision != OLD.revision BEGIN
  INSERT INTO sales_audit(sale_id,action,actor,changed_at,before_json,after_json)
  VALUES(NEW.id,CASE WHEN OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL THEN NEW.void_reason
    WHEN OLD.voided_at IS NOT NULL AND NEW.voided_at IS NULL THEN 'ADMIN_RESTORE' ELSE 'ADMIN_CORRECTION' END,
    COALESCE(NEW.updated_by,'ADMIN'),NEW.updated_at,
    json_object('staff_id',OLD.staff_id,'wash_program_id',OLD.wash_program_id,'price_sek',OLD.price_sek,'voided_at',OLD.voided_at,'void_reason',OLD.void_reason,'reset_id',OLD.reset_id,'revision',OLD.revision),
    json_object('staff_id',NEW.staff_id,'wash_program_id',NEW.wash_program_id,'price_sek',NEW.price_sek,'voided_at',NEW.voided_at,'void_reason',NEW.void_reason,'reset_id',NEW.reset_id,'revision',NEW.revision));
END;
CREATE TABLE staff_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT NOT NULL,
  action TEXT NOT NULL, changed_at TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT
);
CREATE TRIGGER staff_change_audit AFTER UPDATE ON staff BEGIN
  INSERT INTO staff_audit(staff_id,action,changed_at,before_json,after_json)
  VALUES(OLD.id,CASE WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN 'ARCHIVE' ELSE 'EDIT' END,
    strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    json_object('name',OLD.name,'color',OLD.color,'active',OLD.active,'deleted_at',OLD.deleted_at),
    json_object('name',NEW.name,'color',NEW.color,'active',NEW.active,'deleted_at',NEW.deleted_at));
END;
CREATE TRIGGER staff_delete_audit AFTER DELETE ON staff BEGIN
  INSERT INTO staff_audit(staff_id,action,changed_at,before_json)
  VALUES(OLD.id,'DELETE',strftime('%Y-%m-%dT%H:%M:%fZ','now'),json_object('name',OLD.name,'color',OLD.color,'active',OLD.active));
END;
