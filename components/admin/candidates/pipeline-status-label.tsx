"use client";

import { cn } from "@heroui/react";

import { asCandidateStatus } from "@/lib/candidates/db-row";
import {
  getStageColorClasses,
  getStageColorStyles,
  getSubStageTextColorClass,
  getSubStageTextColorStyle,
  pipelineStatusLabelParts,
  pipelineStatusSurfaceClass,
  pipelineStatusTextClass,
} from "@/lib/candidates/pipeline-status-styles";
import type { CandidateStatus } from "@/lib/candidates/types";
import {
  stageSubStageCodesForLegacyStatus,
  type StageMapping,
  type SubStage,
} from "@/lib/pipelines/transition-validator";

type Props = {
  status: CandidateStatus | string;
  /** Badge = pill with background; inline = text only inside selects */
  variant?: "badge" | "inline";
  className?: string;
  uppercase?: boolean;
  /**
   * The JD's configured pipeline stages/sub-stages. When provided, the badge
   * and detail-text colors are resolved from `pipeline_stages.color` (this
   * legacy status's matching stage/sub-stage) instead of the fixed palette.
   */
  stageMappings?: StageMapping[];
  subStages?: SubStage[];
};

function resolveDbStageForLegacyStatus(
  status: CandidateStatus,
  stageMappings: StageMapping[] | undefined,
  subStages: SubStage[] | undefined,
): { stageColor: string | null; subStage: SubStage } | null {
  if (!stageMappings?.length || !subStages?.length) return null;
  const codes = stageSubStageCodesForLegacyStatus(status);
  if (!codes) return null;
  const stageMapping = stageMappings.find(
    (sm) => (sm.pipeline_stages?.code ?? "").toLowerCase() === codes.stage,
  );
  if (!stageMapping) return null;
  const subStage = subStages.find(
    (ss) =>
      ss.pipeline_stage_id === stageMapping.pipeline_stage_id &&
      ss.code.toLowerCase() === codes.sub,
  );
  if (!subStage) return null;
  return { stageColor: stageMapping.pipeline_stages?.color ?? null, subStage };
}

export function PipelineStatusLabel({
  status: rawStatus,
  variant = "badge",
  className,
  uppercase = true,
  stageMappings,
  subStages,
}: Props) {
  const status =
    typeof rawStatus === "string" ? asCandidateStatus(rawStatus) : rawStatus;
  const label = pipelineStatusLabelParts(status);
  const dbStage = resolveDbStageForLegacyStatus(status, stageMappings, subStages);

  const surfaceClass = dbStage
    ? getStageColorClasses(dbStage.stageColor, "badge")
    : pipelineStatusSurfaceClass(status, "badge");
  const surfaceStyle = dbStage
    ? getStageColorStyles(dbStage.stageColor, "badge")
    : undefined;

  const rootClass = cn(
    "inline-flex max-w-full items-center font-medium",
    variant === "badge"
      ? cn(
          "rounded-full border px-2 py-0.5",
          uppercase && "uppercase",
          surfaceClass,
        )
      : cn(
          "rounded-md border px-1.5 py-0.5",
          surfaceClass,
        ),
    className,
  );

  const textSize = variant === "badge" ? "text-[10px]" : "text-xs";

  const detailClass = dbStage
    ? getSubStageTextColorClass(
        dbStage.subStage.code,
        dbStage.subStage.is_passed,
        dbStage.subStage.is_default,
        dbStage.stageColor,
      )
    : pipelineStatusTextClass(status);
  const detailStyle = dbStage
    ? getSubStageTextColorStyle(
        dbStage.subStage.code,
        dbStage.subStage.is_passed,
        dbStage.subStage.is_default,
        dbStage.stageColor,
      )
    : undefined;

  return (
    <span className={rootClass} style={surfaceStyle}>
      <span className={cn(textSize, "text-foreground")}>{label.phase}</span>
      {label.detail ? (
        <>
          <span className={cn("mx-1 text-muted", textSize)}>·</span>
          <span className={cn(textSize, detailClass)} style={detailStyle}>
            {label.detail}
          </span>
        </>
      ) : null}
    </span>
  );
}
