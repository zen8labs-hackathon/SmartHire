import type { SupabaseClient } from "@supabase/supabase-js";

/** True if this candidate is linked to a job opening on the given JD. */
export async function verifyPipelineCandidateForJd(
  client: SupabaseClient,
  jobDescriptionId: number,
  pipelineCandidateId: string,
): Promise<boolean> {
  const { data: cand, error } = await client
    .from("candidates")
    .select("job_opening_id")
    .eq("id", pipelineCandidateId)
    .maybeSingle();

  if (error || !cand?.job_opening_id) return false;

  const { data: jo } = await client
    .from("job_openings")
    .select("id")
    .eq("id", cand.job_opening_id as string)
    .eq("job_description_id", jobDescriptionId)
    .maybeSingle();

  return !!jo;
}
