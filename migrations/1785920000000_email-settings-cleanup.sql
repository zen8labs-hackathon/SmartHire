-- Up Migration

-- Drops three email_settings fields that were editable in the General
-- Settings UI but never actually read by any send path: `timezone` (the
-- placeholder renderer hardcodes 'Asia/Ho_Chi_Minh' and never consulted this
-- column), `allowed_send_start`/`allowed_send_end` (no send path -- manual,
-- bulk, auto, or the schedules poller -- ever checked this window despite
-- the UI copy claiming otherwise), and `default_language` (per-template
-- `language` already covers this; nothing read the settings-level default).
-- Adds `company_name`, which *is* consumed (the `{{company_name}}`
-- placeholder), replacing a hardcoded "Zen8Labs" constant in
-- lib/email/template-variables.ts that didn't match the app's own branding.
ALTER TABLE email_settings
  DROP COLUMN timezone,
  DROP COLUMN allowed_send_start,
  DROP COLUMN allowed_send_end,
  DROP COLUMN default_language,
  ADD COLUMN company_name text NOT NULL DEFAULT 'SmartHire';

-- Down Migration

ALTER TABLE email_settings
  DROP COLUMN company_name,
  ADD COLUMN timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  ADD COLUMN allowed_send_start time NOT NULL DEFAULT '08:00',
  ADD COLUMN allowed_send_end time NOT NULL DEFAULT '18:00',
  ADD COLUMN default_language text NOT NULL DEFAULT 'vi';
