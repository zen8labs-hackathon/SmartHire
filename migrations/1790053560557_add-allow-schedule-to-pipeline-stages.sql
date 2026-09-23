-- Up Migration

-- Pipeline stages are fully custom per job (arbitrary `code`, no fixed set --
-- see migrations/1783914203310_pipeline-stages.sql), so the interview
-- scheduling feature can no longer key off `code = 'interview'`: a job's
-- pipeline may have zero "interview"-coded stages, or several interview-like
-- stages under different codes. This flag lets an admin mark, per stage,
-- whether the "Schedule" action (app/api/admin/candidates/[id]/timeline)
-- should be offered for it.
ALTER TABLE pipeline_stages
  ADD COLUMN allow_schedule boolean NOT NULL DEFAULT false;

-- Preserve current behavior for existing pipelines: the schedule feature was
-- previously hardcoded to the "interview" code, so any stage already using
-- that code keeps scheduling enabled without admins having to reconfigure it.
UPDATE pipeline_stages SET allow_schedule = true WHERE code = 'interview';

-- Down Migration

ALTER TABLE pipeline_stages
  DROP COLUMN allow_schedule;
