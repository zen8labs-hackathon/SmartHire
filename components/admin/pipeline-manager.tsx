"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button } from "@heroui/react";
import { SectionCard } from "@/components/admin/shell/cards";

import { useToast } from "@/components/admin/toast-provider";
import { SuspenseErrorBoundary } from "@/components/admin/suspense-error-boundary";
import type {
  PipelineStageRow,
  PipelineSubStageRow,
} from "@/lib/pipelines/schemas";

import { StagesPanel, type StagesPanelHandle } from "./pipelines/stages-panel";
import { StagesPanelSkeleton } from "./pipelines/stages-panel-skeleton";
import { SubStageList } from "./pipelines/sub-stage-list";
import { SubStageForm } from "./pipelines/sub-stage-form";

const JSON_HEADERS = { "Content-Type": "application/json" };

function StagesErrorFallback() {
  return (
    <div className="p-6">
      <Alert status="danger" className="rounded-xl">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Error</Alert.Title>
          <Alert.Description>
            Could not load pipeline stages. Please refresh.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    </div>
  );
}

type PipelineManagerProps = {
  stagesPromise: Promise<PipelineStageRow[]>;
};

export function PipelineManager({ stagesPromise }: PipelineManagerProps) {
  const toast = useToast();

  // State
  const [selectedStage, setSelectedStage] = useState<PipelineStageRow | null>(
    null,
  );
  const [subStages, setSubStages] = useState<PipelineSubStageRow[]>([]);

  // Mode states
  const [subStageMode, setSubStageMode] = useState<"list" | "add" | "edit">(
    "list",
  );
  const [editingSubStage, setEditingSubStage] =
    useState<PipelineSubStageRow | null>(null);

  // Status states
  const [busy, setBusy] = useState(false);

  // Imperative handle to trigger "Add Stage" from the header, which stays
  // outside the Suspense boundary wrapping StagesPanel.
  const stagesPanelRef = useRef<StagesPanelHandle | null>(null);
  const [stagesPanelReady, setStagesPanelReady] = useState(false);
  const setStagesPanelRef = useCallback((handle: StagesPanelHandle | null) => {
    stagesPanelRef.current = handle;
    setStagesPanelReady(handle !== null);
  }, []);

  // Load sub-stages for selected stage
  const loadSubStages = useCallback(
    async (stageId: string) => {
      try {
        const res = await fetch(
          `/api/admin/pipelines/sub-stages?stageId=${stageId}`,
          { credentials: "include" },
        );
        const json = (await res.json()) as {
          subStages?: PipelineSubStageRow[];
          error?: string;
        };
        if (!res.ok)
          throw new Error(json.error ?? "Failed to fetch sub-stages.");
        setSubStages(json.subStages ?? []);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Failed to load sub-stages.",
        );
      }
    },
    [toast],
  );

  useEffect(() => {
    if (selectedStage) {
      void loadSubStages(selectedStage.id);
      setSubStageMode("list");
    } else {
      setSubStages([]);
    }
  }, [selectedStage, loadSubStages]);

  // Stage Handlers
  const handleSelectStage = (stage: PipelineStageRow) => {
    setSelectedStage(stage);
  };

  // Keeps `selectedStage` in sync when the currently selected stage is
  // edited or deleted from within the Suspense-wrapped StagesPanel.
  const handleStageEdited = (stage: PipelineStageRow) => {
    setSelectedStage((prev) => (prev?.id === stage.id ? stage : prev));
  };

  const handleStageDeleted = (id: string) => {
    setSelectedStage((prev) => (prev?.id === id ? null : prev));
  };

  // Sub-stage Handlers
  const handleEditSubStage = (sub: PipelineSubStageRow) => {
    setEditingSubStage(sub);
    setSubStageMode("edit");
  };

  const handleSubStageSubmit = async (values: {
    code: string;
    label: string;
    sequence_number: number;
    is_default: boolean;
    is_passed: boolean;
  }) => {
    if (!selectedStage) return;

    setBusy(true);
    const payload = {
      pipeline_stage_id: selectedStage.id,
      ...values,
    };

    try {
      const isEdit = subStageMode === "edit" && editingSubStage;
      const url = isEdit
        ? `/api/admin/pipelines/sub-stages/${editingSubStage.id}`
        : "/api/admin/pipelines/sub-stages";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as {
        subStage?: PipelineSubStageRow;
        error?: string;
      };

      if (!res.ok) throw new Error(json.error ?? "Failed to save sub-stage.");

      if (json.subStage) {
        if (isEdit) {
          toast.success(
            `Sub-stage '${json.subStage.label}' updated successfully.`,
          );
        } else {
          toast.success(
            `Sub-stage '${json.subStage.label}' created successfully.`,
          );
        }
        await loadSubStages(selectedStage.id);
        setSubStageMode("list");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSubStage = async (id: string, label: string) => {
    if (!selectedStage) return;
    if (!confirm(`Are you sure you want to delete sub-stage '${label}'?`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/pipelines/sub-stages/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Failed to delete sub-stage.");
      }

      await loadSubStages(selectedStage.id);
      toast.success(`Sub-stage '${label}' deleted successfully.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete sub-stage.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleReorderSubStages = async (
    updatedSubStages: PipelineSubStageRow[],
  ) => {
    // Optimistic UI update
    setSubStages(updatedSubStages);
    setBusy(true);

    const reorders = updatedSubStages.map((s) => ({
      id: s.id,
      sequence_number: s.sequence_number,
    }));

    try {
      const res = await fetch("/api/admin/pipelines/sub-stages/reorder", {
        method: "POST",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify({ reorders }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Failed to save sub-stages order.");
      }

      toast.success("Sub-stages reordered successfully.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to reorder sub-stages.",
      );
      // Rollback to database state on failure
      if (selectedStage) {
        void loadSubStages(selectedStage.id);
      }
    } finally {
      setBusy(false);
    }
  };

  const nextSeq =
    subStages.length > 0
      ? Math.max(...subStages.map((s) => s.sequence_number)) + 1
      : 1;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Left Column - Stages */}
      <SectionCard
        title="Pipeline Stages"
        description="Workflow configuration stages"
        actions={
          <Button
            size="sm"
            variant="primary"
            className="h-8 px-3 rounded-lg bg-accent text-white font-semibold text-xs transition-colors hover:bg-accent/90"
            onPress={() => stagesPanelRef.current?.startAdd()}
            isDisabled={busy || !stagesPanelReady}
          >
            Add Stage
          </Button>
        }
      >
        <SuspenseErrorBoundary fallback={<StagesErrorFallback />}>
          <Suspense fallback={<StagesPanelSkeleton />}>
            <StagesPanel
              ref={setStagesPanelRef}
              stagesPromise={stagesPromise}
              selectedStage={selectedStage}
              onSelectStage={handleSelectStage}
              onStageEdited={handleStageEdited}
              onStageDeleted={handleStageDeleted}
              busy={busy}
              setBusy={setBusy}
            />
          </Suspense>
        </SuspenseErrorBoundary>
      </SectionCard>

      {/* Right Column - Sub-stages */}
      <SectionCard
        title={selectedStage ? `Sub-stages of ${selectedStage.label}` : "Sub-stages"}
        description={selectedStage ? "Manage workflow substates" : "Select a stage to view its sub-stages"}
        actions={
          selectedStage && subStageMode === "list" ? (
            <Button
              size="sm"
              variant="primary"
              className="h-8 px-3 rounded-lg bg-accent text-white font-semibold text-xs transition-colors hover:bg-accent/90"
              onPress={() => setSubStageMode("add")}
              isDisabled={busy}
            >
              Add Sub-stage
            </Button>
          ) : undefined
        }
      >
        <div className="pt-2">
          {!selectedStage ? (
            <div className="flex h-[350px] flex-col items-center justify-center rounded-xl border border-dashed border-divider text-center p-6 bg-surface-secondary/10">
              <p className="text-sm font-semibold text-foreground">
                No Stage Selected
              </p>
              <p className="mt-1.5 text-xs text-muted">
                Select a pipeline stage on the left to view and manage its sub-stages.
              </p>
            </div>
          ) : subStageMode === "list" ? (
            <SubStageList
              subStages={subStages}
              onEditSubStage={handleEditSubStage}
              onDeleteSubStage={handleDeleteSubStage}
              onReorderSubStages={handleReorderSubStages}
              onAddClick={() => setSubStageMode("add")}
              busy={busy}
            />
          ) : (
            <SubStageForm
              mode={subStageMode === "add" ? "add" : "edit"}
              stageId={selectedStage.id}
              initialValues={editingSubStage}
              defaultSeq={nextSeq}
              existingSubStages={subStages}
              onSubmit={handleSubStageSubmit}
              onCancel={() => setSubStageMode("list")}
              busy={busy}
            />
          )}
        </div>
      </SectionCard>
    </div>
  );
}
