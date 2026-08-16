-- Up Migration

-- `recipient_type` was a per-template denormalized copy of what
-- `trigger_type` already determines statically (see the `recipientType`
-- field on each entry in lib/email/trigger-types.ts's EMAIL_TRIGGER_TYPES,
-- now surfaced via getRecipientTypeForTrigger()). Auto-send routing
-- (candidate-facing vs self-notification) is being reworked into explicit
-- per-trigger-type functions instead of a generic recipient_type-driven
-- filter, so this column -- and the composite index that included it -- is
-- no longer read anywhere.
ALTER TABLE email_templates
  DROP COLUMN recipient_type;

CREATE INDEX email_templates_trigger_idx
  ON email_templates (trigger_type)
  WHERE deleted_at IS NULL;

-- Down Migration

DROP INDEX IF EXISTS email_templates_trigger_idx;

ALTER TABLE email_templates
  ADD COLUMN recipient_type text NOT NULL DEFAULT 'candidate'
    CHECK (recipient_type IN ('candidate', 'internal', 'self'));

CREATE INDEX email_templates_trigger_recipient_idx
  ON email_templates (trigger_type, recipient_type)
  WHERE deleted_at IS NULL;
