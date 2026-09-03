-- Up Migration

-- Marks a `file_uploads.batch_id` as fully settled (all files in the batch
-- reached a terminal status). `id` IS the batch_id -- same shape as
-- `file_uploads.batch_id` (yyyyMMddHHmmss), not a separate generated key.
CREATE TABLE batch_done (
  id         varchar(20) PRIMARY KEY,
  is_done    boolean NOT NULL DEFAULT false,
  done_at    timestamptz NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION batch_done_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER batch_done_set_updated_at_trigger
  BEFORE UPDATE ON batch_done
  FOR EACH ROW
  EXECUTE FUNCTION batch_done_set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS batch_done;
DROP FUNCTION IF EXISTS batch_done_set_updated_at();
