"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Card } from "@heroui/react";

import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";
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

function StagesErrorFallback() {
  return (
    <Card.Content className="p-6">
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Error</Alert.Title>
          <Alert.Description>
            Could not load pipeline stages. Please refresh.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    </Card.Content>
  );
}

type PipelineManagerProps = {
  stagesPromise: Promise<PipelineStageRow[]>;
};

export function PipelineManager({ stagesPromise }: PipelineManagerProps) {
  const supabase = createClient();
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

  // Headers helper
  const authHeaders = useCallback(async () => {
    const h = await getSessionAuthorizationHeaders(supabase);
    return { "Content-Type": "application/json", ...h };
  }, [supabase]);

  // Load sub-stages for selected stage
  const loadSubStages = useCallback(
    async (stageId: string) => {
      try {
        const h = await authHeaders();
        const res = await fetch(
          `/api/admin/pipelines/sub-stages?stageId=${stageId}`,
          {
            credentials: "include",
            headers: h,
          },
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
    [authHeaders, toast],
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

      const h = await authHeaders();
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: h,
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
      const h = await authHeaders();
      const res = await fetch(`/api/admin/pipelines/sub-stages/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: h,
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
      const h = await authHeaders();
      const res = await fetch("/api/admin/pipelines/sub-stages/reorder", {
        method: "POST",
        credentials: "include",
        headers: h,
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
      <Card className="min-h-[500px]">
        <Card.Header className="flex items-center justify-between border-b border-divider px-6 py-4">
          <div className="flex items-center justify-between w-full">
            <div>
              <Card.Title className="text-lg">Pipeline Stages</Card.Title>
              <Card.Description>
                Workflow configuration stages
              </Card.Description>
            </div>
            <Button
              size="sm"
              variant="primary"
              onPress={() => stagesPanelRef.current?.startAdd()}
              isDisabled={busy || !stagesPanelReady}
            >
              Add Stage
            </Button>
          </div>
        </Card.Header>

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
      </Card>

      {/* Right Column - Sub-stages */}
      <Card className="min-h-[500px]">
        <Card.Header className="flex items-center justify-between border-b border-divider px-6 py-4">
          <div className="flex items-center justify-between w-full">
            <div>
              <Card.Title className="text-lg">
                {selectedStage
                  ? `Sub-stages of ${selectedStage.label}`
                  : "Sub-stages"}
              </Card.Title>
              <Card.Description>
                {selectedStage
                  ? "Manage workflow substates"
                  : "Select a stage to view its sub-stages"}
              </Card.Description>
            </div>
            {selectedStage && subStageMode === "list" && (
              <Button
                size="sm"
                variant="primary"
                onPress={() => setSubStageMode("add")}
                isDisabled={busy}
              >
                Add Sub-stage
              </Button>
            )}
          </div>
        </Card.Header>

        <Card.Content className="p-6">
          {!selectedStage ? (
            <div className="flex h-[350px] flex-col items-center justify-center rounded-xl border border-dashed border-divider text-center p-6">
              <p className="text-sm font-medium text-foreground">
                No Stage Selected
              </p>
              <p className="mt-1 text-xs text-muted">
                Select a pipeline stage on the left to view and manage its
                sub-stages.
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
              onSubmit={handleSubStageSubmit}
              onCancel={() => setSubStageMode("list")}
              busy={busy}
            />
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
