import {
  candidateDbRowToTableRow,
  type CandidateDbRow,
} from "@/lib/candidates/db-row";
import type { CandidateStatus } from "@/lib/candidates/types";
import type {
  JobPipelineCandidateRow,
  JobPipelineStatus,
} from "@/lib/jd/pipeline-types";

function candidateStatusToPipelineStatus(s: CandidateStatus): JobPipelineStatus {
  switch (s) {
    case "Interviewing":
      return "INTERVIEWING";
    case "Shortlisted":
      return "CV SCREENING";
    case "Offer":
      return "OFFER";
    case "Matched":
      return "MATCHED";
    case "Failed":
    case "Rejected":
      return "REJECTED";
    default:
      return "NEW";
  }
}

/**
 * Shapes a DB candidate into the evaluation UI row (spreadsheet-style fields;
 * many columns are not stored — shown as "—" until CV parsing exposes them).
 */
export function candidateDbRowToEvaluationPipelineRow(
  r: CandidateDbRow,
): JobPipelineCandidateRow {
  const t = candidateDbRowToTableRow(r);
  const skills = (r.skills ?? []).join(", ") || "—";
  const major =
    t.degree !== "—" || t.school !== "—"
      ? [t.degree, t.school].filter((x) => x !== "—").join(" · ")
      : "—";

  return {
    id: r.id,
    name: t.name,
    verified: false,
    dateOfBirth: "—",
    mobile: "—",
    email: "—",
    studentYears: "—",
    majorSchool: major,
    gpa: "—",
    english: "—",
    relatedSkills: skills,
    status: candidateStatusToPipelineStatus(t.status),
  };
}
