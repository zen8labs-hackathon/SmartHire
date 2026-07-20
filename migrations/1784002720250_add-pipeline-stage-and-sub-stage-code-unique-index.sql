-- Up Migration

-- Restores the uniqueness guarantees dropped when pipeline_stages /
-- pipeline_sub_stages were ported as-is under DB7X2K (see
-- migrations/1783914203310_pipeline-stages.sql). The old Supabase schema
-- enforced these via partial unique indexes
-- (pipeline_stages_code_idx, pipeline_sub_stages_stage_code_idx); the port
-- carried the tables over but not the indexes. The API routes
-- (app/api/admin/pipelines/route.ts, .../sub-stages/route.ts) already catch
-- isUniqueViolation and return 409, so without these indexes duplicate codes
-- silently succeed instead of being rejected. Partial on deleted_at IS NULL
-- so a soft-deleted stage/sub-stage's code can be reused.
CREATE UNIQUE INDEX pipeline_stages_code_unique_idx
  ON pipeline_stages (code)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX pipeline_sub_stages_stage_code_unique_idx
  ON pipeline_sub_stages (pipeline_stage_id, code)
  WHERE deleted_at IS NULL;

-- Down Migration

DROP INDEX IF EXISTS pipeline_stages_code_unique_idx;
DROP INDEX IF EXISTS pipeline_sub_stages_stage_code_unique_idx;
