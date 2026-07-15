import type { QueryExecutor } from "@/lib/db/config/client";
import type { PaginatedResult, PaginationParams } from "@/lib/db/query-helpers";
import {
  buildSetClause,
  clampLimit,
  clampOffset,
  extractWindowTotal,
} from "@/lib/db/query-helpers";

export type JobStatus = "Done" | "Hiring" | "Pending" | "Closed";

/** Merged job_openings + job_descriptions (DB7X2K item 1). Always created with every field in one step — no Draft status. */
export type JobRow = {
  id: string;
  position: string;
  status: JobStatus;
  department: string | null;
  employment_status: string | null;
  work_location: string | null;
  reporting: string | null;
  role_overview: string | null;
  duties_and_responsibilities: string | null;
  experience_requirements_must_have: string | null;
  experience_requirements_nice_to_have: string | null;
  what_we_offer: string | null;
  level: string | null;
  headcount: number | null;
  hire_type: string | null;
  project_info: string | null;
  team_size: string | null;
  language_requirements: string | null;
  career_development: string | null;
  other_requirements: string | null;
  salary_range: string | null;
  project_allowances: string | null;
  interview_process: string | null;
  start_date: Date | null;
  end_date: Date | null;
  hiring_deadline: Date | null;
  jd_storage_path: string | null;
  jd_original_filename: string | null;
  jd_mime_type: string | null;
  update_note: string | null;
  created_at: Date;
  created_by: string | null;
  updated_at: Date;
  updated_by: string | null;
  deleted_at: Date | null;
};

export type CreateJobInput = {
  position: string;
  status?: JobStatus;
  department?: string | null;
  employmentStatus?: string | null;
  workLocation?: string | null;
  reporting?: string | null;
  roleOverview?: string | null;
  dutiesAndResponsibilities?: string | null;
  experienceRequirementsMustHave?: string | null;
  experienceRequirementsNiceToHave?: string | null;
  whatWeOffer?: string | null;
  level?: string | null;
  headcount?: number | null;
  hireType?: string | null;
  projectInfo?: string | null;
  teamSize?: string | null;
  languageRequirements?: string | null;
  careerDevelopment?: string | null;
  otherRequirements?: string | null;
  salaryRange?: string | null;
  projectAllowances?: string | null;
  interviewProcess?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  hiringDeadline?: string | null;
  jdStoragePath?: string | null;
  jdOriginalFilename?: string | null;
  jdMimeType?: string | null;
  updateNote?: string | null;
  createdBy?: string | null;
};

export type UpdateJobInput = Partial<Omit<CreateJobInput, "createdBy">> & {
  updateNote?: string | null;
  updatedBy?: string | null;
};

export type ListJobsFilters = PaginationParams & {
  status?: JobStatus;
  /** Matches against `position` via `ILIKE %q%`. */
  q?: string;
  /** Inclusive lower/upper bound (YYYY-MM-DD) on `start_date`. */
  startFrom?: string;
  startTo?: string;
};

/** Same q/date-range filters as `listJobs`, scoped by everything except `status` itself -- for status-tab counts. */
export type CountJobsByStatusFilters = {
  q?: string;
  startFrom?: string;
  startTo?: string;
};

export async function getJobById(
  db: QueryExecutor,
  id: string,
): Promise<JobRow | null> {
  const { rows } = await db.query<JobRow>(
    `SELECT * FROM jobs WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listJobs(
  db: QueryExecutor,
  filters: ListJobsFilters = {},
): Promise<PaginatedResult<JobRow>> {
  const limit = clampLimit(filters.limit);
  const offset = clampOffset(filters.offset);

  const conditions = ["deleted_at IS NULL"];
  const values: unknown[] = [];

  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }
  if (filters.q) {
    values.push(`%${filters.q}%`);
    conditions.push(`position ILIKE $${values.length}`);
  }
  if (filters.startFrom) {
    values.push(filters.startFrom);
    conditions.push(`start_date >= $${values.length}`);
  }
  if (filters.startTo) {
    values.push(filters.startTo);
    conditions.push(`start_date <= $${values.length}`);
  }

  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const { rows } = await db.query<JobRow & { total_count: string }>(
    `SELECT *, count(*) OVER() AS total_count
     FROM jobs
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

/** Row counts per status, scoped by the same q/date-range filters as `listJobs` (ignores `status` itself and pagination). */
export async function countJobsByStatus(
  db: QueryExecutor,
  filters: CountJobsByStatusFilters = {},
): Promise<Record<JobStatus, number>> {
  const conditions = ["deleted_at IS NULL"];
  const values: unknown[] = [];

  if (filters.q) {
    values.push(`%${filters.q}%`);
    conditions.push(`position ILIKE $${values.length}`);
  }
  if (filters.startFrom) {
    values.push(filters.startFrom);
    conditions.push(`start_date >= $${values.length}`);
  }
  if (filters.startTo) {
    values.push(filters.startTo);
    conditions.push(`start_date <= $${values.length}`);
  }

  const { rows } = await db.query<{ status: JobStatus; count: string }>(
    `SELECT status, count(*) AS count
     FROM jobs
     WHERE ${conditions.join(" AND ")}
     GROUP BY status`,
    values,
  );

  const counts: Record<JobStatus, number> = {
    Pending: 0,
    Hiring: 0,
    Done: 0,
    Closed: 0,
  };
  for (const r of rows) {
    counts[r.status] = Number(r.count);
  }
  return counts;
}
export async function createJob(
  db: QueryExecutor,
  input: CreateJobInput,
): Promise<JobRow> {
  const { rows } = await db.query<JobRow>(
    `INSERT INTO jobs (
       position, status, department, employment_status, work_location, reporting,
       role_overview, duties_and_responsibilities, experience_requirements_must_have,
       experience_requirements_nice_to_have, what_we_offer, level, headcount, hire_type,
       project_info, team_size, language_requirements, career_development, other_requirements,
       salary_range, project_allowances, interview_process, start_date, end_date,
       hiring_deadline, jd_storage_path, jd_original_filename, jd_mime_type, update_note, created_by
     )
     VALUES (
        $1, COALESCE($2, 'Pending'), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
     )
     RETURNING *`,
    [
      input.position,
      input.status ?? null,
      input.department ?? null,
      input.employmentStatus ?? null,
      input.workLocation ?? null,
      input.reporting ?? null,
      input.roleOverview ?? null,
      input.dutiesAndResponsibilities ?? null,
      input.experienceRequirementsMustHave ?? null,
      input.experienceRequirementsNiceToHave ?? null,
      input.whatWeOffer ?? null,
      input.level ?? null,
      input.headcount ?? null,
      input.hireType ?? null,
      input.projectInfo ?? null,
      input.teamSize ?? null,
      input.languageRequirements ?? null,
      input.careerDevelopment ?? null,
      input.otherRequirements ?? null,
      input.salaryRange ?? null,
      input.projectAllowances ?? null,
      input.interviewProcess ?? null,
      input.startDate ?? null,
      input.endDate ?? null,
      input.hiringDeadline ?? null,
      input.jdStoragePath ?? null,
      input.jdOriginalFilename ?? null,
      input.jdMimeType ?? null,
      input.updateNote ?? null,
      input.createdBy ?? null,
    ],
  );
  return rows[0];
}

export async function updateJob(
  db: QueryExecutor,
  id: string,
  patch: UpdateJobInput,
): Promise<JobRow | null> {
  const { clause, values } = buildSetClause(
    {
      position: patch.position,
      status: patch.status,
      department: patch.department,
      employment_status: patch.employmentStatus,
      work_location: patch.workLocation,
      reporting: patch.reporting,
      role_overview: patch.roleOverview,
      duties_and_responsibilities: patch.dutiesAndResponsibilities,
      experience_requirements_must_have: patch.experienceRequirementsMustHave,
      experience_requirements_nice_to_have:
        patch.experienceRequirementsNiceToHave,
      what_we_offer: patch.whatWeOffer,
      level: patch.level,
      headcount: patch.headcount,
      hire_type: patch.hireType,
      project_info: patch.projectInfo,
      team_size: patch.teamSize,
      language_requirements: patch.languageRequirements,
      career_development: patch.careerDevelopment,
      other_requirements: patch.otherRequirements,
      salary_range: patch.salaryRange,
      project_allowances: patch.projectAllowances,
      interview_process: patch.interviewProcess,
      start_date: patch.startDate,
      end_date: patch.endDate,
      hiring_deadline: patch.hiringDeadline,
      jd_storage_path: patch.jdStoragePath,
      jd_original_filename: patch.jdOriginalFilename,
      jd_mime_type: patch.jdMimeType,
      update_note: patch.updateNote,
      updated_by: patch.updatedBy,
    },
    2,
  );
  if (!clause) return getJobById(db, id);

  const { rows } = await db.query<JobRow>(
    `UPDATE jobs
     SET ${clause}, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, ...values],
  );
  return rows[0] ?? null;
}

export async function softDeleteJob(
  db: QueryExecutor,
  id: string,
): Promise<JobRow | null> {
  const { rows } = await db.query<JobRow>(
    `UPDATE jobs
     SET deleted_at = now(), updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}
