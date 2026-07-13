import { countActiveApplicationsByJobIds } from "@/lib/db/campaign-applied";
import type { QueryExecutor } from "@/lib/db/config/client";
import { countJobsByStatus, listJobs, type JobRow } from "@/lib/db/jobs";
import type { JdStatus } from "@/lib/jd/types";

export const JD_LIST_PAGE_SIZE = 10;

/**
 * `has_jd_source_file` is now just `jd_storage_path != null` -- DB7X2K's merged `jobs` table
 * carries the JD file columns directly, so there's no more `job_openings` join to enrich with.
 *
 * Date columns are re-typed to `string` and actually converted below (see
 * `queryJobDescriptionsWithEnrichment`) rather than left as `pg`'s native `Date` objects. This
 * value is handed to the client both via a plain HTTP JSON response (where `Date` would auto-serialize
 * to a string anyway) *and* passed directly as a promise from a Server Component into `use()` -- that
 * second path never goes through `JSON.stringify`, so an unconverted `Date` would reach
 * `components/admin/jd/dashboard/helpers.ts`'s `jdRowDate()` and silently fail its `String(value)` /
 * YYYY-MM-DD regex check (a `Date`'s default `toString()` isn't ISO-shaped).
 */
export type JobDescriptionListRow = Omit<
  JobRow,
  "start_date" | "end_date" | "hiring_deadline" | "created_at" | "updated_at"
> & {
  start_date: string | null;
  end_date: string | null;
  hiring_deadline: string | null;
  created_at: string;
  updated_at: string;
  applicant_count: number;
  has_jd_source_file: boolean;
};

function dateOnlyToIso(d: Date | null): string | null {
  return d == null ? null : d.toISOString().slice(0, 10);
}

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
  /** When set, paginates; omit to return every matching row up to the default limit. */
  limit?: number;
  offset?: number;
};

export type QueryJobDescriptionsWithEnrichmentResult = {
  jobDescriptions: JobDescriptionListRow[];
  /** Null when `limit` wasn't passed (no pagination requested). */
  pagination: JobDescriptionsListPagination | null;
  /** Row count per status, scoped by `q`/`startFrom`/`startTo` but not by `status` or pagination. */
  statusCounts: Record<JdStatus, number>;
};

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
 * Loads `jobs` rows (optionally filtered by status/search/date-range and
 * paginated) and enriches each with `applicant_count`. Mirrors the logic in
 * `GET /api/admin/job-descriptions` so it can be reused for both the
 * client-refetch route and server-side initial data fetching.
 */
export async function queryJobDescriptionsWithEnrichment(
  db: QueryExecutor,
  options: QueryJobDescriptionsWithEnrichmentOptions = {},
): Promise<QueryJobDescriptionsWithEnrichmentResult> {
  const { status, q, startFrom, startTo, limit, offset = 0 } = options;
  const paginate = limit != null;

  const countFilters = {
    q: q?.trim() || undefined,
    startFrom: startFrom ?? undefined,
    startTo: startTo ?? undefined,
  };

  const [{ rows: jobs, total }, statusCounts] = await Promise.all([
    listJobs(db, {
      status: (status as JobDescriptionListRow["status"]) || undefined,
      ...countFilters,
      limit: paginate ? limit : undefined,
      offset,
    }),
    countJobsByStatus(db, countFilters),
  ]);

  const pagination: JobDescriptionsListPagination | null = paginate
    ? { total, limit: limit!, offset }
    : null;

  if (jobs.length === 0) {
    return { jobDescriptions: [], pagination, statusCounts };
  }

  const applicantCountByJob = await countActiveApplicationsByJobIds(
    db,
    jobs.map((j) => j.id),
  );

  const jobDescriptions = jobs.map(
    (job): JobDescriptionListRow => ({
      ...job,
      start_date: dateOnlyToIso(job.start_date),
      end_date: dateOnlyToIso(job.end_date),
      hiring_deadline: dateOnlyToIso(job.hiring_deadline),
      created_at: job.created_at.toISOString(),
      updated_at: job.updated_at.toISOString(),
      applicant_count: applicantCountByJob.get(job.id) ?? 0,
      has_jd_source_file: job.jd_storage_path != null,
    }),
  );

  return { jobDescriptions, pagination, statusCounts };
}
