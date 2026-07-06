import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchApplicantCountsByJobDescriptionId } from "@/lib/jd/applicant-counts";
import { isJdStatus, type JobDescription } from "@/lib/jd/types";

export type JobDescriptionListRow = JobDescription & {
  applicant_count: number;
  has_jd_source_file: boolean;
};

export type QueryJobDescriptionsWithEnrichmentResult = {
  jobDescriptions: JobDescriptionListRow[];
  error: string | null;
};

/**
 * Loads job_descriptions rows (optionally filtered by status) and enriches
 * each with `applicant_count` and `has_jd_source_file`, derived from linked
 * `job_openings` rows. Mirrors the logic in `GET /api/admin/job-descriptions`
 * so it can be reused for both the client-refetch route and server-side
 * initial data fetching.
 */
export async function queryJobDescriptionsWithEnrichment(
  supabase: SupabaseClient,
  options: { status?: string | null } = {},
): Promise<QueryJobDescriptionsWithEnrichmentResult> {
  const { status } = options;

  let query = supabase
    .from("job_descriptions")
    .select("*")
    .order("created_at", { ascending: false });

  if (status && isJdStatus(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return { jobDescriptions: [], error: error.message };

  const jds = data ?? [];
  if (jds.length === 0) {
    return { jobDescriptions: [], error: null };
  }

  const [openingsResult, countsResult] = await Promise.all([
    supabase
      .from("job_openings")
      .select("id, job_description_id, jd_storage_path, created_at")
      .not("job_description_id", "is", null),
    fetchApplicantCountsByJobDescriptionId(supabase),
  ]);

  const { data: openings, error: openingsError } = openingsResult;
  if (openingsError) {
    return { jobDescriptions: [], error: openingsError.message };
  }
  if (countsResult.error) {
    return { jobDescriptions: [], error: countsResult.error };
  }

  const applicantCountByJd = countsResult.counts;
  const openingsByJd = new Map<
    number,
    { jd_storage_path: string | null; created_at: string }[]
  >();
  for (const o of openings ?? []) {
    const jdId = o.job_description_id as number | null;
    if (jdId == null) continue;
    const list = openingsByJd.get(jdId) ?? [];
    list.push({
      jd_storage_path: (o.jd_storage_path as string | null) ?? null,
      created_at: String(o.created_at),
    });
    openingsByJd.set(jdId, list);
  }

  const enriched = jds.map((row: Record<string, unknown>) => {
    const id = row.id as number;
    const list = openingsByJd.get(id) ?? [];
    const withFile = list
      .filter((x) => x.jd_storage_path)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )[0];
    return {
      ...row,
      applicant_count: applicantCountByJd.get(id) ?? 0,
      has_jd_source_file: Boolean(withFile?.jd_storage_path),
    } as JobDescriptionListRow;
  });

  return { jobDescriptions: enriched, error: null };
}
