import { cn } from "@heroui/react";

import {
  getStageColorClasses,
  getStageColorStyles,
  getSubStageTextColorClass,
  getSubStageTextColorStyle,
} from "@/lib/candidates/pipeline-status-styles";
import type { StageMapping, SubStage } from "@/lib/pipelines/transition-validator";

/**
 * Renders a (stageMapping, subStage) pair that has no legacy `CandidateStatus`
 * analog — i.e. a fully custom pipeline stage/sub-stage. Mirrors the markup
 * and color helpers of `PipelineStatusLabel`'s "inline" variant so custom and
 * legacy-analog options in the status filter dropdown look consistent.
 */
export function PipelineStageSubStageInlineLabel({
  stageMapping,
  subStage,
}: {
  stageMapping: StageMapping;
  subStage: SubStage;
}) {
  const stageColor = stageMapping.pipeline_stages?.color ?? null;
  const surfaceClass = getStageColorClasses(stageColor, "badge");
  const surfaceStyle = getStageColorStyles(stageColor, "badge");
  const detailClass = getSubStageTextColorClass(
    subStage.code,
    subStage.is_passed,
    subStage.is_default,
    stageColor,
  );
  const detailStyle = getSubStageTextColorStyle(
    subStage.code,
    subStage.is_passed,
    subStage.is_default,
    stageColor,
  );
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 font-medium",
        surfaceClass,
      )}
      style={surfaceStyle}
    >
      <span className="text-xs text-foreground">
        {stageMapping.pipeline_stages?.label ??
          stageMapping.pipeline_stages?.code}
      </span>
      <span className="mx-1 text-xs text-muted">·</span>
      <span className={cn("text-xs", detailClass)} style={detailStyle}>
        {subStage.label}
      </span>
    </span>
  );
}
