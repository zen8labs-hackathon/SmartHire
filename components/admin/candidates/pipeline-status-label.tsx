"use client";

import { cn } from "@heroui/react";

import { asCandidateStatus } from "@/lib/candidates/db-row";
import {
  pipelineStatusLabelParts,
  pipelineStatusSurfaceClass,
  pipelineStatusTextClass,
} from "@/lib/candidates/pipeline-status-styles";
import type { CandidateStatus } from "@/lib/candidates/types";
import type { StageMapping, SubStage } from "@/lib/pipelines/transition-validator";

type Props = {
  status: CandidateStatus | string;
  /** Badge = pill with background; inline = text only inside selects */
  variant?: "badge" | "inline";
  className?: string;
  uppercase?: boolean;
  /**
   * Accepted but currently unused: DB7X2K's candidates-domain migration
   * dropped the legacy-status<->stage/sub-stage mapping this used to resolve
   * DB-configured colors through (`stageSubStageCodesForLegacyStatus` no
   * longer exists -- green-field schema, no legacy `CandidateStatus` to map
   * from). Kept on the prop signature only because the not-yet-migrated
   * `jd-applied-candidates-pipeline.tsx` still passes them; this component
   * now always falls back to the fixed legacy-status palette. Remove these
   * props once that caller's own migration slice stops passing them.
   */
  stageMappings?: StageMapping[];
  subStages?: SubStage[];
};

export function PipelineStatusLabel({
  status: rawStatus,
  variant = "badge",
  className,
  uppercase = true,
}: Props) {
  const status =
    typeof rawStatus === "string" ? asCandidateStatus(rawStatus) : rawStatus;
  const label = pipelineStatusLabelParts(status);

  const surfaceClass = pipelineStatusSurfaceClass(status, "badge");

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
  const detailClass = pipelineStatusTextClass(status);

  return (
    <span className={rootClass}>
      <span className={cn(textSize, "text-foreground")}>{label.phase}</span>
      {label.detail ? (
        <>
          <span className={cn("mx-1 text-muted", textSize)}>·</span>
          <span className={cn(textSize, detailClass)}>{label.detail}</span>
        </>
      ) : null}
    </span>
  );
}
