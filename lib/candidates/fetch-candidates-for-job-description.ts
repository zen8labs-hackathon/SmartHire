import type { SupabaseClient } from "@supabase/supabase-js";

import { queryCandidatesList } from "@/lib/candidates/candidates-list-query";
import type { CandidateDbRow } from "@/lib/candidates/db-row";

export type FetchCandidatesForJdResult = {
  rows: CandidateDbRow[];
  error: string | null;
};

/**
 * Loads all active candidates tied to this job description via job_openings.
 * Mirrors `GET /api/admin/candidates?jobDescriptionId=…&all=true`.
 */
export async function fetchCandidatesForJobDescription(
  supabase: SupabaseClient,
  jobDescriptionId: number,
  options?: { includeParsedPayload?: boolean },
): Promise<FetchCandidatesForJdResult> {
  const { candidates, error } = await queryCandidatesList(supabase, {
    jobDescriptionId,
    all: true,
    includeParsedPayload: options?.includeParsedPayload,
  });

  return { rows: candidates, error };
}
