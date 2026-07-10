import type { SupabaseClient } from "@supabase/supabase-js";

/** PostgREST aggregate: `candidates(count)` on a job_openings row. */
export type JobOpeningWithCandidateCount = {
  job_description_id: number | null;
  candidates?: { count: number }[] | null;
};

/** Parses `candidates(count)` embed from Supabase (array or single object). */
export function candidateCountFromOpeningEmbed(
  embed: JobOpeningWithCandidateCount["candidates"],
): number {
  if (embed == null) return 0;
  const row = Array.isArray(embed) ? embed[0] : embed;
  const n = row?.count;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/**
 * Sums applicant counts per job description across all linked job openings.
 * Uses DB-side `count` aggregates (no full-table scan of `candidates`).
 */
export function sumApplicantCountsByJobDescriptionId(
  openings: readonly JobOpeningWithCandidateCount[],
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const o of openings) {
    const jdId = o.job_description_id;
    if (jdId == null || !Number.isFinite(jdId)) continue;
    const n = candidateCountFromOpeningEmbed(o.candidates);
    counts.set(jdId, (counts.get(jdId) ?? 0) + n);
  }
  return counts;
}

/**
 * Loads per-opening candidate counts and returns totals grouped by `job_description_id`.
 * When `jdIds` is provided the query is scoped to only those IDs (avoids a
 * full `job_openings` scan when enriching a paginated page of JDs).
 */
export async function fetchApplicantCountsByJobDescriptionId(
  supabase: SupabaseClient,
  jdIds?: number[],
): Promise<{ counts: Map<number, number>; error: string | null }> {
  let query = supabase
    .from("job_openings")
    .select("job_description_id, candidates(count)")
    .eq("candidates.is_active", true)
    .not("job_description_id", "is", null);

  if (jdIds && jdIds.length > 0) {
    query = query.in("job_description_id", jdIds);
  }

  const { data, error } = await query;

  if (error) {
    return { counts: new Map(), error: error.message };
  }

  return {
    counts: sumApplicantCountsByJobDescriptionId(
      (data ?? []) as JobOpeningWithCandidateCount[],
    ),
    error: null,
  };
}
