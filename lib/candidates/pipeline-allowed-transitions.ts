import type { CandidateStatus } from "@/lib/candidates/types";

/** All values allowed by DB check constraint. */
export const ALL_PIPELINE_STATUSES: CandidateStatus[] = [
  "New",
  "Shortlisted",
  "Interviewing",
  "Offer",
  "Failed",
  "Matched",
  "Rejected",
];

/**
 * Whether a candidate may move from `from` to `to`.
 * Matched / Rejected: only from Offer. Failed: only from New / Shortlisted / Interviewing.
 */
export function isPipelineTransitionAllowed(
  from: string,
  to: string,
): boolean {
  if (from === to) return true;
  const f = from as CandidateStatus;
  const tStr = to;

  if (tStr === "Matched" || tStr === "Rejected") {
    return f === "Offer";
  }
  if (tStr === "Failed") {
    return f === "New" || f === "Shortlisted" || f === "Interviewing";
  }

  const t = tStr as CandidateStatus;
  switch (f) {
    case "Matched":
    case "Rejected":
      return t === "Offer";
    case "Failed":
      return (
        t === "New" ||
        t === "Shortlisted" ||
        t === "Interviewing" ||
        t === "Failed"
      );
    case "Offer":
      return (
        t === "Offer" ||
        t === "Interviewing" ||
        t === "Matched" ||
        t === "Rejected"
      );
    case "Interviewing":
      return (
        t === "New" ||
        t === "Shortlisted" ||
        t === "Interviewing" ||
        t === "Offer" ||
        t === "Failed"
      );
    case "New":
    case "Shortlisted":
      return (
        t === "New" ||
        t === "Shortlisted" ||
        t === "Interviewing" ||
        t === "Failed"
      );
    default:
      return ALL_PIPELINE_STATUSES.includes(t);
  }
}

export function allowedTargetsFromStatus(current: string): CandidateStatus[] {
  return ALL_PIPELINE_STATUSES.filter((s) =>
    isPipelineTransitionAllowed(current, s),
  );
}
