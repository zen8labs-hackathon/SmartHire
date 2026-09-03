import {
  listCampaignAppliedForAdmin,
  type CampaignAppliedAdminRow,
} from "@/lib/db/campaign-applied-list";
import type { QueryExecutor } from "@/lib/db/config/client";

export const CANDIDATES_LIST_DEFAULT_LIMIT = 10;
export const CANDIDATES_LIST_MAX_LIMIT = 200;
export const CANDIDATES_LIST_MAX_ALL = 2000;

/** Whitelisted sortable columns for the admin candidates list. */
export const CANDIDATES_LIST_SORT_COLUMNS = [
  "experience",
  "jdMatchScore",
  "uploadDate",
] as const;
export type CandidatesListSortColumn =
  (typeof CANDIDATES_LIST_SORT_COLUMNS)[number];
export type CandidatesListSortDir = "asc" | "desc";

/** Whitelisted `cv_detail_versions.parsing_status` values for list filters. */
export const CANDIDATES_LIST_PARSING_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
] as const;
export type CandidatesListParsingStatus =
  (typeof CANDIDATES_LIST_PARSING_STATUSES)[number];

export type CandidatesListQuery = {
  /** `jobs.id` -- DB7X2K merged job_openings + job_descriptions, so there's a single id now. */
  jobId?: string;
  /** `job_stage_mappings.id` — filters on the application's current custom pipeline stage. */
  stageMappingId?: string;
  /** `pipeline_sub_stages.id`, paired with {@link stageMappingId}. */
  subStateId?: string;
  uploadFrom?: string;
  uploadTo?: string;
  q?: string;
  /** Exact match on the active CV version's `parsing_status`. */
  parsingStatus?: CandidatesListParsingStatus;
  limit?: number;
  offset?: number;
  /** When true, return up to {@link CANDIDATES_LIST_MAX_ALL} rows (no offset). */
  all?: boolean;
  /** Defaults to `uploadDate` (the pre-sorting behavior) when omitted. */
  sortBy?: CandidatesListSortColumn;
  /** Defaults to `desc` when omitted. */
  sortDir?: CandidatesListSortDir;
};

export type CandidatesListPagination = {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
  /** Present on the deduped Active Candidates list: people with 5+ years. */
  experiencedTotal?: number;
};

export type CandidatesListResult = {
  candidates: CampaignAppliedAdminRow[];
  pagination: CandidatesListPagination | null;
  error: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePositiveInt(raw: string | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

function parseDateParam(raw: string | null): string | undefined {
  if (raw == null || raw === "") return undefined;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return s;
}

export function parseCandidatesListQuery(searchParams: URLSearchParams): {
  query: CandidatesListQuery;
  error: string | null;
} {
  const jobIdRaw = searchParams.get("jobId")?.trim() ?? "";
  const jobId = jobIdRaw && UUID_RE.test(jobIdRaw) ? jobIdRaw : undefined;

  const all =
    searchParams.get("all") === "true" || searchParams.get("all") === "1";

  let limit = parsePositiveInt(searchParams.get("limit"));
  let offset = parsePositiveInt(searchParams.get("offset")) ?? 0;

  if (all) {
    limit = CANDIDATES_LIST_MAX_ALL;
    offset = 0;
  } else if (limit != null) {
    limit = Math.min(Math.max(1, limit), CANDIDATES_LIST_MAX_LIMIT);
  }

  const stageMappingIdRaw = searchParams.get("stageMappingId")?.trim() ?? "";
  const stageMappingId =
    stageMappingIdRaw && UUID_RE.test(stageMappingIdRaw)
      ? stageMappingIdRaw
      : undefined;
  const subStateIdRaw = searchParams.get("subStateId")?.trim() ?? "";
  const subStateId =
    subStateIdRaw && UUID_RE.test(subStateIdRaw) ? subStateIdRaw : undefined;

  const sortByRaw = searchParams.get("sortBy");
  const sortBy = (CANDIDATES_LIST_SORT_COLUMNS as readonly string[]).includes(
    sortByRaw ?? "",
  )
    ? (sortByRaw as CandidatesListSortColumn)
    : undefined;
  const sortDirRaw = searchParams.get("sortDir");
  const sortDir: CandidatesListSortDir | undefined =
    sortDirRaw === "asc" || sortDirRaw === "desc" ? sortDirRaw : undefined;

  const parsingStatusRaw = searchParams.get("parsingStatus")?.trim() ?? "";
  const parsingStatus = (
    CANDIDATES_LIST_PARSING_STATUSES as readonly string[]
  ).includes(parsingStatusRaw)
    ? (parsingStatusRaw as CandidatesListParsingStatus)
    : undefined;

  return {
    query: {
      jobId,
      stageMappingId,
      subStateId: stageMappingId ? subStateId : undefined,
      uploadFrom: parseDateParam(searchParams.get("uploadFrom")),
      uploadTo: parseDateParam(searchParams.get("uploadTo")),
      q: searchParams.get("q")?.trim() || undefined,
      parsingStatus,
      limit,
      offset,
      all: all || limit == null,
      sortBy,
      sortDir,
    },
    error: null,
  };
}

export function buildCandidatesListSearchParams(
  query: CandidatesListQuery,
): URLSearchParams {
  const params = new URLSearchParams();
  if (query.jobId) params.set("jobId", query.jobId);
  if (query.stageMappingId) params.set("stageMappingId", query.stageMappingId);
  if (query.subStateId) params.set("subStateId", query.subStateId);
  if (query.uploadFrom) params.set("uploadFrom", query.uploadFrom);
  if (query.uploadTo) params.set("uploadTo", query.uploadTo);
  if (query.q) params.set("q", query.q);
  if (query.parsingStatus) params.set("parsingStatus", query.parsingStatus);
  if (query.sortBy) params.set("sortBy", query.sortBy);
  if (query.sortDir) params.set("sortDir", query.sortDir);
  if (query.all) {
    params.set("all", "true");
  } else {
    if (query.limit != null) params.set("limit", String(query.limit));
    if (query.offset != null && query.offset > 0) {
      params.set("offset", String(query.offset));
    }
  }
  return params;
}

export async function queryCandidatesList(
  db: QueryExecutor,
  input: CandidatesListQuery,
): Promise<CandidatesListResult> {
  const limit = Math.min(
    Math.max(1, input.limit ?? CANDIDATES_LIST_DEFAULT_LIMIT),
    CANDIDATES_LIST_MAX_LIMIT,
  );
  const offset = input.offset ?? 0;

  try {
    // `listCampaignAppliedForAdmin` itself picks the lean, single-job query
    // shape whenever `jobId` is set (the JD pipeline table's only shape) --
    // see its docstring for why that's safe.
    const { rows, total } = await listCampaignAppliedForAdmin(db, {
      jobId: input.jobId,
      stageMappingId: input.stageMappingId,
      subStateId: input.subStateId,
      q: input.q,
      uploadFrom: input.uploadFrom,
      uploadTo: input.uploadTo,
      sortBy: input.sortBy,
      sortDir: input.sortDir,
      limit,
      offset,
    });

    const pagination: CandidatesListPagination = {
      limit,
      offset,
      total,
      hasMore: offset + rows.length < total,
    };

    return { candidates: rows, pagination, error: null };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load candidates.";
    return { candidates: [], pagination: null, error: message };
  }
}
