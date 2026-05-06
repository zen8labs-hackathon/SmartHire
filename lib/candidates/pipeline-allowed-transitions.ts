import { canonicalCandidateStatusFromDb } from "@/lib/candidates/db-row";
import type { CandidateStatus } from "@/lib/candidates/types";
import { CANDIDATE_PIPELINE_STATUSES } from "@/lib/candidates/types";

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
  return ALL_PIPELINE_STATUSES.includes(f) && ALL_PIPELINE_STATUSES.includes(t);
}

export function allowedTargetsFromStatus(current: string): CandidateStatus[] {
  return ALL_PIPELINE_STATUSES.filter((s) =>
    isPipelineTransitionAllowed(current, s),
  );
}
