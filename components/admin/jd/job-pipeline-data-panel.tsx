"use client";

import {
  forwardRef,
  use,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";

import { JdAppliedCandidatesPipeline } from "@/components/admin/jd/jd-applied-candidates-pipeline";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import type { StageMapping, SubStage } from "@/lib/pipelines/transition-validator";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";

import { Card } from "@heroui/react";

export type JobPipelineDataPanelHandle = {
  refetch: (silent?: boolean) => void;
};

type Props = {
  jobDescriptionId: number;
  jobId: string;
  pipelineDataPromise: Promise<{
    rows: CandidateDbRow[];
    fetchFailed: boolean;
    stageMappings: StageMapping[];
    subStages: SubStage[];
  }>;
  canEditPipeline: boolean;
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
  { jobDescriptionId, jobId, pipelineDataPromise, canEditPipeline },
  ref,
) {
  const { rows, fetchFailed, stageMappings, subStages } =
    use(pipelineDataPromise);
  const supabase = useMemo(() => createClient(), []);
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
        const h = await getSessionAuthorizationHeaders(supabase);
        const res = await fetch(
          `/api/admin/candidates?jobDescriptionId=${jobDescriptionId}&all=true&contactFields=true`,
          { credentials: "include", headers: { ...h } },
        );
        if (!res.ok) {
          if (!silent) setPipelineLoadState("error");
          return;
        }
        const json = (await res.json()) as { candidates?: CandidateDbRow[] };
        setPipelineRows(json.candidates ?? []);
        setPipelineLoadState("ok");
      } catch {
        if (!silent) setPipelineLoadState("error");
      }
    },
    [jobDescriptionId, supabase],
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
          jobDescriptionId={jobDescriptionId}
          jobId={jobId}
          dbRows={pipelineRows}
          loadState={pipelineLoadState}
          onRefetch={(silent) => void refetchPipeline(silent)}
          canEditPipeline={canEditPipeline}
          stageMappings={stageMappings}
          subStages={subStages}
        />
      </Card.Content>
    </Card>
  );
});
