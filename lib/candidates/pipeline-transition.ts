type PrevRow = {
  status: string;
  interview_at: string | null;
  onboarding_at: string | null;
};

type UpdateInput = {
  status:
    | "New"
    | "Shortlisted"
    | "Interviewing"
    | "Offer"
    | "Failed"
    | "Matched"
    | "Rejected";
  interview_at?: string | null;
  onboarding_at?: string | null;
};

export function buildCandidatePipelinePatch(
  prev: PrevRow,
  u: UpdateInput,
): Record<string, unknown> {
  const next = u.status;
  if (next === "Failed" || next === "Matched" || next === "Rejected") {
    return { status: next, interview_at: null, onboarding_at: null };
  }
  if (next === "New" || next === "Shortlisted") {
    return { status: next, interview_at: null, onboarding_at: null };
  }
  if (next === "Interviewing") {
    const interview_at =
      u.interview_at !== undefined
        ? u.interview_at
        : prev.status === "Interviewing"
          ? prev.interview_at
          : null;
    return { status: next, interview_at, onboarding_at: null };
  }
  if (next === "Offer") {
    const onboarding_at =
      u.onboarding_at !== undefined
        ? u.onboarding_at
        : prev.status === "Offer"
          ? prev.onboarding_at
          : null;
    return {
      status: next,
      interview_at: prev.interview_at,
      onboarding_at,
    };
  }
  return { status: next };
}
