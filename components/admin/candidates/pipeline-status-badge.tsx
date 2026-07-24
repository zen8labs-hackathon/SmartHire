import { cn } from "@heroui/react";

import {
  getStageColorClasses,
  getStageColorStyles,
  getSubStageTextColorClass,
  getSubStageTextColorStyle,
} from "@/lib/candidates/pipeline-status-styles";

export type PipelineStatusBadgeApplication = {
  stageLabel: string | null;
  stageColor: string | null;
  subStageCode: string | null;
  subStageLabel: string | null;
  subStageIsPassed: boolean | null;
};

/** Compact stage · sub-stage badge for an application row -- shared by the
 * candidate-detail page's application list and the `/candidates` dashboard
 * drawer's "Other applications" panel. */
export function PipelineStatusBadge({
  app,
  className,
}: {
  app: PipelineStatusBadgeApplication;
  className?: string;
}) {
  if (!app.stageLabel || !app.subStageLabel) {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        Not started
      </span>
    );
  }
  const surfaceClass = getStageColorClasses(app.stageColor, "badge");
  const surfaceStyle = getStageColorStyles(app.stageColor, "badge");
  const detailClass = getSubStageTextColorClass(
    app.subStageCode,
    app.subStageIsPassed ?? undefined,
    undefined,
    app.stageColor,
  );
  const detailStyle = getSubStageTextColorStyle(
    app.subStageCode,
    app.subStageIsPassed ?? undefined,
    undefined,
    app.stageColor,
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
      <span className="text-foreground">{app.stageLabel}</span>
      <span className="text-muted">·</span>
      <span className={detailClass} style={detailStyle}>
        {app.subStageLabel}
      </span>
    </span>
  );
}
