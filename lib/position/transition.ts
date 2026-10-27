import type { JobRow, JobStatus, UpdateJobInput } from "@/lib/db/jobs";
import { deriveJdState } from "@/lib/position/jd-state";
import {
  resolveCandidatePipelineIds,
  type StageMapping,
  type SubStage,
} from "@/lib/pipelines/transition-validator";
import {
  jobToPositionStatus,
  type PositionStatus,
} from "@/lib/position/list-with-enrichment";

export type PositionTransition = "open" | "hold" | "reopen" | "close";

export const POSITION_TRANSITIONS: PositionTransition[] = [
  "open",
  "hold",
  "reopen",
  "close",
];

export function isPositionTransition(v: unknown): v is PositionTransition {
  return (
    typeof v === "string" &&
    (POSITION_TRANSITIONS as string[]).includes(v)
  );
}

const ALLOWED_FROM: Record<PositionTransition, PositionStatus[]> = {
  open: ["Draft"],
  hold: ["Open"],
  reopen: ["On hold", "Closed"],
  close: ["Open", "On hold"],
};

/** Existing `jobs.status` values only; "Draft" is a marker, never a status. */
const TARGET_STATUS: Record<PositionTransition, JobStatus> = {
  open: "Hiring",
  hold: "Pending",
  reopen: "Hiring",
  close: "Done",
};

/** Legacy rule: only HR can hold, reopen or close. */
const HR_ONLY: PositionTransition[] = ["hold", "reopen", "close"];

/** AC-06-16: hold and reopen need a reason. */
export const REASON_REQUIRED: PositionTransition[] = ["hold", "reopen"];
export const STATUS_REASON_MAX = 1000;

/** BR-06-13: a position cannot close while candidates sit in these stage types. */
export const CLOSE_BLOCKING_STAGE_TYPES = ["offer", "probation"];

export type TransitionResult =
  | { ok: true; patch: UpdateJobInput }
  | { ok: false; status: number; error: string };


export function planTransition(
  job: JobRow,
  to: PositionTransition,
  opts: { isHr: boolean; userId: string; reason?: string | null; today?: string },
): TransitionResult {
  const from = jobToPositionStatus(job);
  if (HR_ONLY.includes(to) && !opts.isHr) {
    return { ok: false, status: 403, error: "Only HR can do this." };
  }
  const reason = opts.reason?.trim() ?? "";
  if (REASON_REQUIRED.includes(to) && !reason) {
    return { ok: false, status: 400, error: "A reason is required." };
  }
  if (reason.length > STATUS_REASON_MAX) {
    return {
      ok: false,
      status: 400,
      error: `Reason must be at most ${STATUS_REASON_MAX} characters.`,
    };
  }
  if (!ALLOWED_FROM[to].includes(from)) {
    return {
      ok: false,
      status: 409,
      error: `Cannot ${to} a position that is ${from.toLowerCase()}.`,
    };
  }

  if (to === "open" || to === "reopen") {
    const jd = deriveJdState(job);
    if (jd.state === "processing") {
      return { ok: false, status: 409, error: "JD is still being processed." };
    }
    if (jd.state === "failed") {
      return {
        ok: false,
        status: 409,
        error: "JD extraction failed. Retry or fix the JD first.",
      };
    }
    if (!job.position?.trim()) {
      return { ok: false, status: 400, error: "Title is required." };
    }
    if (!job.start_date || !job.hiring_deadline) {
      return {
        ok: false,
        status: 400,
        error: "Hiring start date and deadline are required.",
      };
    }
  }

  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const patch: UpdateJobInput = {
    status: TARGET_STATUS[to],
    updateNote: null,
    updatedBy: opts.userId,
  };
  if (to === "close") patch.endDate = today;
  if (to === "reopen") patch.endDate = null;
  if (REASON_REQUIRED.includes(to)) patch.statusReason = reason;
  // The snapshot describes the current closure only; a reopen clears it.
  if (to === "reopen") patch.closeSnapshot = null;
  return { ok: true, patch };
}

export type CloseSnapshot = {
  closedAt: string;
  total: number;
  stages: { stageMappingId: string; label: string; stageType: string; count: number }[];
};

export type CloseBlocker = { id: string; name: string; stage: string };

/**
 * Pure: resolves each live application's stage on the job's pipeline, counts
 * candidates per stage (the `close_snapshot`), and lists the applications that
 * block a close (BR-06-13) -- those still active in an offer/probation-type
 * stage. Rejected/withdrawn candidates there do not block.
 */
export function summarizeCloseState(
  rows: {
    id: string;
    name: string | null;
    current_job_stage_mapping_id: string | null;
    current_sub_state_id: string | null;
  }[],
  stageMappings: StageMapping[],
  subStages: SubStage[],
  closedAt: Date = new Date(),
): { snapshot: CloseSnapshot; blocking: CloseBlocker[] } {
  const ordered = [...stageMappings].sort((a, b) => a.sequence_number - b.sequence_number);
  const counts = new Map<string, number>(ordered.map((m) => [m.id, 0]));
  const blocking: CloseBlocker[] = [];

  for (const row of rows) {
    const ids = resolveCandidatePipelineIds(row, stageMappings, subStages);
    if (!ids.stageMappingId) continue;
    counts.set(ids.stageMappingId, (counts.get(ids.stageMappingId) ?? 0) + 1);

    const mapping = stageMappings.find((m) => m.id === ids.stageMappingId);
    const type = mapping?.pipeline_stages?.stage_type ?? "none";
    if (!CLOSE_BLOCKING_STAGE_TYPES.includes(type)) continue;
    const sub = subStages.find((s) => s.id === ids.subStateId);
    if (sub?.is_terminal || sub?.is_withdraw) continue;
    blocking.push({
      id: row.id,
      name: row.name ?? "Unnamed candidate",
      stage: mapping?.pipeline_stages?.label ?? "Unknown stage",
    });
  }

  return {
    snapshot: {
      closedAt: closedAt.toISOString(),
      total: rows.length,
      stages: ordered.map((m) => ({
        stageMappingId: m.id,
        label: m.pipeline_stages?.label ?? "Unknown stage",
        stageType: m.pipeline_stages?.stage_type ?? "none",
        count: counts.get(m.id) ?? 0,
      })),
    },
    blocking,
  };
}
