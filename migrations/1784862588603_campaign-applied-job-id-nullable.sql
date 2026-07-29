-- Up Migration

-- CJ4X9M: lets a recruiter bank a CV/candidate before a requisition exists.
-- job_id NULL means "unassigned / pool" -- not yet attached to any job.
ALTER TABLE campaign_applied ALTER COLUMN job_id DROP NOT NULL;

-- campaign_applied_job_idx (plain btree on job_id) needs no change: NULLs are
-- simply excluded from a btree index, which is the desired behavior here --
-- job-less rows should never surface in a job-scoped index lookup.

-- Down Migration

-- Rolling back would silently corrupt any job-less row into an invalid state
-- (NOT NULL with no value to backfill from), so refuse instead of guessing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM campaign_applied WHERE job_id IS NULL) THEN
    RAISE EXCEPTION
      'Cannot roll back campaign-applied-job-id-nullable: campaign_applied has rows with job_id IS NULL. Assign a job to (or remove) them before rolling back.';
  END IF;
END $$;

ALTER TABLE campaign_applied ALTER COLUMN job_id SET NOT NULL;