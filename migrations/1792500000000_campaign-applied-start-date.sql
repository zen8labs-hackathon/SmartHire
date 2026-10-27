-- Up Migration

-- Hire (D2): the candidate's agreed start date, captured by the Hire dialog
-- when the application enters a probation-type stage.
ALTER TABLE campaign_applied
  ADD COLUMN start_date date;

-- hired_at now means "entered a stage with stage_type = 'probation'"; backfill
-- applications already sitting in such a stage.
UPDATE campaign_applied ca
SET hired_at = ca.updated_at
FROM job_stage_mappings jsm
JOIN pipeline_stages ps ON ps.id = jsm.pipeline_stage_id
WHERE ca.current_job_stage_mapping_id = jsm.id
  AND ps.stage_type = 'probation'
  AND ca.hired_at IS NULL
  AND ca.deleted_at IS NULL;

-- Down Migration

ALTER TABLE campaign_applied
  DROP COLUMN IF EXISTS start_date;
