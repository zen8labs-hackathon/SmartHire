"use client";

import dynamic from "next/dynamic";

import type { CandidateDbRow } from "@/lib/candidates/db-row";
import type { StageMapping, SubStage } from "@/lib/pipelines/transition-validator";

const JobPipelineSpreadsheet = dynamic(
  () =>
    import("@/components/admin/jd/job-pipeline-spreadsheet").then(
      (m) => m.JobPipelineSpreadsheet,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-muted">
        <p className="text-sm font-medium">Loading pipeline…</p>
      </div>
    ),
  },
);

type Props = {
  jobDescriptionId: number;
  jobId: string;
  jobTitle: string;
  initialPipelineCandidates: CandidateDbRow[];
  initialPipelineFetchFailed: boolean;
  linkedJobOpeningId: string | null;
  linkedJobOpeningTitle: string | null;
  canEditPipeline: boolean;
  canAddCandidates: boolean;
  stageMappings: StageMapping[];
  subStages: SubStage[];
};

export function JobPipelineSpreadsheetLoader(props: Props) {
  return <JobPipelineSpreadsheet {...props} />;
}
