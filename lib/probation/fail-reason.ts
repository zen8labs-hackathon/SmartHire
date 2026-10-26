export type ProbationSubFlags = {
  is_terminal: boolean;
  is_passed: boolean;
  is_withdraw: boolean;
};

/** Not pass = a terminal, non-passed, non-withdraw sub-state (same rule the UI uses for `fail`). */
export function isNotPassSub(sub: ProbationSubFlags | null | undefined): boolean {
  return !!sub && sub.is_terminal && !sub.is_passed && !sub.is_withdraw;
}

export type FailReasonCheck = { ok: true } | { ok: false; error: string };

/**
 * Recording Not pass inside a probation stage requires a non-empty reason
 * (Mentor and RM/HR/Admin alike). Other transitions are unaffected.
 */
export function validateProbationFailReason(input: {
  targetIsProbation: boolean;
  subChanged: boolean;
  targetSub: ProbationSubFlags | null | undefined;
  reason: string | null | undefined;
}): FailReasonCheck {
  if (!input.targetIsProbation || !input.subChanged || !isNotPassSub(input.targetSub)) {
    return { ok: true };
  }
  if (!input.reason || !input.reason.trim()) {
    return { ok: false, error: "A reason is required to record Not pass." };
  }
  return { ok: true };
}
