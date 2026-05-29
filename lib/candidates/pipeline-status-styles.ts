import {
  candidateStatusMajorPhase,
  candidateStatusUiLabel,
  type PipelineMajorPhaseId,
} from "@/lib/candidates/pipeline-phase";
import type { CandidateStatus } from "@/lib/candidates/types";

/** Shared background per major phase (CV Scan / Interview / Offer). */
function phaseSurfaceClass(phase: PipelineMajorPhaseId, surface: "badge" | "column"): string {
  const soft = surface === "column";
  switch (phase) {
    case "cv_scan":
      return soft
        ? "border-sky-200/55 bg-sky-50/45 dark:border-sky-500/25 dark:bg-sky-500/10"
        : "border-sky-200/85 bg-sky-50/95 dark:border-sky-500/35 dark:bg-sky-500/14";
    case "interview":
      return soft
        ? "border-violet-200/55 bg-violet-50/45 dark:border-violet-400/25 dark:bg-violet-500/10"
        : "border-violet-200/85 bg-violet-50/95 dark:border-violet-400/30 dark:bg-violet-500/12";
    case "offer":
      return soft
        ? "border-teal-200/55 bg-teal-50/45 dark:border-teal-400/25 dark:bg-teal-500/10"
        : "border-teal-200/85 bg-teal-50/95 dark:border-teal-400/30 dark:bg-teal-500/12";
    default:
      return soft
        ? "border-divider bg-surface-secondary/35"
        : "border-divider bg-surface-secondary/50";
  }
}

/** Badge/column shell — grouped by phase; sub-status color is on the label text only. */
export function pipelineStatusSurfaceClass(
  status: CandidateStatus,
  surface: "badge" | "column",
): string {
  return phaseSurfaceClass(candidateStatusMajorPhase(status), surface);
}

export function pipelinePhaseSurfaceClass(
  phase: PipelineMajorPhaseId,
  surface: "badge" | "column",
): string {
  return phaseSurfaceClass(phase, surface);
}

export function pipelineStatusTextClass(status: CandidateStatus): string {
  switch (status) {
    case "New":
      return "text-sky-700 dark:text-sky-300";
    case "CvPassed":
      return "text-emerald-700 dark:text-emerald-300";
    case "CvFailed":
      return "text-red-700 dark:text-red-300";
    case "Consider":
      return "text-zinc-600 dark:text-zinc-300";
    case "Interview":
      return "text-violet-700 dark:text-violet-300";
    case "InterviewCanceled":
      return "text-slate-500 dark:text-slate-400";
    case "InterviewPassed":
      return "text-emerald-600 dark:text-emerald-400";
    case "InterviewFailed":
      return "text-rose-600 dark:text-rose-400";
    case "Offer":
      return "text-cyan-700 dark:text-cyan-300";
    case "Matched":
      return "text-lime-700 dark:text-lime-300";
    case "Rejected":
      return "text-rose-600 dark:text-rose-400";
    default:
      return "text-foreground";
  }
}

export function pipelineStatusLabelParts(status: CandidateStatus): {
  phase: string;
  detail: string | null;
} {
  const label = candidateStatusUiLabel(status);
  const parts = label.split(/\s[·-]\s/);
  if (parts.length >= 2) {
    return { phase: parts[0] ?? label, detail: parts.slice(1).join(" - ") || null };
  }
  return { phase: label, detail: null };
}

export function isPipelineStatusKey(value: string): value is CandidateStatus {
  return value !== "all";
}
