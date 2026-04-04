import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Loads all interview notes for a pipeline candidate and formats them for the
 * evaluation AI prompt (newest context preserved in document order).
 */
export async function loadInterviewNotesAggregatedText(
  admin: SupabaseClient,
  jobDescriptionId: number,
  pipelineCandidateId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("candidate_interview_notes")
    .select("body, created_at, author_id")
    .eq("job_description_id", jobDescriptionId)
    .eq("pipeline_candidate_id", pipelineCandidateId)
    .order("created_at", { ascending: true });

  if (error || !data?.length) return "";

  const authorIds = [...new Set(data.map((r) => r.author_id as string))];
  const { data: profs } = await admin
    .from("profiles")
    .select("id, username")
    .in("id", authorIds);

  const uname = new Map(
    (profs ?? []).map((p) => [p.id as string, String(p.username)]),
  );

  return data
    .map((row) => {
      const when = new Date(row.created_at as string)
        .toISOString()
        .slice(0, 16)
        .replace("T", " ");
      const aid = row.author_id as string;
      const who = uname.get(aid) ?? aid.slice(0, 8);
      return `[${when} @${who}]\n${row.body as string}`;
    })
    .join("\n\n---\n\n");
}
