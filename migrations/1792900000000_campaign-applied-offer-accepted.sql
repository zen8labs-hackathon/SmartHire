-- Up Migration

-- Offer step: HR records the candidate's acceptance of the offer.
ALTER TABLE campaign_applied
  ADD COLUMN offer_accepted_at timestamptz;

-- Down Migration

ALTER TABLE campaign_applied
  DROP COLUMN IF EXISTS offer_accepted_at;
