import { jobAclVisibleSql } from "@/lib/authz/job-access";
import {
  countActiveApplicationsByJobIds,
  countAttentionByJobIds,
  countHiredByJobIds,
  countPoolSummary,
} from "@/lib/db/campaign-applied";
import type { QueryExecutor } from "@/lib/db/config/client";
import {
  listAllowedChaptersForJobs,
  type JobChapterRef,
} from "@/lib/db/job-permissions";
import type { JobRow } from "@/lib/db/jobs";
import { dbDateToIso } from "@/lib/db/query-helpers";
import { getUsersByIds } from "@/lib/db/users";
import { DRAFT_SQL, deriveJdState, isDraft, plainNote } from "@/lib/position/jd-state";

export type PositionStatus = "Open" | "Draft" | "On hold" | "Closed";
export type PositionType = "Full-time" | "Internship";

export const POSITION_STATUSES: PositionStatus[] = [
  "Open",
  "Draft",
  "On hold",
  "Closed",
];

/** UI status -> SQL predicate on `jobs j` (Draft = Pending + marker, see jd-state). */
const UI_STATUS_SQL: Record<PositionStatus, string> = {
  Open: `j.status = 'Hiring'`,
  Draft: DRAFT_SQL,
  "On hold": `(j.status = 'Pending' AND NOT COALESCE(j.update_note LIKE '[Draft]%', false))`,
  Closed: `j.status IN ('Done', 'Closed')`,
};

export function isPositionStatus(v: unknown): v is PositionStatus {
  return typeof v === "string" && (POSITION_STATUSES as string[]).includes(v);
}

export function isPositionType(v: unknown): v is PositionType {
  return v === "Full-time" || v === "Internship";
}

export function jobToPositionStatus(
  job: Pick<JobRow, "status" | "update_note">,
): PositionStatus {
  if (isDraft(job)) return "Draft";
  switch (job.status) {
    case "Hiring":
      return "Open";
    case "Pending":
      return "On hold";
    default:
      return "Closed";
  }
}

/** `employment_status` is free text: anything mentioning "intern" is an internship. */
export function employmentToPositionType(
  employment: string | null,
): PositionType {
  return employment && /intern/i.test(employment) ? "Internship" : "Full-time";
}

/** Whole days from today (UTC) to the deadline (YYYY-MM-DD); negative once overdue. */
export function daysUntil(deadlineIso: string | null, now = new Date()): number | null {
  if (!deadlineIso) return null;
  const target = Date.parse(`${deadlineIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(target)) return null;
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.round((target - today) / 86_400_000);
}

export type PositionOwner = { id: string; username: string; email: string };

export type PositionListRow = {
  id: string;
  /** First 8 chars of the uuid, as shown in the UI (`#id`). */
  shortId: string;
  title: string;
  status: PositionStatus;
  type: PositionType;
  level: string | null;
  chapters: JobChapterRef[];
  headcount: number | null;
  hired: number;
  deadline: string | null;
  daysLeft: number | null;
  candidates: number;
  attention: number;
  owner: PositionOwner | null;
  updated: string;
  draftNote: string | null;
  /** Background JD processing state; `failed` also counts toward `attention`. */
  processing: "processing" | "failed" | null;
  /** JD was processed and the position is still an unreviewed Draft. */
  fresh: boolean;
  processingError: string | null;
  /** `jobs.flow_version = 1`: old pipeline structure, read-only until converted. */
  legacy: boolean;
};

export type PositionListPagination = {
  total: number;
  limit: number;
  offset: number;
};

export type PositionPoolSummary = { candidates: number; attention: number };

export type PositionListResult = {
  positions: PositionListRow[];
  /** Null when `limit` wasn't passed. */
  pagination: PositionListPagination | null;
  /** Scoped by q/type/chapter/ACL but not by `status` or pagination. */
  statusCounts: Record<PositionStatus, number>;
  /** Only when `includePool` was requested (HR). */
  pool?: PositionPoolSummary;
};

export type QueryPositionsOptions = {
  status?: PositionStatus | null;
  /** Case-insensitive substring on title, or prefix of the job id. */
  q?: string | null;
  type?: PositionType | null;
  chapterId?: string | null;
  limit?: number;
  offset?: number;
  /** Set for non-HR to restrict to ACL-visible jobs. */
  visibleToUserId?: string;
  includePool?: boolean;
};

const MAX_LIMIT = 200;

type Scope = { conditions: string[]; values: unknown[] };

function buildScope(o: QueryPositionsOptions): Scope {
  const conditions = ["j.deleted_at IS NULL"];
  const values: unknown[] = [];
  const q = o.q?.trim().replace(/^#/, "");
  if (q) {
    values.push(`%${q}%`);
    const likeIdx = values.length;
    values.push(`${q}%`);
    conditions.push(
      `(j.position ILIKE $${likeIdx} OR j.id::text ILIKE $${values.length})`,
    );
  }
  if (o.type === "Internship") {
    conditions.push(`j.employment_status ILIKE '%intern%'`);
  } else if (o.type === "Full-time") {
    conditions.push(
      `(j.employment_status IS NULL OR j.employment_status NOT ILIKE '%intern%')`,
    );
  }
  if (o.chapterId) {
    values.push(o.chapterId);
    conditions.push(
      `EXISTS (SELECT 1 FROM job_allowed_chapters jc WHERE jc.job_id = j.id AND jc.chapter_id = $${values.length}::uuid)`,
    );
  }
  if (o.visibleToUserId) {
    values.push(o.visibleToUserId);
    conditions.push(jobAclVisibleSql(values.length, "j.id"));
  }
  return { conditions, values };
}

/**
 * Loads `jobs` for the redesigned position list (filtered by status/search/type/chapter and ACL),
 * enriched with chapters, candidate/hired/attention counts and owner via batched queries.
 */
export async function queryPositionsWithEnrichment(
  db: QueryExecutor,
  options: QueryPositionsOptions = {},
): Promise<PositionListResult> {
  const { status, limit, includePool } = options;
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const paginate = limit != null;
  const pageSize = paginate ? Math.min(Math.max(1, Math.trunc(limit)), MAX_LIMIT) : null;

  const scope = buildScope(options);
  const where = scope.conditions.join(" AND ");

  const listValues = [...scope.values];
  const listConds = [where];
  if (status) {
    listConds.push(UI_STATUS_SQL[status]);
  }
  let paging = "";
  if (pageSize != null) {
    listValues.push(pageSize);
    paging = ` LIMIT $${listValues.length}`;
    listValues.push(offset);
    paging += ` OFFSET $${listValues.length}`;
  }

  const [listRes, countRes, pool] = await Promise.all([
    db.query<JobRow & { total_count: string }>(
      `SELECT j.*, count(*) OVER() AS total_count
       FROM jobs j
       WHERE ${listConds.join(" AND ")}
       ORDER BY j.hiring_deadline ASC NULLS LAST, j.id DESC${paging}`,
      listValues,
    ),
    db.query<{ ui: PositionStatus; count: string }>(
      `SELECT CASE WHEN ${DRAFT_SQL} THEN 'Draft'
                   WHEN j.status = 'Hiring' THEN 'Open'
                   WHEN j.status = 'Pending' THEN 'On hold'
                   ELSE 'Closed' END AS ui,
              count(*) AS count
       FROM jobs j WHERE ${where} GROUP BY 1`,
      scope.values,
    ),
    includePool ? countPoolSummary(db) : Promise.resolve(undefined),
  ]);

  const statusCounts: Record<PositionStatus, number> = {
    Open: 0,
    Draft: 0,
    "On hold": 0,
    Closed: 0,
  };
  for (const r of countRes.rows) {
    statusCounts[r.ui] += Number(r.count);
  }

  const jobs = listRes.rows;
  const pagination: PositionListPagination | null =
    pageSize != null
      ? { total: Number(jobs[0]?.total_count ?? 0), limit: pageSize, offset }
      : null;
  const base = { pagination, statusCounts, ...(pool ? { pool } : {}) };

  if (jobs.length === 0) return { positions: [], ...base };

  const jobIds = jobs.map((j) => j.id);
  const ownerIds = [
    ...new Set(jobs.map((j) => j.created_by).filter((v): v is string => !!v)),
  ];
  const [candidates, hired, attention, chapters, owners] = await Promise.all([
    countActiveApplicationsByJobIds(db, jobIds),
    countHiredByJobIds(db, jobIds),
    countAttentionByJobIds(db, jobIds),
    listAllowedChaptersForJobs(db, jobIds),
    getUsersByIds(db, ownerIds),
  ]);
  const ownerById = new Map(owners.map((u) => [u.id, u]));

  const positions = jobs.map((job): PositionListRow => {
    const deadline = dbDateToIso(job.hiring_deadline);
    const owner = job.created_by ? ownerById.get(job.created_by) : undefined;
    const jd = deriveJdState(job);
    return {
      id: job.id,
      shortId: job.id.slice(0, 8),
      title: job.position,
      status: jobToPositionStatus(job),
      type: employmentToPositionType(job.employment_status),
      level: job.level,
      chapters: chapters.get(job.id) ?? [],
      headcount: job.headcount,
      hired: hired.get(job.id) ?? 0,
      deadline,
      daysLeft: daysUntil(deadline),
      candidates: candidates.get(job.id) ?? 0,
      attention:
        (attention.get(job.id) ?? 0) +
        (jd.state === "failed" ? 1 : 0),
      owner: owner
        ? { id: owner.id, username: owner.username, email: owner.email }
        : null,
      updated: job.updated_at.toISOString(),
      draftNote: jd.state === "failed" ? null : plainNote(job.update_note),
      processing:
        jd.state === "processing" || jd.state === "failed" ? jd.state : null,
      fresh: jd.state === "done",
      processingError: jd.error,
      legacy: job.flow_version === 1,
    };
  });

  return { positions, ...base };
}
