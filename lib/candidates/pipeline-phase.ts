import type { CandidateStatus } from "@/lib/candidates/types";

export type PipelineMajorPhaseId = "cv_scan" | "interview" | "offer";

export const PIPELINE_PHASES = [
  {
    id: "cv_scan",
    title: "CV Scan",
    statuses: ["New", "Consider", "CvPassed", "CvFailed"],
  },
  {
    id: "interview",
    title: "Interview",
    statuses: [
      "Interview",
      "InterviewConsider",
      "InterviewCanceled",
      "InterviewPassed",
      "InterviewFailed",
    ],
  },
  {
    id: "offer",
    title: "Offer",
    statuses: ["Offer", "Matched", "Rejected"],
  },
] as const satisfies ReadonlyArray<{
  id: PipelineMajorPhaseId;
  title: string;
  statuses: readonly CandidateStatus[];
}>;

/** Flat order for filters and status-count APIs */
export const PIPELINE_STATUS_DISPLAY_ORDER: CandidateStatus[] =
  PIPELINE_PHASES.flatMap((p) => [...p.statuses]);

const STATUS_TO_PHASE = new Map<CandidateStatus, PipelineMajorPhaseId>();
for (const p of PIPELINE_PHASES) {
  for (const s of p.statuses as readonly CandidateStatus[]) {
    STATUS_TO_PHASE.set(s, p.id);
  }
}

export function candidateStatusMajorPhase(
  status: CandidateStatus,
): PipelineMajorPhaseId {
  return STATUS_TO_PHASE.get(status) ?? "cv_scan";
}

/** Short label inside a phase column (may repeat across phases). */
export function candidateStatusShortLabel(status: CandidateStatus): string {
  switch (status) {
    case "New":
      return "New";
    case "CvPassed":
    case "InterviewPassed":
      return "Passed";
    case "CvFailed":
    case "InterviewFailed":
      return "Failed";
    case "Consider":
    case "InterviewConsider":
      return "Consider";
    case "Interview":
      return "Interview";
    case "InterviewCanceled":
      return "Cancel";
    case "Offer":
      return "Offer";
    case "Matched":
      return "Matched";
    case "Rejected":
      return "Rejected";
    default:
      return String(status);
  }
}

/** Table / drawer: phase + short label for disambiguation */
export function candidateStatusUiLabel(status: CandidateStatus): string {
  const phase = PIPELINE_PHASES.find((p) =>
    (p.statuses as readonly CandidateStatus[]).includes(status),
  );
  if (!phase) return candidateStatusShortLabel(status);
  return `${phase.title} · ${candidateStatusShortLabel(status)}`;
}

/** Lowercase haystack tokens for search */
export function candidateStatusSearchHaystack(status: CandidateStatus): string {
  const phase = PIPELINE_PHASES.find((p) =>
    (p.statuses as readonly CandidateStatus[]).includes(status),
  );
  return [
    status,
    phase?.title,
    candidateStatusShortLabel(status),
    candidateStatusUiLabel(status),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export const CV_SCAN_STATUSES = new Set<CandidateStatus>(
  PIPELINE_PHASES.find((p) => p.id === "cv_scan")!
    .statuses as unknown as CandidateStatus[],
);

export const INTERVIEW_STATUSES = new Set<CandidateStatus>(
  PIPELINE_PHASES.find((p) => p.id === "interview")!
    .statuses as unknown as CandidateStatus[],
);

export const OFFER_STATUSES = new Set<CandidateStatus>(
  PIPELINE_PHASES.find((p) => p.id === "offer")!
    .statuses as unknown as CandidateStatus[],
);

/** Statuses allowed to edit interview schedule via timeline API */
export const INTERVIEW_SCHEDULE_STATUSES = new Set<CandidateStatus>([
  "Interview",
  "InterviewPassed",
]);

/**
 * True when a `pipeline_sub_stages.code` represents a terminal failure/rejection
 * outcome. No dedicated schema flag exists for this, so — per the naming
 * convention already used by the seeded "rejected" sub-stage under the "offer"
 * stage — any code containing "fail" or "reject" (case-insensitive substring
 * match) is treated as a failure target.
 */
export function isFailSubStageCode(code: string | null | undefined): boolean {
  if (!code) return false;
  const lower = code.toLowerCase();
  return lower.includes("fail") || lower.includes("reject");
}

/**
 * CV-scan-stage candidates eligible for the "Move to interview" bulk action
 * in the customizable pipeline-stage system (excludes scan failures).
 * `stageCode`/`subStageCode` are the candidate's *current* resolved stage and
 * sub-stage codes (see `resolveCandidatePipelineIds`).
 */
export function isEligibleForBulkMoveToInterview(
  stageCode: string | null | undefined,
  subStageCode: string | null | undefined,
): boolean {
  if ((stageCode ?? "").toLowerCase() !== "cv_scan") return false;
  return !isFailSubStageCode(subStageCode);
}
