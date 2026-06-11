"use client";

import { Button, cn } from "@heroui/react";
import { Pencil, Trash2 } from "lucide-react";
import type { PipelineStageRow } from "@/lib/pipelines/schemas";
import { getStageColorClasses } from "@/lib/candidates/pipeline-status-styles";

type StageListProps = {
  stages: PipelineStageRow[];
  selectedStage: PipelineStageRow | null;
  onSelectStage: (stage: PipelineStageRow) => void;
  onEditStage: (stage: PipelineStageRow) => void;
  onDeleteStage: (id: string, label: string) => void;
  busy: boolean;
};

export function StageList({
  stages,
  selectedStage,
  onSelectStage,
  onEditStage,
  onDeleteStage,
  busy,
}: StageListProps) {
  if (stages.length === 0) {
    return (
      <div className="flex h-[350px] items-center justify-center rounded-xl border border-dashed border-divider">
        <p className="text-sm text-muted">No pipeline stages configured.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1">
      {stages.map((stage) => {
        const isSelected = selectedStage?.id === stage.id;
        return (
          <div
            key={stage.id}
            onClick={() => onSelectStage(stage)}
            className={`group flex items-start justify-between gap-4 cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
              isSelected
                ? "border-accent bg-accent/5"
                : "border-divider hover:border-default-400 hover:bg-surface-secondary"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">
                  {stage.label}
                </span>
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-xs font-mono border border-divider/50",
                    getStageColorClasses(stage.color, "badge"),
                  )}
                >
                  {stage.code}
                </span>
              </div>
              {stage.desc && (
                <p className="mt-1 text-xs text-muted line-clamp-2">
                  {stage.desc}
                </p>
              )}
            </div>

            <div
              className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                size="sm"
                variant="ghost"
                className="text-foreground min-w-0 p-2"
                aria-label="Edit Stage"
                onPress={() => onEditStage(stage)}
                isDisabled={busy}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger min-w-0 p-2"
                aria-label="Remove Stage"
                onPress={() => onDeleteStage(stage.id, stage.label)}
                isDisabled={busy}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
