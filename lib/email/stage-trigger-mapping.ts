/**
 * Maps a pipeline stage+sub-stage transition to the email `trigger_type`
 * that should auto-fire, based on the stage/sub-stage `code` taxonomy
 * actually seeded in this deployment (`cv_scan`, `interview`, `interview_2`,
 * `offer`, each with `new`/`consider`/`passed`/`failed` sub-stages, except
 * `offer` which uses `matched`/`rejected` instead of `passed`/`failed`).
 * Sub-stage codes are global (not per-job), so this mapping is stable across
 * every job's custom pipeline. Returns `null` for combinations with no
 * natural trigger match (e.g. "Consider") -- those transitions simply don't
 * auto-send anything.
 */
export function resolveTriggerTypeForTransition(
  stageCode: string,
  subStageCode: string,
): string | null {
  if (stageCode === "cv_scan") {
    if (subStageCode === "failed") return "screening_rejected";
    return null;
  }
  if (stageCode.startsWith("interview")) {
    if (subStageCode === "new") return "interview_invitation";
    if (subStageCode === "failed") return "post_interview_rejected";
    return null;
  }
  if (stageCode === "offer") {
    if (subStageCode === "new") return "offer_sent";
    if (subStageCode === "matched") return "offer_accepted";
    return null;
  }
  return null;
}
