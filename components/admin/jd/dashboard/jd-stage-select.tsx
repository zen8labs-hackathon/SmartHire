"use client";

import React from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, Loader2 } from "lucide-react";
import { Button, cn } from "@heroui/react";
import {
  getStageColorClasses,
  getStageColorStyles,
} from "@/lib/candidates/pipeline-status-styles";

interface PipelineStage {
  id: string;
  label: string;
  code: string;
  color: string;
}

interface JdPipelineStageSelectProps {
  allPipelineStages: readonly PipelineStage[];
  selectedStageIds: string[];
  onChange: (ids: string[]) => void;
  isLoading?: boolean;
}

function SortableStageItem({
  id,
  index,
  stage,
  onRemove,
}: {
  id: string;
  index: number;
  stage: PipelineStage;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="flex cursor-grab items-center justify-between gap-3 rounded-xl border border-divider bg-background p-3 transition-colors hover:border-default-400 active:cursor-grabbing"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="text-muted p-1 rounded" aria-label="Drag to reorder">
          <GripVertical className="h-4 w-4" />
        </div>

        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-surface-secondary text-xs font-semibold text-foreground shrink-0 border border-divider">
          #{index + 1}
        </span>

        <span
          className={cn(
            "inline-flex items-center font-medium rounded-full border px-2.5 py-0.5 text-xs uppercase",
            getStageColorClasses(stage.color, "badge"),
          )}
          style={getStageColorStyles(stage.color, "badge")}
        >
          {stage.label}
        </span>
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="text-muted hover:text-danger min-w-0 p-1.5 h-auto rounded-lg"
        aria-label="Remove stage"
        onPress={onRemove}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function JdPipelineStageSelect({
  allPipelineStages,
  selectedStageIds,
  onChange,
  isLoading = false,
}: JdPipelineStageSelectProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleToggle = (stageId: string) => {
    if (selectedStageIds.includes(stageId)) {
      onChange(selectedStageIds.filter((id) => id !== stageId));
    } else {
      onChange([...selectedStageIds, stageId]);
    }
  };

  const handleRemove = (stageId: string) => {
    onChange(selectedStageIds.filter((id) => id !== stageId));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = selectedStageIds.indexOf(String(active.id));
    const newIndex = selectedStageIds.indexOf(String(over.id));

    if (oldIndex !== -1 && newIndex !== -1) {
      onChange(arrayMove(selectedStageIds, oldIndex, newIndex));
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-divider bg-surface-secondary/20">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
        <span className="text-xs text-muted">
          Loading pipeline configuration…
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-semibold text-foreground">
          Select Pipeline Stages
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {allPipelineStages.map((stage) => {
            const isSelected = selectedStageIds.includes(stage.id);
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => handleToggle(stage.id)}
                className={cn(
                  "flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-all text-xs hover:cursor-pointer",
                  isSelected
                    ? "border-accent bg-accent/5 font-medium text-foreground"
                    : "border-divider bg-background text-muted hover:border-default-400 hover:text-foreground",
                )}
              >
                <span className="truncate font-medium">{stage.label}</span>
                {isSelected ? (
                  <span className="size-4 shrink-0 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-[9px] font-bold">
                    ✓
                  </span>
                ) : (
                  <span className="size-4 shrink-0 rounded-full border border-divider flex items-center justify-center text-[9px]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-foreground">
          Stage Sequence (Drag to Reorder)
        </label>
        {selectedStageIds.length === 0 ? (
          <div className="rounded-xl border border-dashed border-divider p-6 text-center text-xs text-muted">
            No stages selected. Select stages above to build the pipeline.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={selectedStageIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                {selectedStageIds.map((id, index) => {
                  const stage = allPipelineStages.find((s) => s.id === id);
                  if (!stage) return null;
                  return (
                    <SortableStageItem
                      key={id}
                      id={id}
                      index={index}
                      stage={stage}
                      onRemove={() => handleRemove(id)}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
