import { Layers } from "lucide-react";
import { cn } from "@heroui/react";

import {
  getStageColorClasses,
  getStageColorStyles,
  getSubStageTextColorClass,
  getSubStageTextColorStyle,
} from "@/lib/candidates/pipeline-status-styles";
import type {
  StageMapping,
  SubStage,
} from "@/lib/pipelines/transition-validator";

/**
 * Renders a (stageMapping, subStage) pair that has no legacy `CandidateStatus`
 * analog — i.e. a fully custom pipeline stage/sub-stage. Mirrors the markup
 * and color helpers of `PipelineStatusLabel`'s "inline" variant so custom and
 * legacy-analog options in the status filter dropdown look consistent.
 *
 * `subStage: null` renders the "whole stage" filter option from
 * `buildPipelineFilterOptions` (matches every sub-stage under it) -- given a
 * bolder/ring-outlined badge with a layers icon so it visually reads as the
 * group header for the sub-stage rows indented under it, not just another
 * sub-stage entry with different text.
 */
export function PipelineStageSubStageInlineLabel({
  stageMapping,
  subStage,
}: {
  stageMapping: StageMapping;
  subStage: SubStage | null;
}) {
  const stageColor = stageMapping.pipeline_stages?.color ?? null;
  const surfaceClass = getStageColorClasses(stageColor, "badge");
  const surfaceStyle = getStageColorStyles(stageColor, "badge");
  const detailClass = subStage
    ? getSubStageTextColorClass(
        subStage.code,
        subStage.is_passed,
        subStage.is_default,
        stageColor,
      )
    : "";
  const detailStyle = subStage
    ? getSubStageTextColorStyle(
        subStage.code,
        subStage.is_passed,
        subStage.is_default,
        stageColor,
      )
    : undefined;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 font-medium",
        surfaceClass,
        !subStage && "border-2 shadow-sm",
      )}
      style={surfaceStyle}
    >
      {!subStage ? (
        <Layers className="mr-1 size-3 shrink-0 opacity-70" />
      ) : null}
      <span
        className={cn("text-xs text-foreground", !subStage && "font-semibold")}
      >
        {stageMapping.pipeline_stages?.label ??
          stageMapping.pipeline_stages?.code}
      </span>
      {subStage ? (
        <>
          <span className="mx-1 text-xs text-muted">·</span>
          <span className={cn("text-xs", detailClass)} style={detailStyle}>
            {subStage.label}
          </span>
        </>
      ) : null}
    </span>
  );
}
