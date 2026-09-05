import type { QueryExecutor } from "@/lib/db/config/client";
import type { PaginatedResult, PaginationParams } from "@/lib/db/query-helpers";
import {
  buildSetClause,
  clampLimit,
  clampOffset,
  extractWindowCount,
  extractWindowTotal,
} from "@/lib/db/query-helpers";
import { normalizeParsedResume } from "@/lib/candidates/normalize-parsed-resume";

/** Person-level record. Aggregate skills/role/etc. are a pool-search snapshot only — AI matching always reads `cv_detail_versions` instead. */
export type CandidateRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  degree: string | null;
  education: string | null;
  role: string | null;
  experience_years: string | null;
  skills: string[];
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

/**
 * A candidate row plus a few fields that only live on `cv_detail_versions`,
 * pulled from that candidate's most recent CV version (across all their
 * applications). Each extra field is null when the candidate has no CV
 * version yet, or that version left the field unset.
 */
export type CandidateWithExtraInfoRow = CandidateRow & {
  gpa: string | null;
  english_level: string | null;
  date_of_birth: string | null;
  student_years: string | null;
};

export type CreateCandidateInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  degree?: string | null;
  education?: string | null;
  role?: string | null;
  experienceYears?: number | null;
  skills?: string[];
};

export type UpdateCandidateInput = Partial<CreateCandidateInput>;

export type ListCandidatesFilters = PaginationParams & {
  email?: string;
  phone?: string;
  /** Matches against name/email/role via `ILIKE %q%`. */
  q?: string;
  /** Candidates whose `skills` array contains every listed skill. */
  skills?: string[];
};

export async function getCandidateById(
  db: QueryExecutor,
  id: string,
): Promise<CandidateWithExtraInfoRow | null> {
  const { rows } = await db.query<CandidateWithExtraInfoRow>(
    `SELECT c.*, cv.gpa, cv.english_level, cv.date_of_birth, cv.student_years
       FROM candidates c
       LEFT JOIN LATERAL (
         SELECT v.gpa, v.english_level, v.date_of_birth, v.student_years
           FROM cv_detail_versions v
           JOIN campaign_applied ca ON ca.id = v.campaign_applied_id
          WHERE ca.candidate_id = c.id
            AND ca.deleted_at IS NULL
          ORDER BY v.created_at DESC, v.version_number DESC, v.id DESC
          LIMIT 1
       ) cv ON true
      WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

/** Batched existence check -- one query for a set of ids instead of N. */
export async function listCandidatesByIds(
  db: QueryExecutor,
  ids: string[],
): Promise<CandidateRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.query<CandidateRow>(
    `SELECT * FROM candidates WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
    [ids],
  );
  return rows;
}

export async function listCandidates(
  db: QueryExecutor,
  filters: ListCandidatesFilters = {},
): Promise<PaginatedResult<CandidateRow>> {
  const limit = clampLimit(filters.limit);
  const offset = clampOffset(filters.offset);

  const conditions: string[] = ["deleted_at IS NULL"];
  const values: unknown[] = [];

  if (filters.email) {
    values.push(filters.email.toLowerCase());
    conditions.push(`lower(email) = $${values.length}`);
  }
  if (filters.phone) {
    values.push(filters.phone);
    conditions.push(`phone = $${values.length}`);
  }
  if (filters.q) {
    values.push(`%${filters.q}%`);
    const i = values.length;
    conditions.push(
      `(name ILIKE $${i} OR email ILIKE $${i} OR role ILIKE $${i})`,
    );
  }
  if (filters.skills && filters.skills.length > 0) {
    values.push(filters.skills);
    conditions.push(`skills @> $${values.length}::text[]`);
  }

  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const { rows } = await db.query<CandidateRow & { total_count: string }>(
    `SELECT *, count(*) OVER() AS total_count
     FROM candidates
     WHERE ${conditions.join(" AND ")}
     ORDER BY id DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values,
  );

  return {
    rows: rows.map(({ total_count: _total_count, ...row }) => row),
    total: extractWindowTotal(rows),
    limit,
    offset,
  };
}

export type ListCandidatePoolFilters = PaginationParams & {
  /** Case-insensitive substring match against name / email / phone / role / degree / skills. */
  q?: string;
  /** Inclusive `YYYY-MM-DD` range, filtered against `candidates.created_at` (this pool has no separate "upload" event). */
  uploadFrom?: string;
  uploadTo?: string;
};

/** "Experienced staff" stat threshold on the Active Candidates page: `experience_years >= 5`. */
export const EXPERIENCED_YEARS_THRESHOLD = 5;

export type CandidatePoolResult = PaginatedResult<CandidateRow> & {
  /** Candidates in the (filtered) pool with `experience_years >= EXPERIENCED_YEARS_THRESHOLD`. */
  experiencedTotal: number;
};

export async function listCandidatePool(
  db: QueryExecutor,
  filters: ListCandidatePoolFilters = {},
): Promise<CandidatePoolResult> {
  const limit = clampLimit(filters.limit);
  const offset = clampOffset(filters.offset);

  const conditions: string[] = ["deleted_at IS NULL"];
  const values: unknown[] = [];

  if (filters.q) {
    values.push(`%${filters.q}%`);
    const i = values.length;
    conditions.push(
      `(name ILIKE $${i} OR email ILIKE $${i} OR phone ILIKE $${i} OR role ILIKE $${i} OR degree ILIKE $${i} OR array_to_string(skills, ' ') ILIKE $${i})`,
    );
  }
  if (filters.uploadFrom) {
    values.push(filters.uploadFrom);
    conditions.push(`created_at >= $${values.length}`);
  }
  if (filters.uploadTo) {
    values.push(filters.uploadTo);
    conditions.push(`created_at < ($${values.length}::date + 1)`);
  }

  values.push(EXPERIENCED_YEARS_THRESHOLD);
  const expIdx = values.length;
  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const { rows } = await db.query<
    CandidateRow & { total_count: string; experienced_count: string }
  >(
    `SELECT *,
       count(*) OVER() AS total_count,
       count(*) FILTER (WHERE experience_years >= $${expIdx}) OVER() AS experienced_count
     FROM candidates
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values,
  );

  return {
    rows: rows.map(
      ({ total_count: _t, experienced_count: _e, ...row }) => row,
    ),
    total: extractWindowTotal(rows),
    experiencedTotal: extractWindowCount(rows, "experienced_count"),
    limit,
    offset,
  };
}

export type FindCandidatesByContactFilters = {
  /** Exact match, case-insensitive -- `name` is canonicalized before storage (`canonicalizeCandidateName`), so no ILIKE wildcard needed. */
  name?: string | null;
  /** Exact match, case-insensitive. */
  email?: string | null;
  /** Exact match against any of the caller's normalized phone variants (see `normalizePhoneFromPayload`). */
  phoneVariants?: string[];
};

/**
 * Candidates matching ANY of the given name/email/phone filters (OR, not
 * AND) -- each filter is optional, so callers can pass just the signals they
 * have. Returns `[]` without querying when none are given.
 */
export async function findCandidatesByContact(
  db: QueryExecutor,
  filters: FindCandidatesByContactFilters,
): Promise<CandidateRow[]> {
  const name = filters.name?.trim() || null;
  const email = filters.email?.trim() || null;
  const phoneVariants =
    filters.phoneVariants && filters.phoneVariants.length > 0
      ? filters.phoneVariants
      : null;

  if (!name && !email && !phoneVariants) {
    return [];
  }

  const values: unknown[] = [
    name ? name.toLowerCase() : null,
    email ? email.toLowerCase() : null,
    phoneVariants,
  ];
  const matchClauses = [
    `($1::text IS NOT NULL AND lower(name) = $1)`,
    `($2::text IS NOT NULL AND lower(email) = $2)`,
    `($3::text[] IS NOT NULL AND regexp_replace(phone, '\\D', '', 'g') = ANY($3))`,
  ];

  const { rows } = await db.query<CandidateRow>(
    `SELECT * FROM candidates
     WHERE deleted_at IS NULL
       AND (${matchClauses.join(" OR ")})
     ORDER BY id DESC`,
    values,
  );
  return rows;
}

export async function createCandidate(
  db: QueryExecutor,
  input: CreateCandidateInput,
): Promise<CandidateRow> {
  const { rows } = await db.query<CandidateRow>(
    `INSERT INTO candidates (name, email, phone, degree, education, role, experience_years, skills)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::text[], '{}'))
     RETURNING *`,
    [
      input.name ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.degree ?? null,
      input.education ?? null,
      input.role ?? null,
      input.experienceYears ?? null,
      input.skills ?? null,
    ],
  );
  return rows[0];
}

export async function updateCandidate(
  db: QueryExecutor,
  id: string,
  patch: UpdateCandidateInput,
): Promise<CandidateRow | null> {
  const { clause, values } = buildSetClause(
    {
      name: patch.name,
      email: patch.email,
      phone: patch.phone,
      degree: patch.degree,
      education: patch.education,
      role: patch.role,
      experience_years: patch.experienceYears,
      skills: patch.skills,
    },
    2,
  );

  if (!clause) return getCandidateById(db, id);

  const { rows } = await db.query<CandidateRow>(
    `UPDATE candidates
     SET ${clause}, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, ...values],
  );
  return rows[0] ?? null;
}

export async function softDeleteCandidate(
  db: QueryExecutor,
  id: string,
): Promise<CandidateRow | null> {
  const { rows } = await db.query<CandidateRow>(
    `UPDATE candidates
     SET deleted_at = now(), updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Bulk person-scope soft delete: unconditionally soft-deletes every given
 * candidate. Callers that also need the person's applications gone (the
 * `/candidates` bulk delete) must soft-delete `campaign_applied` in the same
 * transaction -- see `softDeleteAllCampaignAppliedForCandidates`.
 */
export async function softDeleteCandidates(
  db: QueryExecutor,
  ids: string[],
): Promise<CandidateRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.query<CandidateRow>(
    `UPDATE candidates
     SET deleted_at = now(), updated_at = now()
     WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
     RETURNING *`,
    [ids],
  );
  return rows;
}

/**
 * Soft-deletes every given candidate that no longer has any live
 * `campaign_applied` row (e.g. after all of their applications were removed
 * as a side effect of soft-deleting a job). A candidate left with
 * `deleted_at NULL` but zero live applications would be invisible to dedupe
 * lookups yet still occupy the email/phone unique index, blocking a future
 * upload that reuses that email/phone from surfacing the duplicate flow.
 */
export async function softDeleteOrphanedCandidates(
  db: QueryExecutor,
  candidateIds: string[],
): Promise<CandidateRow[]> {
  if (candidateIds.length === 0) return [];
  const { rows } = await db.query<CandidateRow>(
    `UPDATE candidates
     SET deleted_at = now(), updated_at = now()
     WHERE id = ANY($1::uuid[])
       AND deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM campaign_applied ca
         WHERE ca.candidate_id = candidates.id AND ca.deleted_at IS NULL
       )
     RETURNING *`,
    [candidateIds],
  );
  return rows;
}

export async function syncCandidateAggregateFields(
  db: QueryExecutor,
  candidateId: string,
): Promise<void> {
  const { rows: cvRows } = await db.query<{
    skills: string[];
    experience_years: string | null;
    role: string | null;
    degree: string | null;
    education: string | null;
    parsed_payload: unknown;
  }>(
    `SELECT cv.skills, cv.experience_years, cv.role, cv.degree, cv.education, cv.parsed_payload
     FROM cv_detail_versions cv
     JOIN campaign_applied ca ON ca.active_cv_version_id = cv.id
     WHERE ca.candidate_id = $1 AND ca.deleted_at IS NULL
     ORDER BY cv.id DESC`,
    [candidateId],
  );

  if (cvRows.length === 0) return;

  const allSkillsSet = new Set<string>();
  for (const r of cvRows) {
    if (r.skills) {
      for (const s of r.skills) {
        const t = s.trim();
        if (t) allSkillsSet.add(t);
      }
    }
  }
  const unionSkills = Array.from(allSkillsSet);

  let maxExp = 0;
  for (const r of cvRows) {
    const expNum = r.experience_years ? parseFloat(r.experience_years) : 0;
    if (Number.isFinite(expNum) && expNum > maxExp) {
      maxExp = expNum;
    }
  }

  const latest = cvRows[0];
  // Identity fields (name/email/phone) live only in `parsed_payload` at the
  // CV-version level -- `normalizeParsedResume` is the same helper the
  // AI-parse write path and the manual-edit merge both keep in sync with, so
  // deriving from it here (rather than duplicating extraction logic) stays
  // consistent with both call sites.
  const latestParsed = normalizeParsedResume(latest.parsed_payload);

  // `COALESCE` on every identity field: the latest CV version is the
  // authoritative *source*, but a version that genuinely has nothing for a
  // field (bad OCR, no embedded text, an AI reparse that found nothing) must
  // never blank out a value this candidate already had -- these fields can
  // now come from manual HR input at confirm time (the review sub-modal), not
  // just AI parsing. See CV9X7R vault notes -- reachable both from a plain AI
  // reparse and from `mergeDuplicateApplicationIntoExisting` carrying over a
  // sparser duplicate CV.
  await db.query(
    `UPDATE candidates
     SET skills = $2,
         experience_years = $3,
         role = COALESCE($4, role),
         degree = COALESCE($5, degree),
         education = COALESCE($6, education),
         name = COALESCE($7, name),
         email = COALESCE($8, email),
         phone = COALESCE($9, phone),
         updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL`,
    [
      candidateId,
      unionSkills,
      maxExp > 0 ? String(maxExp) : null,
      latest.role ?? null,
      latest.degree ?? null,
      latest.education ?? null,
      latestParsed.name,
      latestParsed.email,
      latestParsed.phone,
    ],
  );
}

/**
 * Simplified variant of {@link syncCandidateAggregateFields}: instead of
 * aggregating (union skills / max experience_years) across every live
 * application's active CV, this only reads the single most recent one and
 * writes its values straight onto `candidates` -- for callers that just
 * uploaded/updated one CV and want that CV's data reflected, without paying
 * for (or reasoning about) the multi-application aggregation.
 *
 * Does NOT touch name/email/phone -- those only exist inside
 * `parsed_payload` (see `syncCandidateAggregateFields`), which this variant
 * deliberately doesn't read from.
 */
export type LatestCvFields = {
  skills: string[];
  experience_years: string | null;
  role: string | null;
  degree: string | null;
  education: string | null;
};

/**
 * `cvData`: pass the CV's fields directly (e.g. the row a caller just wrote
 * via `createCvDetailVersion`) to skip the SELECT below entirely -- avoids a
 * redundant round-trip when the caller already has the data fresh.
 */
export async function syncCandidateFieldsFromLatestCv(
  db: QueryExecutor,
  candidateId: string,
  cvData?: LatestCvFields,
): Promise<void> {
  const latest =
    cvData ??
    (
      await db.query<LatestCvFields>(
        `SELECT cv.skills, cv.experience_years, cv.role, cv.degree, cv.education
         FROM cv_detail_versions cv
         JOIN campaign_applied ca ON ca.active_cv_version_id = cv.id
         WHERE ca.candidate_id = $1 AND ca.deleted_at IS NULL
         ORDER BY cv.id DESC
         LIMIT 1`,
        [candidateId],
      )
    ).rows[0];

  if (!latest) return;

  const skills = (latest.skills ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await db.query(
    `UPDATE candidates
     SET skills = $2,
         experience_years = GREATEST(experience_years, $3::numeric),
         role = COALESCE($4, role),
         degree = COALESCE($5, degree),
         education = COALESCE($6, education),
         updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL`,
    [
      candidateId,
      skills,
      latest.experience_years,
      latest.role ?? null,
      latest.degree ?? null,
      latest.education ?? null,
    ],
  );
}

export async function checkRemainApplicationForCandidate(
  db: QueryExecutor,
  candidateId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*)::int AS count FROM campaign_applied WHERE candidate_id = $1 AND deleted_at IS NULL`,
    [candidateId],
  );
  return Number(rows[0]?.count ?? 0) > 0;
}
