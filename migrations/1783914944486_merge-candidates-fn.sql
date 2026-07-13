-- Up Migration

-- Atomic merge for duplicate-candidate resolution (DB7X2K item 2, "luồng merge thủ công"):
-- HR confirms 2 `candidates` rows are the same person; this moves every campaign_applied from
-- the duplicate to the canonical candidate and soft-deletes the duplicate, as a single
-- transaction (same rationale as upsert_job_stage_mappings in the old Supabase migrations --
-- app-side multi-query merge can fail partway through and orphan campaign_applied rows).
--
-- Not handled here, because the design doc leaves it as an open business rule (DB7X2K "cái khó
-- không biến mất, chỉ chuyển chỗ"): if both the duplicate and the canonical candidate already
-- have an active campaign_applied for the *same* job, this will leave 2 applications for that
-- job under the canonical candidate rather than silently merging or dropping either one.
-- Runs with no Supabase/PostgREST role grants -- RDS authorization is app-layer only
-- (IN9X4Q decision 4), so there is no `authenticated` role to grant execute to.
CREATE OR REPLACE FUNCTION merge_candidates(p_duplicate_id uuid, p_canonical_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_moved_count integer;
BEGIN
  IF p_duplicate_id = p_canonical_id THEN
    RAISE EXCEPTION 'merge_candidates: duplicate_id and canonical_id must differ (got %)', p_duplicate_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM candidates WHERE id = p_duplicate_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'merge_candidates: duplicate candidate % not found or already deleted', p_duplicate_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM candidates WHERE id = p_canonical_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'merge_candidates: canonical candidate % not found or already deleted', p_canonical_id;
  END IF;

  UPDATE campaign_applied
  SET candidate_id = p_canonical_id,
      updated_at = now()
  WHERE candidate_id = p_duplicate_id
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_moved_count = ROW_COUNT;

  UPDATE candidates
  SET deleted_at = now(),
      updated_at = now()
  WHERE id = p_duplicate_id;

  RETURN v_moved_count;
END;
$$;

-- Down Migration

DROP FUNCTION IF EXISTS merge_candidates(uuid, uuid);
