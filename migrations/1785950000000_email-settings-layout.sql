-- Up Migration

-- Replaces the "signature appended to every email" concept with a
-- configurable email layout: `layout_type` picks between the existing
-- default card wrapper (lib/email/email-layout.ts::wrapEmailBodyInCard) and
-- an admin-authored `custom_layout_html` (raw HTML with `{{email_content}}`/
-- `{{company_name}}`/`{{logo_url}}` placeholders, rendered via the same
-- `{{key}}` substitution as email templates). Unlike the signature, the
-- layout is never embedded into the editable compose body -- it's applied
-- once, server-side, at compose time.
ALTER TABLE email_settings
  DROP COLUMN signature_html,
  ADD COLUMN layout_type text NOT NULL DEFAULT 'default' CHECK (layout_type IN ('default', 'custom')),
  ADD COLUMN custom_layout_html text;

-- Down Migration

ALTER TABLE email_settings
  DROP COLUMN layout_type,
  DROP COLUMN custom_layout_html,
  ADD COLUMN signature_html text;
