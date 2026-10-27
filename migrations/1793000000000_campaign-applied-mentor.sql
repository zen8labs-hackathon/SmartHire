-- Up Migration

-- Probation Mentor: the staff member who evaluates the candidate during
-- probation. Chosen in the Hire dialog from people already added to the job;
-- a per-application assignment, not a job role.
ALTER TABLE campaign_applied
  ADD COLUMN mentor_profile_id uuid REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX campaign_applied_mentor_profile_idx
  ON campaign_applied (mentor_profile_id)
  WHERE mentor_profile_id IS NOT NULL AND deleted_at IS NULL;

-- Down Migration

DROP INDEX IF EXISTS campaign_applied_mentor_profile_idx;
ALTER TABLE campaign_applied
  DROP COLUMN IF EXISTS mentor_profile_id;
