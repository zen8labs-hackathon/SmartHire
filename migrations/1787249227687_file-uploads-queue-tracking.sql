-- Up Migration

-- Per-file tracking row for the Redis/BullMQ-backed upload queue (feat/message-queue-for-upload-cv).
-- One row per uploaded file, independent of `cv_detail_versions` -- this tracks the queue job's
-- lifecycle (validation -> s3_upload -> queue -> s3_download -> parsing -> ai_processing ->
-- database), not the parsed CV content itself.
CREATE TABLE file_uploads (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid REFERENCES jobs (id),
  candidate_id uuid REFERENCES candidates (id),
  batch_id varchar(20) NOT NULL, -- yyyyMMddHHmmss, groups files dropped together in one bulk upload
  file_name text NOT NULL,
  storage_key text NOT NULL,
  file_hash TEXT,
  mime_type text,
  status varchar(20) NOT NULL DEFAULT 'pending',
  error_code varchar(10),
  error_message text,
  error_stage varchar(50),

  -- Additional metadata for tracking the source of the file upload
  file_source varchar(50),
  recruiter varchar(100),
  uploaded_by varchar(100),
  is_existed boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX file_uploads_job_id_idx ON file_uploads (job_id);
CREATE INDEX file_uploads_batch_id_idx ON file_uploads (batch_id);
CREATE INDEX file_uploads_status_idx ON file_uploads (status);
CREATE INDEX file_uploads_file_name_idx ON file_uploads (file_name);

--Trigger to update the updated_at column
CREATE FUNCTION file_uploads_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER file_uploads_set_updated_at_trigger
  BEFORE UPDATE ON file_uploads
  FOR EACH ROW
  EXECUTE FUNCTION file_uploads_set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS file_uploads;
DROP FUNCTION IF EXISTS file_uploads_set_updated_at();
