-- Up Migration

-- The candidate-detail applications list looks up the recruiter of the
-- upload that produced each application's active CV by
-- `file_uploads.storage_key = cv_detail_versions.cv_storage_path`
-- (lib/db/campaign-applied.ts::listCampaignAppliedByCandidate).
CREATE INDEX file_uploads_storage_key_idx ON file_uploads (storage_key);

-- Down Migration

DROP INDEX IF EXISTS file_uploads_storage_key_idx;
