-- Up Migration

CREATE TABLE email_templates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  trigger_type text NOT NULL,
  recipient_type text NOT NULL CHECK (recipient_type IN ('candidate', 'internal', 'self')),
  language text NOT NULL DEFAULT 'vi',
  subject_template text NOT NULL,
  body_template text NOT NULL,
  is_auto_send boolean NOT NULL DEFAULT false,
  require_approval boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX email_templates_trigger_recipient_idx
  ON email_templates (trigger_type, recipient_type)
  WHERE deleted_at IS NULL;

CREATE TABLE email_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  campaign_applied_id uuid REFERENCES campaign_applied (id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs (id) ON DELETE CASCADE,
  template_id bigint REFERENCES email_templates (id) ON DELETE SET NULL,
  sender_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('manual', 'auto', 'scheduled')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'sending', 'sent', 'failed', 'cancelled')),
  trigger_type text,
  approved_by uuid REFERENCES users (id) ON DELETE SET NULL,
  approved_at timestamptz,
  conversation_id text,
  from_email text NOT NULL,
  to_email text NOT NULL,
  cc text,
  bcc text,
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text,
  graph_message_id text,
  sent_at timestamptz,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_messages_campaign_applied_idx ON email_messages (campaign_applied_id);
CREATE INDEX email_messages_job_idx ON email_messages (job_id);
-- Drives the send worker's poll query (pending_approval/sending rows to process).
CREATE INDEX email_messages_status_idx ON email_messages (status);

CREATE TABLE email_attachments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  message_id uuid NOT NULL REFERENCES email_messages (id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  storage_path text NOT NULL,
  file_size bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_attachments_message_idx ON email_attachments (message_id);

CREATE TABLE email_schedules (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  email_message_id uuid REFERENCES email_messages (id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs (id) ON DELETE CASCADE,
  campaign_applied_id uuid REFERENCES campaign_applied (id) ON DELETE CASCADE,
  template_id bigint NOT NULL REFERENCES email_templates (id),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  cancel_reason text,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_applied_id, template_id, scheduled_for)
);

-- Drives the scheduler's poll query (due, not-yet-fired schedules).
CREATE INDEX email_schedules_pending_idx ON email_schedules (scheduled_for) WHERE status = 'pending';

CREATE TABLE email_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  default_sender text NOT NULL,
  signature_html text,
  logo_url text,
  timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  allowed_send_start time NOT NULL DEFAULT '08:00',
  allowed_send_end time NOT NULL DEFAULT '18:00',
  default_language text NOT NULL DEFAULT 'vi',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job_email_recipients (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  trigger_type text,
  recipient_source jsonb NOT NULL DEFAULT '[]',
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A plain UNIQUE (job_id, trigger_type) does not work here: Postgres treats every NULL as
-- distinct, so it would silently allow more than one "applies to all triggers" (trigger_type
-- IS NULL) row per job -- the exact case the NULL convention is meant to rule out. Two partial
-- indexes enforce both halves: at most one row per (job, specific trigger_type), and at most
-- one catch-all row per job.
CREATE UNIQUE INDEX job_email_recipients_job_trigger_uq
  ON job_email_recipients (job_id, trigger_type)
  WHERE trigger_type IS NOT NULL;
CREATE UNIQUE INDEX job_email_recipients_job_catchall_uq
  ON job_email_recipients (job_id)
  WHERE trigger_type IS NULL;

-- Down Migration

DROP TABLE IF EXISTS job_email_recipients;
DROP TABLE IF EXISTS email_settings;
DROP TABLE IF EXISTS email_schedules;
DROP TABLE IF EXISTS email_attachments;
DROP TABLE IF EXISTS email_messages;
DROP TABLE IF EXISTS email_templates;
