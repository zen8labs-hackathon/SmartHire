-- Up Migration

-- Adds per-template send configuration needed by the Email Config UI (default
-- CC/BCC and relative send timing) -- neither existed on the original
-- email_templates table (migrations/1785731317733_email-templates-and-messages.sql).
ALTER TABLE email_templates
  ADD COLUMN default_cc text,
  ADD COLUMN default_bcc text,
  ADD COLUMN send_offset_minutes integer NOT NULL DEFAULT 0;

-- send_offset_minutes: negative = before the reference event (e.g. -1440 = 24h
-- before an interview's scheduled_at), positive = after (e.g. 4320 = 3 days
-- after the trigger event), 0 = send immediately when the trigger fires.

-- Down Migration

ALTER TABLE email_templates
  DROP COLUMN default_cc,
  DROP COLUMN default_bcc,
  DROP COLUMN send_offset_minutes;
