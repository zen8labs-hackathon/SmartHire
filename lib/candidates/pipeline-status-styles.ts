import {
  candidateStatusMajorPhase,
  candidateStatusUiLabel,
  type PipelineMajorPhaseId,
} from "@/lib/candidates/pipeline-phase";
import { CANDIDATE_PIPELINE_STATUSES } from "@/lib/candidates/types";
import type { CandidateStatus } from "@/lib/candidates/types";
import type { CSSProperties } from "react";

export function getStageColorClasses(
  colorName: string | null | undefined,
  surface: "badge" | "column",
): string {
  const soft = surface === "column";
  const color = colorName || "zinc";
  if (color.startsWith("#")) {
    return "";
  }
  switch (color) {
    case "sky":
    case "blue":
      return soft
        ? "border-sky-200/55 bg-sky-50/45 dark:border-sky-500/25 dark:bg-sky-500/10"
        : "border-sky-200/85 bg-sky-50/95 dark:border-sky-500/35 dark:bg-sky-500/14";
    case "violet":
    case "purple":
      return soft
        ? "border-violet-200/55 bg-violet-50/45 dark:border-violet-400/25 dark:bg-violet-500/10"
        : "border-violet-200/85 bg-violet-50/95 dark:border-violet-400/30 dark:bg-violet-500/12";
    case "teal":
      return soft
        ? "border-teal-200/55 bg-teal-50/45 dark:border-teal-400/25 dark:bg-teal-500/10"
        : "border-teal-200/85 bg-teal-50/95 dark:border-teal-400/30 dark:bg-teal-500/12";
    case "emerald":
    case "green":
      return soft
        ? "border-emerald-200/55 bg-emerald-50/45 dark:border-emerald-500/25 dark:bg-emerald-500/10"
        : "border-emerald-200/85 bg-emerald-50/95 dark:border-emerald-500/35 dark:bg-emerald-500/14";
    case "rose":
    case "red":
      return soft
        ? "border-rose-200/55 bg-rose-50/45 dark:border-rose-500/25 dark:bg-rose-500/10"
        : "border-rose-200/85 bg-rose-50/95 dark:border-rose-500/35 dark:bg-rose-500/14";
    case "amber":
    case "yellow":
      return soft
        ? "border-amber-200/55 bg-amber-50/45 dark:border-amber-500/25 dark:bg-amber-500/10"
        : "border-amber-200/85 bg-amber-50/95 dark:border-amber-500/35 dark:bg-amber-500/14";
    default:
      return soft
        ? "border-divider bg-surface-secondary/35"
        : "border-divider bg-surface-secondary/50";
  }
}

/** Shared background per major phase (CV Scan / Interview / Offer). */
function phaseSurfaceClass(
  phase: PipelineMajorPhaseId,
  surface: "badge" | "column",
): string {
  switch (phase) {
    case "cv_scan":
      return getStageColorClasses("sky", surface);
    case "interview":
      return getStageColorClasses("violet", surface);
    case "offer":
      return getStageColorClasses("teal", surface);
    default:
      return getStageColorClasses("zinc", surface);
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

export function pipelineStatusTextClass(status: CandidateStatus | string): string {
  const cleanStatus = status || "";
  if (cleanStatus.includes(":")) {
    const [, sub] = cleanStatus.split(":");
    return getSubStageTextColorClass(sub);
  }
  switch (cleanStatus) {
    case "New":
      return "text-sky-700 dark:text-sky-300";
    case "CvPassed":
      return "text-emerald-700 dark:text-emerald-300";
    case "CvFailed":
      return "text-red-700 dark:text-red-300";
    case "Consider":
    case "InterviewConsider":
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
    return {
      phase: parts[0] ?? label,
      detail: parts.slice(1).join(" - ") || null,
    };
  }
  return { phase: label, detail: null };
}

export function isPipelineStatusKey(value: string): value is CandidateStatus {
  return (CANDIDATE_PIPELINE_STATUSES as readonly string[]).includes(value);
}

export function getStageColorStyles(
  colorName: string | null | undefined,
  surface: "badge" | "column",
): CSSProperties {
  const color = colorName || "zinc";
  if (color.startsWith("#")) {
    const soft = surface === "column";
    // Construct inline CSS styles for custom hex color
    const bgOpacity = soft ? "0c" : "18"; // ~5% opacity for column, ~10% for badge
    const borderOpacity = soft ? "33" : "55"; // ~20% opacity for column, ~33% for badge
    return {
      backgroundColor: `${color}${bgOpacity}`,
      borderColor: `${color}${borderOpacity}`,
      ...(surface === "badge" ? { color: color } : {}),
    };
  }
  return {};
}

/**
 * Resolves whether a candidate row is currently in the "offer" stage's
 * "offer" sub-stage (i.e. currently offered — not yet matched or rejected).
 * Uses a 3-tier fallback since no DB trigger keeps `current_sub_state_id` /
 * `pipeline_status` in sync for candidates that predate the customizable
 * pipeline migration:
 *   1. `current_sub_state_id === offerSubStageId` (authoritative once set)
 *   2. `pipeline_status === "offer:offer"` (denormalized text column)
 *   3. legacy `status === "Offer"` (pre-migration candidates)
 */
export function isCandidateInOfferSubStage(
  row: {
    currentSubStateId?: string | null;
    pipelineStatus?: string | null;
    status?: string | null;
  },
  offerSubStageId: string | null | undefined,
): boolean {
  if (offerSubStageId && row.currentSubStateId) {
    return row.currentSubStateId === offerSubStageId;
  }
  if (row.pipelineStatus) {
    return row.pipelineStatus === "offer:offer";
  }
  return row.status === "Offer";
}

const SUB_STAGE_KEYWORDS = {
  passed: ["pass", "match", "hired", "success"],
  failed: ["fail", "reject", "cancel", "no_show", "decline"],
  consider: ["consider", "hold", "pending"],
  active: ["new", "default", "active", "interview"],
};

function matchesCategory(codeStr: string, category: keyof typeof SUB_STAGE_KEYWORDS): boolean {
  return SUB_STAGE_KEYWORDS[category].some((keyword) => codeStr.includes(keyword));
}

export function getSubStageTextColorClass(
  code: string | null | undefined,
  isPassed?: boolean,
  isDefault?: boolean,
  stageColor?: string | null
): string {
  const c = (code || "").toLowerCase();

  if (isPassed || matchesCategory(c, "passed")) {
    return "text-emerald-600 dark:text-emerald-400";
  }

  if (matchesCategory(c, "failed")) {
    return "text-rose-600 dark:text-rose-400";
  }

  if (matchesCategory(c, "consider")) {
    return "text-zinc-500 dark:text-zinc-400";
  }

  // If default, active or new: inherit stage theme colors
  if (isDefault || matchesCategory(c, "active")) {
    const parentColor = stageColor || "zinc";
    if (parentColor.startsWith("#")) {
      return ""; // apply color inline
    }
    switch (parentColor) {
      case "sky":
      case "blue":
        return "text-sky-700 dark:text-sky-300";
      case "violet":
      case "purple":
        return "text-violet-700 dark:text-violet-300";
      case "teal":
        return "text-teal-700 dark:text-teal-300";
      case "emerald":
      case "green":
        return "text-emerald-700 dark:text-emerald-300";
      case "rose":
      case "red":
        return "text-rose-700 dark:text-rose-300";
      case "amber":
      case "yellow":
        return "text-amber-700 dark:text-amber-300";
      default:
        return "text-foreground";
    }
  }

  return "text-foreground";
}

export function getSubStageTextColorStyle(
  code: string | null | undefined,
  isPassed?: boolean,
  isDefault?: boolean,
  stageColor?: string | null
): CSSProperties {
  const c = (code || "").toLowerCase();

  // If it's a semantic color (passed/failed/consider), it uses predefined tailwind classes
  if (
    isPassed ||
    matchesCategory(c, "passed") ||
    matchesCategory(c, "failed") ||
    matchesCategory(c, "consider")
  ) {
    return {};
  }

  const parentColor = stageColor || "zinc";
  if (parentColor.startsWith("#")) {
    return { color: parentColor };
  }
  return {};
}
