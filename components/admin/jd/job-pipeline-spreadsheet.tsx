"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { UploadCvModal } from "@/components/admin/jd/upload-cv-modal";
import { UploadHistoryPanel } from "@/components/admin/jd/upload-history-panel";
import {
  JobPipelineDataPanel,
  type JobPipelineDataPanelHandle,
} from "@/components/admin/jd/job-pipeline-data-panel";
import { PipelineTableSkeleton } from "@/components/admin/jd/pipeline-table-skeleton";
import { SuspenseErrorBoundary } from "@/components/admin/suspense-error-boundary";
import { JdFilePreviewModal } from "@/components/admin/jd/jd-file-preview-modal";
import type { JdPipelineApplicationRow } from "@/lib/candidates/campaign-applied-table-row";
import type {
  StageMapping,
  SubStage,
} from "@/lib/pipelines/transition-validator";

import { FileText } from "lucide-react";
import { Alert, Breadcrumbs, Tabs, useOverlayState } from "@heroui/react";

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
  hasJdSourceFile: boolean;
  canEditPipeline: boolean;
  canAddCandidates: boolean;
  pipelineDataPromise: Promise<{
    rows: JdPipelineApplicationRow[];
    fetchFailed: boolean;
    stageMappings: StageMapping[];
    subStages: SubStage[];
  }>;
};

export function JobPipelineSpreadsheet(props: Props) {
  return (
    <Suspense fallback={<PipelineTableSkeleton />}>
      <JobPipelineSpreadsheetContent {...props} />
    </Suspense>
  );
}

function JobPipelineSpreadsheetContent({
  jobId,
  jobTitle,
  hasJdSourceFile,
  canEditPipeline,
  canAddCandidates,
  pipelineDataPromise,
}: Props) {
  const [addCandidatesOpen, setAddCandidatesOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"candidates" | "uploads">(
    searchParams.get("tab") === "uploads" ? "uploads" : "candidates",
  );
  useEffect(() => {
    if (searchParams.get("tab") === "uploads") setActiveTab("uploads");
  }, [searchParams]);

  // Keep `?tab=` in sync so the tab survives a refresh/shared link -- the
  // "candidates" tab is the default, so it's left out of the URL entirely.
  const selectTab = useCallback(
    (next: "candidates" | "uploads") => {
      setActiveTab(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "uploads") params.set("tab", "uploads");
      else params.delete("tab");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const pipelinePanelRef = useRef<JobPipelineDataPanelHandle>(null);
  const jdFileModal = useOverlayState();

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
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {jobTitle} pipeline
          </h1>
          {hasJdSourceFile ? (
            <button
              type="button"
              onClick={jdFileModal.open}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-divider bg-surface-secondary px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-surface-tertiary"
            >
              <FileText className="size-3.5" />
              View JD file
            </button>
          ) : null}
        </div>
        <p className="max-w-2xl text-sm text-muted">
          Filter and sort by CV upload time.
          {canEditPipeline
            ? " Use the pipeline column to change status per candidate, or bulk-move New → Interview (no date required). Set interview and onboarding times from the Schedule column when applicable."
            : " Pipeline status and schedule are managed by HR; you can review candidates, download CVs, and add interview notes from each row."}
        </p>
      </header>

      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => selectTab(key as "candidates" | "uploads")}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Job pipeline sections">
            <Tabs.Tab id="candidates">
              <Tabs.Indicator />
              Candidates
            </Tabs.Tab>
            <Tabs.Tab id="uploads">
              <Tabs.Indicator />
              Uploaded files
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        {/* Candidates panel stays mounted (shouldForceMount) so switching
            tabs doesn't discard its live refetch state or unmount the ref
            the Add Candidates modal refetches through. Uploads panel is
            left at the default lazy mount/unmount -- each visit should
            fetch fresh rows and (re)start polling, same as the modal this
            replaced did on open/close. */}
        <Tabs.Panel
          id="candidates"
          shouldForceMount
          className={activeTab === "candidates" ? "" : "hidden"}
        >
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
        </Tabs.Panel>

        <Tabs.Panel id="uploads">
          <UploadHistoryPanel jobId={jobId} jobTitle={jobTitle} />
        </Tabs.Panel>
      </Tabs>

      {canAddCandidates ? (
        <UploadCvModal
          open={addCandidatesOpen}
          onOpenChange={(open) => {
            setAddCandidatesOpen(open);
            // Uploaded files are processed asynchronously by the file-upload
            // worker, not polled by this modal -- always resync on close so
            // the pipeline table doesn't go stale until a manual refresh.
            if (!open) pipelinePanelRef.current?.refetch(true);
          }}
          jobId={jdPipelineCampaign.jobOpeningId}
          jobTitle={jdPipelineCampaign.title}
          onUploaded={() => pipelinePanelRef.current?.refetch(true)}
        />
      ) : null}

      <div className="flex justify-center">
        <Link
          href="/admin/jd"
          className="inline-flex items-center gap-2 rounded-xl border border-divider bg-surface-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-tertiary"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
            aria-hidden
          >
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back to Jobs list
        </Link>
      </div>

      <JdFilePreviewModal
        isOpen={jdFileModal.isOpen}
        onOpenChange={jdFileModal.setOpen}
        jobId={hasJdSourceFile ? jobId : null}
      />
    </div>
  );
}
