import type { JobRow, JobStatus, UpdateJobInput } from "@/lib/db/jobs";
import { deriveJdState } from "@/lib/position/jd-state";
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

export type TransitionResult =
  | { ok: true; patch: UpdateJobInput }
  | { ok: false; status: number; error: string };


export function planTransition(
  job: JobRow,
  to: PositionTransition,
  opts: { isHr: boolean; userId: string; today?: string },
): TransitionResult {
  const from = jobToPositionStatus(job);
  if (HR_ONLY.includes(to) && !opts.isHr) {
    return { ok: false, status: 403, error: "Only HR can do this." };
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
  return { ok: true, patch };
}
