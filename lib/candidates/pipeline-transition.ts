import { canonicalCandidateStatusFromDb } from "@/lib/candidates/db-row";
import type { CandidateStatus } from "@/lib/candidates/types";
import {
  CV_SCAN_STATUSES,
  INTERVIEW_STATUSES,
} from "@/lib/candidates/pipeline-phase";

type PrevRow = {
  status: string;
  interview_at: string | null;
  onboarding_at: string | null;
};

type UpdateInput = {
  status: CandidateStatus;
  interview_at?: string | null;
  onboarding_at?: string | null;
};

export function buildCandidatePipelinePatch(
  prev: PrevRow,
  u: UpdateInput,
): Record<string, unknown> {
  const prevStatus = canonicalCandidateStatusFromDb(prev.status);
  if (prevStatus == null) {
    throw new Error(`Unknown candidate status in DB: ${prev.status}`);
  }

  const next = u.status;

  if (INTERVIEW_STATUSES.has(next)) {
    let interview_at: string | null = null;
    if (u.interview_at !== undefined) {
      interview_at = u.interview_at;
    } else if (INTERVIEW_STATUSES.has(prevStatus)) {
      interview_at = prev.interview_at;
    }
    return { status: next, interview_at, onboarding_at: null };
  }

  if (next === "Offer") {
    const onboarding_at =
      u.onboarding_at !== undefined
        ? u.onboarding_at
        : prevStatus === "Offer"
          ? prev.onboarding_at
          : null;
    return {
      status: next,
      interview_at: prev.interview_at,
      onboarding_at,
    };
  }

  if (next === "Matched" || next === "Rejected") {
    return {
      status: next,
      interview_at: prev.interview_at,
      onboarding_at: prev.onboarding_at,
    };
  }

  if (CV_SCAN_STATUSES.has(next)) {
    return { status: next, interview_at: null, onboarding_at: null };
  }

  return { status: next };
}
