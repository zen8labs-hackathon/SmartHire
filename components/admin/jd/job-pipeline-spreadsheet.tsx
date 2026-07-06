"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import Link from "next/link";

import {
  AddCandidateModal,
  type JdPipelineCampaignOption,
} from "@/components/admin/candidates/add-candidate-modal";
import {
  JobPipelineDataPanel,
  type JobPipelineDataPanelHandle,
} from "@/components/admin/jd/job-pipeline-data-panel";
import { PipelineTableSkeleton } from "@/components/admin/jd/pipeline-table-skeleton";
import { SuspenseErrorBoundary } from "@/components/admin/suspense-error-boundary";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import type { StageMapping, SubStage } from "@/lib/pipelines/transition-validator";

import { Alert, Breadcrumbs, Button } from "@heroui/react";

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

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function UserPlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}

type Props = {
  jobDescriptionId: number;
  jobId: string;
  jobTitle: string;
  linkedJobOpeningId: string | null;
  linkedJobOpeningTitle: string | null;
  canEditPipeline: boolean;
  canAddCandidates: boolean;
  pipelineDataPromise: Promise<{
    rows: CandidateDbRow[];
    fetchFailed: boolean;
    stageMappings: StageMapping[];
    subStages: SubStage[];
  }>;
};

export function JobPipelineSpreadsheet({
  jobDescriptionId,
  jobId,
  jobTitle,
  linkedJobOpeningId,
  linkedJobOpeningTitle,
  canEditPipeline,
  canAddCandidates,
  pipelineDataPromise,
}: Props) {
  const [addCandidatesOpen, setAddCandidatesOpen] = useState(false);
  const pipelinePanelRef = useRef<JobPipelineDataPanelHandle>(null);

  const jdPipelineCampaign: JdPipelineCampaignOption | undefined =
    useMemo(() => {
      if (linkedJobOpeningId && linkedJobOpeningTitle) {
        return {
          jobOpeningId: linkedJobOpeningId,
          title: linkedJobOpeningTitle,
        };
      }
      return "no_opening_linked";
    }, [linkedJobOpeningId, linkedJobOpeningTitle]);

  return (
    <div className="relative flex flex-col gap-6 pb-20">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
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
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canAddCandidates ? (
            <Button
              variant="primary"
              size="sm"
              className="gap-2 bg-gradient-to-br from-[#002542] to-[#1b3b5a]"
              onPress={() => setAddCandidatesOpen(true)}
            >
              <UserPlusIcon className="size-4" />
              Add candidates
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" className="gap-2">
            <DownloadIcon className="size-4" />
            Export to Excel
          </Button>
        </div>
      </header>

      <SuspenseErrorBoundary fallback={<PipelineErrorFallback />}>
        <Suspense fallback={<PipelineTableSkeleton />}>
          <JobPipelineDataPanel
            ref={pipelinePanelRef}
            jobDescriptionId={jobDescriptionId}
            jobId={jobId}
            pipelineDataPromise={pipelineDataPromise}
            canEditPipeline={canEditPipeline}
          />
        </Suspense>
      </SuspenseErrorBoundary>

      {canAddCandidates ? (
        <Button
          variant="primary"
          size="lg"
          className="fixed bottom-8 right-8 z-20 size-14 min-w-0 rounded-full p-0 shadow-lg"
          aria-label="Add candidates to this job"
          onPress={() => setAddCandidatesOpen(true)}
        >
          <UserPlusIcon className="size-6" />
        </Button>
      ) : null}

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
