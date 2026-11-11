-- Up Migration
ALTER TABLE jobs ADD COLUMN recruiter_notes text;
COMMENT ON COLUMN jobs.recruiter_notes IS 'Job information note for internal recruiting team.';
-- Down Migration
ALTER TABLE jobs DROP COLUMN recruiter_notes;
