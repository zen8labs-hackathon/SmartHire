import type { SupabaseClient } from "@supabase/supabase-js";

import { ADMIN_CANDIDATES_SELECT } from "@/lib/candidates/admin-select";
import type { CandidateDbRow } from "@/lib/candidates/db-row";

export type FetchCandidatesForJdResult = {
  rows: CandidateDbRow[];
  error: string | null;
};

/**
 * Loads candidates tied to this job description via job_openings.job_description_id.
 * Mirrors GET /api/admin/candidates?jobDescriptionId=… ordering.
 */
export async function fetchCandidatesForJobDescription(
  supabase: SupabaseClient,
  jobDescriptionId: number,
): Promise<FetchCandidatesForJdResult> {
  const { data: openings, error: openingsError } = await supabase
    .from("job_openings")
    .select("id")
    .eq("job_description_id", jobDescriptionId);

  if (openingsError) {
    return { rows: [], error: openingsError.message };
  }

  const openingIds = (openings ?? [])
    .map((o) => o.id as string)
    .filter(Boolean);
  if (openingIds.length === 0) {
    return { rows: [], error: null };
  }

  const { data, error } = await supabase
    .from("candidates")
    .select(ADMIN_CANDIDATES_SELECT)
    .in("job_opening_id", openingIds)
    .order("jd_match_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return { rows: [], error: error.message };
  }

  return { rows: (data ?? []) as CandidateDbRow[], error: null };
}
