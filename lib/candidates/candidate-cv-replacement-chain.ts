import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CandidateCvReplacementStep = {
  id: number | string;
  previous_candidate_id: string;
  replacement_candidate_id: string;
  previous_status: string | null;
  new_status: string | null;
  matched_on: string | null;
  previous_filename: string | null;
  previous_cv_uploaded_at: string | null;
  replaced_by_email: string | null;
  replaced_at: string | null;
};

/**
 * Walks the CV replacement chain from the active candidate backward (newest
 * bridge step first).
 */
export async function fetchCvReplacementChainNewestFirst(
  supabase: SupabaseClient,
  activeCandidateId: string,
): Promise<{ chain: CandidateCvReplacementStep[]; error: Error | null }> {
  const chain: CandidateCvReplacementStep[] = [];
  let cursor = activeCandidateId;
  for (;;) {
    const { data: step, error: stepErr } = await supabase
      .from("candidate_cv_replacements")
      .select(
        "id, previous_candidate_id, replacement_candidate_id, previous_status, new_status, matched_on, previous_filename, previous_cv_uploaded_at, replaced_by_email, replaced_at",
      )
      .eq("replacement_candidate_id", cursor)
      .order("replaced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (stepErr) {
      return { chain, error: new Error(stepErr.message) };
    }
    if (!step) break;
    const row = step as unknown as CandidateCvReplacementStep;
    chain.push(row);
    cursor = String(row.previous_candidate_id);
    if (!UUID_RE.test(cursor)) break;
  }
  return { chain, error: null };
}

export function chainPreviousCandidateIds(
  chain: CandidateCvReplacementStep[],
): Set<string> {
  return new Set(chain.map((c) => String(c.previous_candidate_id)));
}
