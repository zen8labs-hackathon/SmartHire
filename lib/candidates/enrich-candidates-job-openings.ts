import type { SupabaseClient } from "@supabase/supabase-js";

import type { CandidateDbRow, JobOpeningEmbed } from "@/lib/candidates/db-row";

/**
 * Fills `job_openings` on each row when the nested PostgREST embed is null (e.g. RLS) or incomplete.
 * Uses one batch query on `job_openings` and overwrites embed when a match exists.
 */
export async function enrichCandidatesWithJobOpenings(
  supabase: SupabaseClient,
  rows: CandidateDbRow[],
): Promise<CandidateDbRow[]> {
  const ids = [
    ...new Set(
      rows
        .map((r) => r.job_opening_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (ids.length === 0) return rows;

  const { data, error } = await supabase
    .from("job_openings")
    .select("id, title, job_descriptions ( position )")
    .in("id", ids);

  if (error || !data?.length) return rows;

  const map = new Map<string, JobOpeningEmbed>();
  for (const o of data) {
    const id = o.id as string;
    map.set(id, {
      id,
      title: o.title as string,
      job_descriptions: o.job_descriptions as JobOpeningEmbed["job_descriptions"],
    });
  }

  return rows.map((r) => {
    if (!r.job_opening_id) return r;
    const jo = map.get(r.job_opening_id);
    if (!jo) return r;
    return { ...r, job_openings: jo };
  });
}
