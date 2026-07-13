"use client";

import { Suspense, useRef, useState } from "react";
import Link from "next/link";

import { AddCandidateModal } from "@/components/admin/candidates/add-candidate-modal";
import {
  JobPipelineDataPanel,
  type JobPipelineDataPanelHandle,
} from "@/components/admin/jd/job-pipeline-data-panel";
import { PipelineTableSkeleton } from "@/components/admin/jd/pipeline-table-skeleton";
import { SuspenseErrorBoundary } from "@/components/admin/suspense-error-boundary";
import type { JdPipelineApplicationRow } from "@/lib/candidates/campaign-applied-table-row";
import type { StageMapping, SubStage } from "@/lib/pipelines/transition-validator";

import { Alert, Breadcrumbs } from "@heroui/react";

function PipelineErrorFallback() {
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Error</Alert.Title>
        <Alert.Description>
          Could not load the pipeline. Please refresh.
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

type Props = {
  jobId: string;
  jobTitle: string;
  canEditPipeline: boolean;
  canAddCandidates: boolean;
  pipelineDataPromise: Promise<{
    rows: JdPipelineApplicationRow[];
    fetchFailed: boolean;
    stageMappings: StageMapping[];
    subStages: SubStage[];
  }>;
};

export function JobPipelineSpreadsheet({
  jobId,
  jobTitle,
  canEditPipeline,
  canAddCandidates,
  pipelineDataPromise,
}: Props) {
  const [addCandidatesOpen, setAddCandidatesOpen] = useState(false);
  const pipelinePanelRef = useRef<JobPipelineDataPanelHandle>(null);

  // DB7X2K merged `job_openings` into `jobs` -- every job is its own single
  // campaign now (see the JD create-flow's "no Draft status by design"
  // decision), so there's no more "no opening linked" case to represent.
  const jdPipelineCampaign = { jobOpeningId: jobId, title: jobTitle };

  return (
    <div className="relative flex flex-col gap-6">
      <header className="space-y-2">
        <Breadcrumbs className="text-xs text-muted">
          <Breadcrumbs.Item href="/admin/jd">Jobs list</Breadcrumbs.Item>
          <Breadcrumbs.Item>{jobTitle}</Breadcrumbs.Item>
        </Breadcrumbs>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {jobTitle} pipeline
        </h1>
        <p className="max-w-2xl text-sm text-muted">
          Filter and sort by CV upload time.
          {canEditPipeline
            ? " Use the pipeline column to change status per candidate, or bulk-move New → Interview (no date required). Set interview and onboarding times from the Schedule column when applicable."
            : " Pipeline status and schedule are managed by HR; you can review candidates, download CVs, and add interview notes from each row."}
        </p>
      </header>

      <SuspenseErrorBoundary fallback={<PipelineErrorFallback />}>
        <Suspense fallback={<PipelineTableSkeleton />}>
          <JobPipelineDataPanel
            ref={pipelinePanelRef}
            jobId={jobId}
            pipelineDataPromise={pipelineDataPromise}
            canEditPipeline={canEditPipeline}
            canAddCandidates={canAddCandidates}
            onAddCandidates={() => setAddCandidatesOpen(true)}
          />
        </Suspense>
      </SuspenseErrorBoundary>

      {canAddCandidates ? (
        <AddCandidateModal
          open={addCandidatesOpen}
          onOpenChange={setAddCandidatesOpen}
          jdPipelineCampaign={jdPipelineCampaign}
          onCandidatesChanged={() => pipelinePanelRef.current?.refetch(true)}
          onDuplicateMergedToExisting={() =>
            pipelinePanelRef.current?.refetch(true)
          }
        />
      ) : null}

      <div className="flex justify-center">
        <Link
          href="/admin/jd"
          className="inline-flex items-center gap-2 rounded-xl border border-divider bg-surface-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-tertiary"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
            <path d="M19 12H5"/>
            <path d="M12 19l-7-7 7-7"/>
          </svg>
          Back to Jobs list
        </Link>
      </div>
    </div>
  );
}
