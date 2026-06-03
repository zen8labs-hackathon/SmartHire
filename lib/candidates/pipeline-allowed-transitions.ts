import { canonicalCandidateStatusFromDb } from "@/lib/candidates/db-row";
import type { CandidateStatus } from "@/lib/candidates/types";
import { CANDIDATE_PIPELINE_STATUSES } from "@/lib/candidates/types";

import { candidateStatusMajorPhase } from "@/lib/candidates/pipeline-phase";

/** All values allowed by DB check constraint (`candidates_status_check`). */
export const ALL_PIPELINE_STATUSES: CandidateStatus[] = [
  ...CANDIDATE_PIPELINE_STATUSES,
];

/**
 * Any move between two allowed pipeline statuses is permitted (Kanban / drawer / bulk).
 * `from` may still be a legacy DB string (e.g. Interviewing → normalized to Interview).
 * DB still enforces the status enum via `candidates_status_check`.
 */
export function isPipelineTransitionAllowed(from: string, to: string): boolean {
  const f = canonicalCandidateStatusFromDb(from);
  const t = canonicalCandidateStatusFromDb(to);
  if (f == null || t == null) return false;
  if (f === t) return true;

  const phaseF = candidateStatusMajorPhase(f);
  const phaseT = candidateStatusMajorPhase(t);

  // Allow free movement within the same pipeline phase
  if (phaseF === phaseT) return true;

  // Control transitions between different pipeline phases to prevent stage skipping (nhảy cóc)
  if (phaseF === "cv_scan" && phaseT === "interview") {
    return f === "CvPassed" && (t === "Interview" || t === "InterviewConsider");
  }

  if (phaseF === "interview" && phaseT === "offer") {
    return f === "InterviewPassed" && (t === "Offer" || t === "Rejected");
  }

  // Allow rollbacks/undos to the immediate previous phase
  if (phaseF === "interview" && phaseT === "cv_scan") {
    return (
      f === "Interview" ||
      f === "InterviewConsider" ||
      f === "InterviewCanceled"
    );
  }

  if (phaseF === "offer" && phaseT === "interview") {
    return f === "Offer" || f === "Rejected";
  }

  return false;
}

export function allowedTargetsFromStatus(current: string): CandidateStatus[] {
  return ALL_PIPELINE_STATUSES.filter((s) =>
    isPipelineTransitionAllowed(current, s),
  );
}
