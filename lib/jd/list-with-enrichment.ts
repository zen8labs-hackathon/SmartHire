import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchApplicantCountsByJobDescriptionId } from "@/lib/jd/applicant-counts";
import { escapeIlikePattern } from "@/lib/candidates/candidates-list-query";
import { isJdStatus, type JobDescription, type JdStatus } from "@/lib/jd/types";

export const JD_LIST_PAGE_SIZE = 10;

export type JobDescriptionListRow = JobDescription & {
  applicant_count: number;
  has_jd_source_file: boolean;
};

export type JobDescriptionsListPagination = {
  total: number;
  limit: number;
  offset: number;
};

export type QueryJobDescriptionsWithEnrichmentOptions = {
  status?: string | null;
  /** Case-insensitive substring match on `position`. */
  q?: string | null;
  /** Inclusive lower/upper bound (YYYY-MM-DD) on `start_date`. */
  startFrom?: string | null;
  startTo?: string | null;
  /** When set, paginates via `.range()`; omit to return every matching row. */
  limit?: number;
  offset?: number;
};

export type QueryJobDescriptionsWithEnrichmentResult = {
  jobDescriptions: JobDescriptionListRow[];
  /** Null when `limit` wasn't passed (no pagination requested). */
  pagination: JobDescriptionsListPagination | null;
  /** Row count per status, scoped by `q`/`startFrom`/`startTo` but not by `status` or pagination. */
  statusCounts: Record<JdStatus, number>;
  error: string | null;
};

const EMPTY_STATUS_COUNTS: Record<JdStatus, number> = {
  Pending: 0,
  Hiring: 0,
  Done: 0,
  Closed: 0,
};

/** Row counts per status, scoped by the same search/date filters as the list query (ignores `status` itself). */
async function computeJdStatusCounts(
  supabase: SupabaseClient,
  filters: { q?: string | null; startFrom?: string | null; startTo?: string | null },
): Promise<{ counts: Record<JdStatus, number>; error: string | null }> {
  let query = supabase.from("job_descriptions").select("status");

  const q = filters.q?.trim();
  if (q) {
    query = query.ilike("position", `%${escapeIlikePattern(q)}%`);
  }
  if (filters.startFrom) query = query.gte("start_date", filters.startFrom);
  if (filters.startTo) query = query.lte("start_date", filters.startTo);

  const { data, error } = await query;
  if (error) return { counts: EMPTY_STATUS_COUNTS, error: error.message };

  const counts = { ...EMPTY_STATUS_COUNTS };
  for (const row of data ?? []) {
    const status = String((row as { status: unknown }).status ?? "");
    if (isJdStatus(status)) counts[status] += 1;
  }
  return { counts, error: null };
}

/** UTC-based `{ from, to }` (YYYY-MM-DD) for "last 3 months", used as the default `start_date` filter. */
export function defaultJdStartDateRangeIso(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, now.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
  return { from, to };
}

/**
 * Loads job_descriptions rows (optionally filtered by status/search/date-range
 * and paginated) and enriches each with `applicant_count` and
 * `has_jd_source_file`, derived from linked `job_openings` rows. Mirrors the
 * logic in `GET /api/admin/job-descriptions` so it can be reused for both the
 * client-refetch route and server-side initial data fetching.
 */
export async function queryJobDescriptionsWithEnrichment(
  supabase: SupabaseClient,
  options: QueryJobDescriptionsWithEnrichmentOptions = {},
): Promise<QueryJobDescriptionsWithEnrichmentResult> {
  const { status, q, startFrom, startTo, limit, offset = 0 } = options;
  const paginate = limit != null;

  let query = supabase
    .from("job_descriptions")
    .select("*", paginate ? { count: "exact" } : undefined)
    .order("created_at", { ascending: false });

  if (status && isJdStatus(status)) {
    query = query.eq("status", status);
  }
  const trimmedQ = q?.trim();
  if (trimmedQ) {
    query = query.ilike("position", `%${escapeIlikePattern(trimmedQ)}%`);
  }
  if (startFrom) query = query.gte("start_date", startFrom);
  if (startTo) query = query.lte("start_date", startTo);

  if (paginate) {
    query = query.range(offset, offset + limit! - 1);
  }

  const [{ data, error, count }, statusCountsResult] = await Promise.all([
    query,
    computeJdStatusCounts(supabase, { q: trimmedQ, startFrom, startTo }),
  ]);
  if (error) {
    return { jobDescriptions: [], pagination: null, statusCounts: EMPTY_STATUS_COUNTS, error: error.message };
  }
  if (statusCountsResult.error) {
    return { jobDescriptions: [], pagination: null, statusCounts: EMPTY_STATUS_COUNTS, error: statusCountsResult.error };
  }

  const pagination: JobDescriptionsListPagination | null = paginate
    ? { total: count ?? 0, limit: limit!, offset }
    : null;

  const jds = data ?? [];
  if (jds.length === 0) {
    return {
      jobDescriptions: [],
      pagination,
      statusCounts: statusCountsResult.counts,
      error: null,
    };
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
    return { jobDescriptions: [], pagination, statusCounts: statusCountsResult.counts, error: openingsError.message };
  }
  if (countsResult.error) {
    return { jobDescriptions: [], pagination, statusCounts: statusCountsResult.counts, error: countsResult.error };
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

  return {
    jobDescriptions: enriched,
    pagination,
    statusCounts: statusCountsResult.counts,
    error: null,
  };
}
