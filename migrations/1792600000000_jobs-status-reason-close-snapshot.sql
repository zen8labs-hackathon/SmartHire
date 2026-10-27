-- Up Migration

-- AC-06-16: reason entered when a position is put on hold or reopened.
-- BR-06-13: per-stage candidate counts captured when the position is closed.
ALTER TABLE jobs
  ADD COLUMN status_reason text,
  ADD COLUMN close_snapshot jsonb;

-- Down Migration

ALTER TABLE jobs
  DROP COLUMN IF EXISTS close_snapshot,
  DROP COLUMN IF EXISTS status_reason;
