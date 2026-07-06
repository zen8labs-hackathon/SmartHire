"use client";

import { forwardRef, use, useCallback, useImperativeHandle, useState } from "react";
import { Card } from "@heroui/react";

import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";
import { useToast } from "@/components/admin/toast-provider";
import type { PipelineStageRow } from "@/lib/pipelines/schemas";

import { StageList } from "./stage-list";
import { StageForm } from "./stage-form";

export type StagesPanelHandle = {
  /** Opens the blank "Add Stage" form, resetting out of edit mode if needed. */
  startAdd: () => void;
};

type StagesPanelProps = {
  stagesPromise: Promise<PipelineStageRow[]>;
  selectedStage: PipelineStageRow | null;
  onSelectStage: (stage: PipelineStageRow) => void;
  /** Lets the parent keep `selectedStage` in sync when the selected stage is edited. */
  onStageEdited: (stage: PipelineStageRow) => void;
  /** Lets the parent clear `selectedStage` when the selected stage is deleted. */
  onStageDeleted: (id: string) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
};

/**
 * Owns the Pipeline Stages list/form state so that loading, adding, editing,
 * and deleting stages only re-renders this subtree (seeded from the
 * server-provided `stagesPromise`), not the whole `/admin/pipelines` page.
 *
 * The Card.Header (title + "Add Stage" button) stays in `PipelineManager`,
 * outside the Suspense boundary this component is wrapped in, so it renders
 * immediately. `startAdd` is exposed via `useImperativeHandle` so that header
 * button can still open the add form once this panel has mounted.
 */
export const StagesPanel = forwardRef<StagesPanelHandle, StagesPanelProps>(
  function StagesPanel(
    {
      stagesPromise,
      selectedStage,
      onSelectStage,
      onStageEdited,
      onStageDeleted,
      busy,
      setBusy,
    },
    ref,
  ) {
    const initialStages = use(stagesPromise);
    const supabase = createClient();
    const toast = useToast();

    const [stages, setStages] = useState<PipelineStageRow[]>(initialStages);
    const [stageMode, setStageMode] = useState<"list" | "add" | "edit">(
      "list",
    );
    const [editingStage, setEditingStage] = useState<PipelineStageRow | null>(
      null,
    );

    const authHeaders = useCallback(async () => {
      const h = await getSessionAuthorizationHeaders(supabase);
      return { "Content-Type": "application/json", ...h };
    }, [supabase]);

    useImperativeHandle(
      ref,
      () => ({
        startAdd: () => {
          setEditingStage(null);
          setStageMode("add");
        },
      }),
      [],
    );

    const handleEditStage = (stage: PipelineStageRow) => {
      setEditingStage(stage);
      setStageMode("edit");
    };

    const handleStageSubmit = async (values: {
      code: string;
      label: string;
      desc: string | null;
      color: string | null;
    }) => {
      setBusy(true);
      try {
        const isEdit = stageMode === "edit" && editingStage;
        const url = isEdit
          ? `/api/admin/pipelines/${editingStage.id}`
          : "/api/admin/pipelines";
        const method = isEdit ? "PATCH" : "POST";

        const h = await authHeaders();
        const res = await fetch(url, {
          method,
          credentials: "include",
          headers: h,
          body: JSON.stringify(values),
        });

        const json = (await res.json()) as {
          stage?: PipelineStageRow;
          error?: string;
        };

        if (!res.ok)
          throw new Error(json.error ?? "Failed to save pipeline stage.");

        if (json.stage) {
          if (isEdit) {
            setStages((prev) =>
              prev.map((s) => (s.id === json.stage!.id ? json.stage! : s)),
            );
            onStageEdited(json.stage);
            toast.success(`Stage '${json.stage.label}' updated successfully.`);
          } else {
            setStages((prev) => [...prev, json.stage!]);
            toast.success(`Stage '${json.stage.label}' created successfully.`);
          }
          setStageMode("list");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "An error occurred.");
      } finally {
        setBusy(false);
      }
    };

    const handleDeleteStage = async (id: string, label: string) => {
      if (
        !confirm(
          `Are you sure you want to delete stage '${label}'? This will soft delete the stage.`,
        )
      ) {
        return;
      }
      setBusy(true);
      try {
        const h = await authHeaders();
        const res = await fetch(`/api/admin/pipelines/${id}`, {
          method: "DELETE",
          credentials: "include",
          headers: h,
        });

        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          throw new Error(json.error ?? "Failed to delete stage.");
        }

        setStages((prev) => prev.filter((s) => s.id !== id));
        onStageDeleted(id);
        toast.success(`Stage '${label}' deleted successfully.`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to delete stage.",
        );
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="pt-2">
        {stageMode === "list" ? (
          <StageList
            stages={stages}
            selectedStage={selectedStage}
            onSelectStage={onSelectStage}
            onEditStage={handleEditStage}
            onDeleteStage={handleDeleteStage}
            busy={busy}
          />
        ) : (
          <StageForm
            mode={stageMode === "add" ? "add" : "edit"}
            initialValues={editingStage}
            onSubmit={handleStageSubmit}
            onCancel={() => setStageMode("list")}
            busy={busy}
          />
        )}
      </div>
    );
  },
);
