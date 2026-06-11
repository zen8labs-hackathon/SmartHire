"use client";

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
import { Button } from "@heroui/react";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import type { PipelineSubStageRow } from "@/lib/pipelines/schemas";

type SubStageListProps = {
  subStages: PipelineSubStageRow[];
  onEditSubStage: (sub: PipelineSubStageRow) => void;
  onDeleteSubStage: (id: string, label: string) => void;
  onReorderSubStages: (newSubStages: PipelineSubStageRow[]) => void;
  onAddClick: () => void;
  busy: boolean;
};

function SortableSubStageItem({
  sub,
  onEditSubStage,
  onDeleteSubStage,
  busy,
}: {
  sub: PipelineSubStageRow;
  onEditSubStage: (sub: PipelineSubStageRow) => void;
  onDeleteSubStage: (id: string, label: string) => void;
  busy: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sub.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center justify-between gap-4 rounded-xl border border-divider p-4 hover:border-default-400 hover:bg-surface-secondary transition-all duration-150 bg-background`}
    >
      <div className="min-w-0 flex-1 flex items-center gap-3">
        {/* Drag handle */}
        <div
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing text-muted hover:text-foreground p-1 rounded-md hover:bg-surface-tertiary transition-colors"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-tertiary text-xs font-bold text-foreground shrink-0">
          #{sub.sequence_number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground truncate max-w-[150px] sm:max-w-none">
              {sub.label}
            </span>
            <span className="rounded-md bg-surface-tertiary px-1.5 py-0.5 text-xs text-muted font-mono border border-divider/50 shrink-0">
              {sub.code}
            </span>
            {sub.is_default && (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent border border-accent/20 shrink-0 select-none">
                Default
              </span>
            )}
            {sub.is_passed && (
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success border border-success/20 shrink-0 select-none">
                Passed
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          size="sm"
          variant="ghost"
          className="text-foreground min-w-0 p-2"
          aria-label="Edit Sub-stage"
          onPress={() => onEditSubStage(sub)}
          isDisabled={busy}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-danger min-w-0 p-2"
          aria-label="Remove Sub-stage"
          onPress={() => onDeleteSubStage(sub.id, sub.label)}
          isDisabled={busy}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function SubStageList({
  subStages,
  onEditSubStage,
  onDeleteSubStage,
  onReorderSubStages,
  onAddClick,
  busy,
}: SubStageListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  if (subStages.length === 0) {
    return (
      <div className="flex h-[350px] flex-col items-center justify-center rounded-xl border border-dashed border-divider">
        <p className="text-sm text-muted">
          No sub-stages configured for this stage.
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="mt-3 text-accent"
          onPress={onAddClick}
          isDisabled={busy}
        >
          Create First Sub-stage
        </Button>
      </div>
    );
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = subStages.findIndex((s) => s.id === active.id);
    const newIndex = subStages.findIndex((s) => s.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const moved = arrayMove(subStages, oldIndex, newIndex);
      // Reassign sequence_number to be dense (1, 2, 3...)
      const updated = moved.map((item, idx) => ({
        ...item,
        sequence_number: idx + 1,
      }));
      onReorderSubStages(updated);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={subStages.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1">
          {subStages.map((sub) => (
            <SortableSubStageItem
              key={sub.id}
              sub={sub}
              onEditSubStage={onEditSubStage}
              onDeleteSubStage={onDeleteSubStage}
              busy={busy}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
