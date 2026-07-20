import type { QueryExecutor } from "@/lib/db/config/client";

/**
 * Thin wrapper around the `merge_candidates(p_duplicate_id, p_canonical_id)`
 * Postgres function (`migrations/1783914944486_merge-candidates-fn.sql`).
 * Moves every `campaign_applied` row from the duplicate candidate to the
 * canonical one and soft-deletes the duplicate, atomically, inside the
 * function itself — no transaction wrapping needed on the caller's side for
 * that part. Returns the number of `campaign_applied` rows moved.
 *
 * Known open business rule from the migration's own comment: if both
 * candidates already have an active application for the same job, this
 * leaves both applications under the canonical candidate rather than merging
 * or dropping either — callers should check for that case first if it
 * matters for their flow.
 *
 * Throws (propagating the Postgres `RAISE EXCEPTION`) if either id is
 * missing/already soft-deleted, or if the two ids are equal.
 */
export async function mergeCandidates(
  db: QueryExecutor,
  duplicateId: string,
  canonicalId: string,
): Promise<number> {
  const { rows } = await db.query<{ merge_candidates: number }>(
    `SELECT merge_candidates($1, $2) AS merge_candidates`,
    [duplicateId, canonicalId],
  );
  return rows[0]?.merge_candidates ?? 0;
}
