import type { QueryExecutor } from "@/lib/db/config/client";
import { listAllowedChaptersForJobs, type JobChapterRef } from "@/lib/db/job-permissions";
import { getJobById, type JobRow } from "@/lib/db/jobs";

/** Free-text JD columns (AI-extracted or HR-entered) shown in the "Description & criteria" tab. */
export const POSITION_DETAIL_COLUMNS = {
  department: "department",
  reporting: "reporting",
  roleOverview: "role_overview",
  duties: "duties_and_responsibilities",
  workLocation: "work_location",
  mustHave: "experience_requirements_must_have",
  niceToHave: "experience_requirements_nice_to_have",
  benefits: "what_we_offer",
  languages: "language_requirements",
  project: "project_info",
  teamSize: "team_size",
  salaryRange: "salary_range",
} as const satisfies Record<string, keyof JobRow>;

export type PositionDetails = Record<keyof typeof POSITION_DETAIL_COLUMNS, string | null>;

export type PositionDescription = {
  id: string;
  /** Chapters the position belongs to (job_allowed_chapters). */
  chapters: JobChapterRef[];
  details: PositionDetails;
};

export function jobToPositionDetails(job: JobRow): PositionDetails {
  const out = {} as PositionDetails;
  for (const [key, col] of Object.entries(POSITION_DETAIL_COLUMNS)) {
    out[key as keyof PositionDetails] = (job[col as keyof JobRow] as string | null) ?? null;
  }
  return out;
}

/** Data for the new Position Management "Description & criteria" tab (legacy JD APIs are untouched). */
export async function getPositionDescription(
  db: QueryExecutor,
  jobId: string,
): Promise<PositionDescription | null> {
  const job = await getJobById(db, jobId);
  if (!job || job.deleted_at) return null;
  const chapters = (await listAllowedChaptersForJobs(db, [jobId])).get(jobId) ?? [];
  return { id: job.id, chapters, details: jobToPositionDetails(job) };
}
