import type { CandidateWithExtraInfoRow } from "@/lib/db/candidates";
import { formatDisplayDate } from "@/lib/format-date";

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
  /** `null` means this CV was uploaded without selecting a job. */
  jobTitle: string | null;
};

export function candidateToCandidateDetailRow(
  r: CandidateWithExtraInfoRow,
): CandidateDetailRow {
  const major = [r.degree, r.education].filter(Boolean).join(" · ") || "—";

  return {
    id: r.id,
    name: r.name ?? "—",
    dateOfBirth: formatDisplayDate(r.date_of_birth),
    mobile: r.phone ?? "—",
    email: r.email ?? "—",
    studentYears: r.student_years ?? "—",
    majorSchool: major,
    gpa: r.gpa ?? "—",
    english: r.english_level ?? "—",
    relatedSkills: r.skills.length > 0 ? r.skills.join(", ") : "—",
    expectedSalary: null,
    sourceLabel: "—",
    jobTitle: null,
  };
}
