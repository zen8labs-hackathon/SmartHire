import type { StageMapping, SubStage } from "@/lib/pipelines/transition-validator";

/** How long after a reject it can still be undone. */
export const REJECT_UNDO_WINDOW_MS = 10 * 60 * 1000;

export type RejectUndoHistory = {
  from_stage_mapping_id: string | null;
  from_sub_state_id: string | null;
  to_stage_mapping_id: string | null;
  to_sub_state_id: string | null;
  at: Date | string;
};

export type RejectUndoPlan =
  | { ok: true; toStageMappingId: string; toSubStateId: string }
  | { ok: false; status: 400 | 409; error: string };

/**
 * Decides whether the application's last stage change was a reject that can
 * still be undone, and where to send it back. Undo is only allowed when the
 * latest history row is a reject (terminal, not withdraw) made within
 * {@link REJECT_UNDO_WINDOW_MS}, the application has not moved since, and the
 * pre-reject position still exists in the job's pipeline. Pure — the caller
 * loads `latest` (newest `candidate_stage_history` row) under a row lock.
 */
export function planRejectUndo(input: {
  latest: RejectUndoHistory | null;
  current: { stageMappingId: string | null; subStateId: string | null };
  stageMappings: StageMapping[];
  subStages: SubStage[];
  now?: Date;
}): RejectUndoPlan {
  const { latest, current, stageMappings, subStages, now = new Date() } = input;
  if (!latest) return { ok: false, status: 409, error: "There is no reject to undo." };

  const rejectSub = subStages.find((s) => s.id === latest.to_sub_state_id);
  if (!rejectSub || !rejectSub.is_terminal || rejectSub.is_withdraw) {
    return { ok: false, status: 409, error: "The candidate's last change was not a reject." };
  }

  if (
    current.stageMappingId !== latest.to_stage_mapping_id ||
    current.subStateId !== latest.to_sub_state_id
  ) {
    return { ok: false, status: 409, error: "The candidate has changed status since the reject." };
  }

  const at = latest.at instanceof Date ? latest.at : new Date(latest.at);
  if (Number.isNaN(at.getTime()) || now.getTime() - at.getTime() > REJECT_UNDO_WINDOW_MS) {
    return { ok: false, status: 409, error: "The undo window (10 minutes) has passed." };
  }

  const fromMapping = stageMappings.find((m) => m.id === latest.from_stage_mapping_id);
  const fromSub = subStages.find((s) => s.id === latest.from_sub_state_id);
  if (!fromMapping || !fromSub || fromSub.pipeline_stage_id !== fromMapping.pipeline_stage_id) {
    return { ok: false, status: 400, error: "The previous stage no longer exists in this pipeline." };
  }

  return { ok: true, toStageMappingId: fromMapping.id, toSubStateId: fromSub.id };
}
