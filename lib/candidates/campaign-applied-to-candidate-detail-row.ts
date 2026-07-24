import type { CampaignAppliedAdminRow } from "@/lib/db/campaign-applied-list";
import { formatCandidateSourceLabel } from "@/lib/candidates/source-constants";
import { formatDisplayDate } from "@/lib/format-date";

/**
 * Candidate-detail view model for `/admin/candidate-detail/[id]`. Unlike
 * `JobPipelineCandidateRow`, this deliberately drops every pipeline
 * stage/sub-stage field -- this page shows the person's profile and CV
 * versions, not their position in a job's pipeline.
 */
export type CandidateDetailRow = {
  id: string;
  name: string;
  dateOfBirth: string;
  mobile: string;
  email: string;
  studentYears: string;
  majorSchool: string;
  gpa: string;
  english: string;
  relatedSkills: string;
  expectedSalary: string | null;
  sourceLabel: string;
  jobTitle: string;
};

export function campaignAppliedAdminRowToCandidateDetailRow(
  r: CampaignAppliedAdminRow,
): CandidateDetailRow {
  const major =
    [r.candidate_degree, r.candidate_education].filter(Boolean).join(" · ") ||
    "—";

  return {
    id: r.id,
    name: r.candidate_name ?? "—",
    dateOfBirth: formatDisplayDate(r.cv_date_of_birth),
    mobile: r.candidate_phone ?? "—",
    email: r.candidate_email ?? "—",
    studentYears: r.cv_student_years ?? "—",
    majorSchool: major,
    gpa: r.cv_gpa ?? "—",
    english: r.cv_english_level ?? "—",
    relatedSkills:
      r.candidate_skills.length > 0 ? r.candidate_skills.join(", ") : "—",
    expectedSalary: r.expected_salary?.trim() || null,
    sourceLabel: formatCandidateSourceLabel(r.source, r.source_other),
    jobTitle: r.job_position,
  };
}
