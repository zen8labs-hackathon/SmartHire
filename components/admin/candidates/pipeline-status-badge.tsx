import { cn } from "@heroui/react";

import {
  getStageColorClasses,
  getStageColorStyles,
  getSubStageTextColorClass,
  getSubStageTextColorStyle,
} from "@/lib/candidates/pipeline-status-styles";
import { CandidateApplicationRow } from "@/lib/service/candidate.service";
import { CandidateApplicationSummary } from "@/app/api/admin/upload-files/[id]/candidate-applications/route";

/** snake_case resolved-stage fields (as they arrive on `CandidateApplicationRow`). */
type SnakeStageFields = Pick<
  CandidateApplicationRow,
  | "stage_label"
  | "stage_color"
  | "sub_stage_code"
  | "sub_stage_label"
  | "sub_stage_is_passed"
>;

/** camelCase resolved-stage fields (as they arrive on `CandidateApplicationSummary`). */
export type PipelineStatusBadgeApplication = Pick<
  CandidateApplicationSummary,
  | "stageLabel"
  | "stageColor"
  | "subStageCode"
  | "subStageLabel"
  | "subStageIsPassed"
>;

/** The badge reads an already stage-resolved row in either casing. */
export type PipelineStatusBadgeApp = SnakeStageFields | PipelineStatusBadgeApplication;

function normalizeStage(app: PipelineStatusBadgeApp): SnakeStageFields {
  if ("stage_label" in app) return app;
  return {
    stage_label: app.stageLabel,
    stage_color: app.stageColor,
    sub_stage_code: app.subStageCode,
    sub_stage_label: app.subStageLabel,
    sub_stage_is_passed: app.subStageIsPassed,
  };
}

export function PipelineStatusBadge({
  app,
  hasJob = true,
  className,
}: {
  app: PipelineStatusBadgeApp;
  /** Set to `false` for a CV uploaded without a job -- there's no pipeline
   * to show a stage for, so this is distinct from "not started yet". */
  hasJob?: boolean;
  className?: string;
}) {
  if (!hasJob) {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        N/a
      </span>
    );
  }
  const s = normalizeStage(app);
  if (!s.stage_label || !s.sub_stage_label) {
    // Reachable once the job's pipeline config genuinely can't be resolved
    // (e.g. deleted/misconfigured job) -- callers are expected to resolve
    // stage/sub-stage via `resolveApplicationStages` first (which falls back
    // to the job's first stage for a brand-new, never-moved application), so
    // this is "we don't know", not "nothing has happened yet".
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        N/a
      </span>
    );
  }
  const surfaceClass = getStageColorClasses(s.stage_color, "badge");
  const surfaceStyle = getStageColorStyles(s.stage_color, "badge");
  const detailClass = getSubStageTextColorClass(
    s.sub_stage_code,
    s.sub_stage_is_passed ?? undefined,
    undefined,
    s.stage_color,
  );
  const detailStyle = getSubStageTextColorStyle(
    s.sub_stage_code,
    s.sub_stage_is_passed ?? undefined,
    undefined,
    s.stage_color,
  );
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
        surfaceClass,
        className,
      )}
      style={surfaceStyle}
    >
      <span className="text-foreground">{s.stage_label || "—"}</span>
      <span className="text-muted">·</span>
      <span className={detailClass} style={detailStyle}>
        {s.sub_stage_label || "—"}
      </span>
    </span>
  );
}
