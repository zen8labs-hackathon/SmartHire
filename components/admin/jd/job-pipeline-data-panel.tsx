"use client";

import {
  forwardRef,
  use,
  useCallback,
  useImperativeHandle,
  useState,
} from "react";

import { JdAppliedCandidatesPipeline } from "@/components/admin/jd/jd-applied-candidates-pipeline";
import type { JdPipelineApplicationRow } from "@/lib/candidates/campaign-applied-table-row";
import type {
  StageMapping,
  SubStage,
} from "@/lib/pipelines/transition-validator";

import { Card } from "@heroui/react";

export type JobPipelineDataPanelHandle = {
  refetch: (silent?: boolean) => void;
};

type Props = {
  jobId: string;
  pipelineDataPromise: Promise<{
    rows: JdPipelineApplicationRow[];
    fetchFailed: boolean;
    stageMappings: StageMapping[];
    subStages: SubStage[];
  }>;
  canEditPipeline: boolean;
  canAddCandidates?: boolean;
  onAddCandidates?: () => void;
};

/**
 * Owns the pipeline rows/loading state so that refetching candidate data
 * (e.g. after an inline status change) only re-renders this subtree, not
 * the whole pipeline page (header, breadcrumbs, add-candidate button, etc).
 */
export const JobPipelineDataPanel = forwardRef<
  JobPipelineDataPanelHandle,
  Props
>(function JobPipelineDataPanel(
  {
    jobId,
    pipelineDataPromise,
    canEditPipeline,
    canAddCandidates,
    onAddCandidates,
  },
  ref,
) {
  const { rows, fetchFailed, stageMappings, subStages } =
    use(pipelineDataPromise);
  const [pipelineRows, setPipelineRows] = useState(rows);
  const [pipelineLoadState, setPipelineLoadState] = useState<
    "idle" | "loading" | "error" | "ok"
  >(() => (fetchFailed ? "error" : "ok"));

  const refetchPipeline = useCallback(
    async (silent = false) => {
      if (!silent) {
        setPipelineLoadState("loading");
      }
      try {
        const res = await fetch(
          `/api/admin/candidates?jobId=${jobId}&all=true`,
          { credentials: "include" },
        );
        if (!res.ok) {
          if (!silent) setPipelineLoadState("error");
          return;
        }
        const json = (await res.json()) as {
          candidates?: JdPipelineApplicationRow[];
        };
        setPipelineRows(json.candidates ?? []);
        setPipelineLoadState("ok");
      } catch {
        if (!silent) setPipelineLoadState("error");
      }
    },
    [jobId],
  );

  useImperativeHandle(
    ref,
    () => ({
      refetch: (silent?: boolean) => void refetchPipeline(silent),
    }),
    [refetchPipeline],
  );

  return (
    <Card>
      <Card.Content className="p-4 sm:p-6">
        <JdAppliedCandidatesPipeline
          jobId={jobId}
          dbRows={pipelineRows}
          loadState={pipelineLoadState}
          onRefetch={(silent) => void refetchPipeline(silent)}
          canEditPipeline={canEditPipeline}
          stageMappings={stageMappings}
          subStages={subStages}
          canAddCandidates={canAddCandidates}
          onAddCandidates={onAddCandidates}
        />
      </Card.Content>
    </Card>
  );
});
