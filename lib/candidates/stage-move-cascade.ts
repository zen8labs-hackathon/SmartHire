/**
 * Why a stage/sub-stage move should cancel the application's upcoming
 * interviews, or null when it should not. Shared by every route that moves
 * an application (legacy and Position Management 2).
 */
export function stageMoveCascadeReason(input: {
  stageChanged: boolean;
  subChanged: boolean;
  target: { is_terminal?: boolean | null; is_withdraw?: boolean | null } | undefined;
  cancelUpcomingSessions: boolean | undefined;
}): string | null {
  const { stageChanged, subChanged, target, cancelUpcomingSessions } = input;
  const terminal = subChanged && (target?.is_terminal || target?.is_withdraw);
  if (terminal) {
    return target?.is_withdraw
      ? "The candidate withdrew."
      : "The candidate was rejected.";
  }
  return stageChanged && cancelUpcomingSessions === true
    ? "Candidate moved to another stage"
    : null;
}
