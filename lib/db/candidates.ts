import type { QueryExecutor } from "@/lib/db/config/client";
import type { PaginatedResult, PaginationParams } from "@/lib/db/query-helpers";
import {
  buildSetClause,
  clampLimit,
  clampOffset,
  extractWindowTotal,
} from "@/lib/db/query-helpers";

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
): Promise<CandidateRow | null> {
  const { rows } = await db.query<CandidateRow>(
    `SELECT * FROM candidates WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
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
     ORDER BY created_at DESC
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

export async function createCandidate(
  db: QueryExecutor,
  input: CreateCandidateInput,
): Promise<CandidateRow> {
  const { rows } = await db.query<CandidateRow>(
    `INSERT INTO candidates (name, email, phone, degree, education, role, experience_years, skills)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, '{}'))
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
  }>(
    `SELECT cv.skills, cv.experience_years, cv.role, cv.degree, cv.education
     FROM cv_detail_versions cv
     JOIN campaign_applied ca ON ca.active_cv_version_id = cv.id
     WHERE ca.candidate_id = $1 AND ca.deleted_at IS NULL
     ORDER BY cv.created_at DESC`,
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

  await db.query(
    `UPDATE candidates
     SET skills = $2,
         experience_years = $3,
         role = $4,
         degree = $5,
         education = $6,
         updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL`,
    [
      candidateId,
      unionSkills,
      maxExp > 0 ? String(maxExp) : null,
      latest.role ?? null,
      latest.degree ?? null,
      latest.education ?? null,
    ],
  );
}
