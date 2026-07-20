-- Up Migration

-- FK moves from (job_description_id, pipeline_candidate_id) to campaign_applied_id (DB7X2K item
-- 7/9): 1 real FK instead of 2 unrelated columns that could point at mismatched candidate/job
-- pairs. id switches to bigint -- public access always goes through preview_token, never id.
CREATE TABLE candidate_evaluation_reviews (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_applied_id uuid NOT NULL REFERENCES campaign_applied (id) ON DELETE CASCADE,
  candidate_name text NOT NULL,
  reviewer_notes text NOT NULL,
  filled_pdf_storage_path text NOT NULL,
  preview_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  revoked_at timestamptz,
  ai_field_mapping jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT candidate_evaluation_reviews_preview_token_unique UNIQUE (preview_token)
);

CREATE INDEX candidate_evaluation_reviews_campaign_idx ON candidate_evaluation_reviews (campaign_applied_id);

-- Down Migration

DROP TABLE IF EXISTS candidate_evaluation_reviews;
