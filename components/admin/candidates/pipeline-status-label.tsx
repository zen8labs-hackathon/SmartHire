"use client";

import { cn } from "@heroui/react";

import {
  pipelineStatusLabelParts,
  pipelineStatusSurfaceClass,
  pipelineStatusTextClass,
} from "@/lib/candidates/pipeline-status-styles";
import type { CandidateStatus } from "@/lib/candidates/types";

type Props = {
  status: CandidateStatus;
  /** Badge = pill with background; inline = text only inside selects */
  variant?: "badge" | "inline";
  className?: string;
  uppercase?: boolean;
};

export function PipelineStatusLabel({
  status,
  variant = "badge",
  className,
  uppercase = true,
}: Props) {
  const label = pipelineStatusLabelParts(status);

  const rootClass = cn(
    "inline-flex max-w-full items-center font-medium",
    variant === "badge"
      ? cn(
          "rounded-full border px-2 py-0.5",
          uppercase && "uppercase",
          pipelineStatusSurfaceClass(status, "badge"),
        )
      : cn(
          "rounded-md border px-1.5 py-0.5",
          pipelineStatusSurfaceClass(status, "badge"),
        ),
    className,
  );

  const textSize = variant === "badge" ? "text-[10px]" : "text-xs";

  return (
    <span className={rootClass}>
      <span className={cn(textSize, "text-foreground")}>{label.phase}</span>
      {label.detail ? (
        <>
          <span className={cn("mx-1 text-muted", textSize)}>·</span>
          <span className={cn(textSize, pipelineStatusTextClass(status))}>{label.detail}</span>
        </>
      ) : null}
    </span>
  );
}
