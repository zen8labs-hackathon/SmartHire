-- Up Migration

CREATE TABLE pipelines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  name text NOT NULL,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX pipelines_name_uniq ON pipelines (lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE pipeline_rows (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  pipeline_id uuid NOT NULL REFERENCES pipelines (id) ON DELETE CASCADE,
  pipeline_stage_id uuid NOT NULL REFERENCES pipeline_stages (id),
  sequence_number integer NOT NULL,
  sla_days integer NOT NULL DEFAULT 5 CHECK (sla_days >= 0),
  schedule boolean NOT NULL DEFAULT false,
  UNIQUE (pipeline_id, sequence_number)
);

CREATE INDEX pipeline_rows_pipeline_idx ON pipeline_rows (pipeline_id);

-- Each job references one pipeline. Nullable so existing jobs stay valid; job_stage_mappings
-- and campaign_applied are untouched and remain the source of truth for per-job stages and
-- candidate progress.
ALTER TABLE jobs ADD COLUMN pipeline_id uuid REFERENCES pipelines (id) ON DELETE SET NULL;

CREATE INDEX jobs_pipeline_idx ON jobs (pipeline_id);

-- A job snapshots its pipeline's rows into job_stage_mappings when a pipeline is applied, so
-- campaign_applied keeps pointing at job_stage_mappings and later pipeline edits don't touch
-- running jobs. Per-row settings are copied alongside; NULL = legacy mapping with no override.
ALTER TABLE job_stage_mappings
  ADD COLUMN sla_days integer CHECK (sla_days IS NULL OR sla_days >= 0),
  ADD COLUMN schedule boolean,
  ADD COLUMN pipeline_row_id uuid REFERENCES pipeline_rows (id) ON DELETE SET NULL;

-- Stage type: free text so new kinds can be added without a migration.
-- Known values: none | schedule | offer | probation. allow_schedule is kept and
-- stays in sync (stage_type = 'schedule' <=> allow_schedule = true) on write.
ALTER TABLE pipeline_stages ADD COLUMN stage_type text NOT NULL DEFAULT 'none';

UPDATE pipeline_stages SET stage_type = 'schedule' WHERE allow_schedule = true;
UPDATE pipeline_stages SET stage_type = 'offer' WHERE code = 'offer' AND stage_type = 'none';

-- Step behaviour flags. Legacy rows default to false and legacy validators ignore them.
ALTER TABLE pipeline_sub_stages
  ADD COLUMN is_terminal boolean NOT NULL DEFAULT false,
  ADD COLUMN requires_reason boolean NOT NULL DEFAULT false,
  ADD COLUMN requires_decision boolean NOT NULL DEFAULT false,
  ADD COLUMN is_withdraw boolean NOT NULL DEFAULT false;

-- Down Migration

ALTER TABLE pipeline_sub_stages
  DROP COLUMN IF EXISTS is_withdraw,
  DROP COLUMN IF EXISTS requires_decision,
  DROP COLUMN IF EXISTS requires_reason,
  DROP COLUMN IF EXISTS is_terminal;

ALTER TABLE pipeline_stages DROP COLUMN IF EXISTS stage_type;

ALTER TABLE job_stage_mappings
  DROP COLUMN IF EXISTS pipeline_row_id,
  DROP COLUMN IF EXISTS schedule,
  DROP COLUMN IF EXISTS sla_days;

DROP INDEX IF EXISTS jobs_pipeline_idx;
ALTER TABLE jobs DROP COLUMN IF EXISTS pipeline_id;

DROP TABLE IF EXISTS pipeline_rows;
DROP TABLE IF EXISTS pipelines;
