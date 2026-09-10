-- Up Migration

-- Lets an evaluation template exist without a job: `job_evaluate_templates`
-- was "one row per job" (job_id NOT NULL UNIQUE); it becomes "one row per
-- template, optionally attached to a job" so a recruiter can build a
-- reusable library on /admin/evaluation-template before any job needs it.
--
-- `job_id IS NULL` rows are library entries. `job_id IS NOT NULL` rows are a
-- job's active template, same as before -- still capped at one per job via
-- the partial unique index replacing the old plain UNIQUE.
ALTER TABLE job_evaluate_templates ALTER COLUMN job_id DROP NOT NULL;
ALTER TABLE job_evaluate_templates DROP CONSTRAINT job_evaluate_templates_job_id_key;
CREATE UNIQUE INDEX job_evaluate_templates_job_id_uidx
  ON job_evaluate_templates (job_id) WHERE job_id IS NOT NULL;

-- Library entries have no job to name them by, so they need their own label.
-- Nullable at the DB level (a job-attached row still doesn't need one -- the
-- job's position names it); the app requires it for library entries.
ALTER TABLE job_evaluate_templates ADD COLUMN title text;

-- Down Migration

ALTER TABLE job_evaluate_templates DROP COLUMN title;
DROP INDEX job_evaluate_templates_job_id_uidx;
-- Down assumes no library rows (job_id IS NULL) exist -- true immediately
-- after this migration's Up, false once the feature has been used. Delete
-- any library rows first if rolling back for real.
ALTER TABLE job_evaluate_templates ADD CONSTRAINT job_evaluate_templates_job_id_key UNIQUE (job_id);
ALTER TABLE job_evaluate_templates ALTER COLUMN job_id SET NOT NULL;
