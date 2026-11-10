-- Up Migration
ALTER TABLE candidates ADD COLUMN is_starred boolean NOT NULL DEFAULT false;
-- Down Migration
ALTER TABLE candidates DROP COLUMN is_starred;
