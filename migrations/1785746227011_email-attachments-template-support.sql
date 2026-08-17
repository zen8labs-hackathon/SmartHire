-- Up Migration

-- Reuse email_attachments for template-level default attachments too, instead
-- of a separate table: message_id becomes optional and a new template_id FK
-- is added, with a CHECK enforcing each row belongs to exactly one owner.
ALTER TABLE email_attachments
  ALTER COLUMN message_id DROP NOT NULL,
  ADD COLUMN template_id bigint REFERENCES email_templates (id) ON DELETE CASCADE;

ALTER TABLE email_attachments
  ADD CONSTRAINT email_attachments_owner_check CHECK (
    (message_id IS NOT NULL AND template_id IS NULL) OR
    (message_id IS NULL AND template_id IS NOT NULL)
  );

CREATE INDEX email_attachments_template_idx ON email_attachments (template_id);

-- Down Migration

DROP INDEX IF EXISTS email_attachments_template_idx;
ALTER TABLE email_attachments DROP CONSTRAINT IF EXISTS email_attachments_owner_check;
ALTER TABLE email_attachments DROP COLUMN IF EXISTS template_id;
ALTER TABLE email_attachments ALTER COLUMN message_id SET NOT NULL;
