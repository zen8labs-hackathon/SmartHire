-- Up Migration

-- pipeline_stages / pipeline_sub_stages / job_stage_mappings are ported as-is (DB7X2K item 4,
-- explicitly excepted from the new uuid-v7/int PK policy -- changing PK type on tables this
-- widely FK'd is a separate, riskier migration). gen_random_uuid() matches the current live
-- default, not uuid_generate_v7(). Only change: job_stage_mappings.job_opening_id -> job_id,
-- pointing at the merged `jobs` table instead of the old job_openings.
CREATE TABLE pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  "desc" text,
  color text DEFAULT 'zinc',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE pipeline_sub_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_stage_id uuid NOT NULL REFERENCES pipeline_stages (id),
  code text NOT NULL,
  label text NOT NULL,
  sequence_number integer NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_passed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX pipeline_sub_stages_pipeline_stage_idx ON pipeline_sub_stages (pipeline_stage_id);

CREATE TABLE job_stage_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  pipeline_stage_id uuid NOT NULL REFERENCES pipeline_stages (id),
  sequence_number integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX job_stage_mappings_job_idx ON job_stage_mappings (job_id);
CREATE INDEX job_stage_mappings_pipeline_stage_idx ON job_stage_mappings (pipeline_stage_id);

-- Down Migration

DROP TABLE IF EXISTS job_stage_mappings;
DROP TABLE IF EXISTS pipeline_sub_stages;
DROP TABLE IF EXISTS pipeline_stages;
