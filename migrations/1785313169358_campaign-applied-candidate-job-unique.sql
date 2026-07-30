-- Up Migration

-- Closes a race in POST /api/admin/candidates/[id]/assign-job's "candidate
-- already has a job -> add a second application" path: it was a plain
-- check-then-insert (SELECT for an existing candidate_id+job_id row, then
-- INSERT if none found) with nothing enforcing "1 candidate x 1 job" at the
-- DB level, so two concurrent requests for the same candidate+job could both
-- pass the check and both insert, leaving two live applications for the same
-- job. Partial (excludes soft-deleted + NULL job_id) so:
--   - a soft-deleted application never blocks a fresh one for the same job.
--   - the unassigned/pool bucket (job_id IS NULL, CJ4X9M) stays unconstrained
--     -- a candidate isn't limited to a single pool application.

-- Pre-existing data can already violate the constraint we're about to add
-- (this is exactly the race the index closes). Soft-delete every duplicate
-- but the earliest live application per (candidate_id, job_id) so the index
-- creation below doesn't fail on rows that predate this migration.
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY candidate_id, job_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM campaign_applied
  WHERE deleted_at IS NULL AND job_id IS NOT NULL
)
UPDATE campaign_applied
SET deleted_at = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX campaign_applied_candidate_job_unique_idx
  ON campaign_applied (candidate_id, job_id)
  WHERE deleted_at IS NULL AND job_id IS NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS campaign_applied_candidate_job_unique_idx;
