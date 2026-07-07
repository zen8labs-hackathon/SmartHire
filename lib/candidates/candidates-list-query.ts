import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ADMIN_CANDIDATES_LIST_SELECT,
  ADMIN_CANDIDATES_LIST_SELECT_WITH_CONTACT,
  ADMIN_CANDIDATES_SELECT,
} from "@/lib/candidates/admin-select";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { enrichCandidatesWithJobOpenings } from "@/lib/candidates/enrich-candidates-job-openings";

export const CANDIDATES_LIST_DEFAULT_LIMIT = 50;
export const CANDIDATES_LIST_MAX_LIMIT = 200;
/** Cap when `all=true` or no limit (job pipeline table / full list). */
export const CANDIDATES_LIST_MAX_ALL = 2000;

export type CandidatesListQuery = {
  jobDescriptionId?: number;
  jobOpeningId?: string;
  status?: string;
  uploadFrom?: string;
  uploadTo?: string;
  q?: string;
  limit?: number;
  offset?: number;
  /** When true, return up to {@link CANDIDATES_LIST_MAX_ALL} rows (no offset). */
  all?: boolean;
  /** When true, include the full parsed_payload object. */
  includeParsedPayload?: boolean;
  /**
   * When true and includeParsedPayload is false, selects lightweight
   * parsed_payload->>email/phone fields instead of omitting contact info
   * entirely.
   */
  contactFieldsOnly?: boolean;
};

export type CandidatesListPagination = {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
};

export type CandidatesListResult = {
  candidates: CandidateDbRow[];
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

function parseJobDescriptionId(raw: string | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

function parseDateParam(raw: string | null): string | undefined {
  if (raw == null || raw === "") return undefined;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return s;
}

function escapeIlikePattern(q: string): string {
  return q.replace(/[%_\\]/g, "\\$&");
}

export function parseCandidatesListQuery(searchParams: URLSearchParams): {
  query: CandidatesListQuery;
  error: string | null;
} {
  const jobDescriptionId = parseJobDescriptionId(
    searchParams.get("jobDescriptionId"),
  );
  const jobOpeningIdRaw = searchParams.get("jobOpeningId")?.trim() ?? "";
  const jobOpeningId =
    jobOpeningIdRaw && UUID_RE.test(jobOpeningIdRaw)
      ? jobOpeningIdRaw
      : undefined;

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

  const statusRaw = searchParams.get("status")?.trim();
  const status = statusRaw && statusRaw !== "all" ? statusRaw : undefined;

  const includeParsedPayload =
    searchParams.get("includeParsedPayload") === "true" ||
    searchParams.get("includeParsedPayload") === "1";

  const contactFieldsOnly =
    searchParams.get("contactFields") === "true" ||
    searchParams.get("contactFields") === "1";

  return {
    query: {
      jobDescriptionId,
      jobOpeningId,
      status,
      uploadFrom: parseDateParam(searchParams.get("uploadFrom")),
      uploadTo: parseDateParam(searchParams.get("uploadTo")),
      q: searchParams.get("q")?.trim() || undefined,
      limit,
      offset,
      all: all || limit == null,
      includeParsedPayload,
      contactFieldsOnly,
    },
    error: null,
  };
}

export function buildCandidatesListSearchParams(
  query: CandidatesListQuery,
): URLSearchParams {
  const params = new URLSearchParams();
  if (query.jobDescriptionId != null) {
    params.set("jobDescriptionId", String(query.jobDescriptionId));
  }
  if (query.jobOpeningId) params.set("jobOpeningId", query.jobOpeningId);
  if (query.status) params.set("status", query.status);
  if (query.uploadFrom) params.set("uploadFrom", query.uploadFrom);
  if (query.uploadTo) params.set("uploadTo", query.uploadTo);
  if (query.q) params.set("q", query.q);
  if (query.includeParsedPayload) {
    params.set("includeParsedPayload", "true");
  }
  if (query.contactFieldsOnly) {
    params.set("contactFields", "true");
  }
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

async function resolveOpeningIds(
  supabase: SupabaseClient,
  jobDescriptionId: number,
): Promise<{ openingIds: string[] | null; error: string | null }> {
  const { data: openings, error } = await supabase
    .from("job_openings")
    .select("id")
    .eq("job_description_id", jobDescriptionId);

  if (error) return { openingIds: null, error: error.message };

  const openingIds = (openings ?? [])
    .map((o) => o.id as string)
    .filter(Boolean);
  return { openingIds, error: null };
}

type UploadDateFilterable = {
  gte(column: string, value: string): UploadDateFilterable;
  lt(column: string, value: string): UploadDateFilterable;
};

function applyUploadDateFilters<Q extends UploadDateFilterable>(
  query: Q,
  uploadFrom?: string,
  uploadTo?: string,
): Q {
  let q = query;
  if (uploadFrom) {
    q = q.gte("cv_uploaded_at", `${uploadFrom}T00:00:00.000Z`) as Q;
  }
  if (uploadTo) {
    const end = new Date(`${uploadTo}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    q = q.lt("cv_uploaded_at", end.toISOString()) as Q;
  }
  return q;
}

/**
 * Loads candidates for admin list / pipeline with optional pagination and filters.
 */
export async function queryCandidatesList(
  supabase: SupabaseClient,
  input: CandidatesListQuery,
): Promise<CandidatesListResult> {
  let openingIds: string[] | null = null;

  if (input.jobOpeningId) {
    openingIds = [input.jobOpeningId];
  } else if (input.jobDescriptionId != null) {
    const resolved = await resolveOpeningIds(supabase, input.jobDescriptionId);
    if (resolved.error) {
      return { candidates: [], pagination: null, error: resolved.error };
    }
    openingIds = resolved.openingIds ?? [];
    if (openingIds.length === 0) {
      const emptyPage = input.all
        ? null
        : {
            limit: input.limit ?? CANDIDATES_LIST_DEFAULT_LIMIT,
            offset: input.offset ?? 0,
            total: 0,
            hasMore: false,
          };
      return { candidates: [], pagination: emptyPage, error: null };
    }
  }

  const paginate = !input.all;
  const limit = paginate
    ? Math.min(
        Math.max(1, input.limit ?? CANDIDATES_LIST_DEFAULT_LIMIT),
        CANDIDATES_LIST_MAX_LIMIT,
      )
    : CANDIDATES_LIST_MAX_ALL;
  const offset = paginate ? (input.offset ?? 0) : 0;

  let query = supabase
    .from("candidates")
    .select(
      input.includeParsedPayload
        ? ADMIN_CANDIDATES_SELECT
        : input.contactFieldsOnly
          ? ADMIN_CANDIDATES_LIST_SELECT_WITH_CONTACT
          : ADMIN_CANDIDATES_LIST_SELECT,
      paginate ? { count: "exact" } : undefined,
    )
    .eq("is_active", true)
    .order("cv_uploaded_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (openingIds) {
    query = query.in("job_opening_id", openingIds);
  }

  if (input.status) {
    query = query.eq("status", input.status);
  }

  query = applyUploadDateFilters(query, input.uploadFrom, input.uploadTo);

  if (input.q) {
    const pattern = `%${escapeIlikePattern(input.q)}%`;
    query = query.or(
      [
        `name.ilike.${pattern}`,
        `role.ilike.${pattern}`,
        `original_filename.ilike.${pattern}`,
        `school.ilike.${pattern}`,
        `degree.ilike.${pattern}`,
      ].join(","),
    );
  }

  if (paginate) {
    query = query.range(offset, offset + limit - 1);
  } else {
    query = query.limit(limit);
  }

  const { data, error, count } = await query;

  if (error) {
    return { candidates: [], pagination: null, error: error.message };
  }

  const raw = (data ?? []) as unknown as CandidateDbRow[];
  const candidates = await enrichCandidatesWithJobOpenings(supabase, raw);

  const total = paginate ? (count ?? candidates.length) : candidates.length;
  const pagination: CandidatesListPagination | null = paginate
    ? {
        limit,
        offset,
        total,
        hasMore: offset + candidates.length < total,
      }
    : null;

  return { candidates, pagination, error: null };
}
