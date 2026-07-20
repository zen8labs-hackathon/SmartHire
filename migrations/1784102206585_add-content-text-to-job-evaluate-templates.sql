-- Up Migration

-- Consolidates the old free-text `jobs.criteria` (never wired into any AI
-- prompt) into `job_evaluate_templates`, which becomes the single source for
-- per-job evaluation content -- either an uploaded file (existing) or plain
-- text (new). Mutually exclusive: a row is either a file or plain text, not
-- both, enforced by the CHECK constraint below.
ALTER TABLE job_evaluate_templates ADD COLUMN content_text text;
ALTER TABLE job_evaluate_templates
  ADD CONSTRAINT job_evaluate_templates_file_xor_text
  CHECK (storage_path IS NULL OR content_text IS NULL);

-- Backfill: carry over any non-empty jobs.criteria into a template row, but
-- only where no template row exists yet -- a job that already has an
-- uploaded PDF template keeps it (criteria was never read by anything, so
-- losing it in that rare overlap case is acceptable).
INSERT INTO job_evaluate_templates (job_id, content_text)
SELECT id, criteria FROM jobs
WHERE criteria IS NOT NULL AND trim(criteria) <> ''
  AND id NOT IN (SELECT job_id FROM job_evaluate_templates);

ALTER TABLE jobs DROP COLUMN criteria;

-- Down Migration

ALTER TABLE jobs ADD COLUMN criteria text;
UPDATE jobs SET criteria = jet.content_text
  FROM job_evaluate_templates jet WHERE jet.job_id = jobs.id AND jet.content_text IS NOT NULL;
ALTER TABLE job_evaluate_templates DROP CONSTRAINT job_evaluate_templates_file_xor_text;
ALTER TABLE job_evaluate_templates DROP COLUMN content_text;
