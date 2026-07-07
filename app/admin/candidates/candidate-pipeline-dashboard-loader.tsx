"use client";

import { Suspense } from "react";
import { Alert } from "@heroui/react";
import { SuspenseErrorBoundary } from "@/components/admin/suspense-error-boundary";
import { CandidatePipelineDashboard } from "@/components/admin/candidates/candidate-pipeline-dashboard";
import { DataTableSkeleton } from "@/components/admin/shell/table-system";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { PageHeader } from "@/components/admin/shell/page-header";

function CandidatesErrorFallback() {
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Error</Alert.Title>
        <Alert.Description>
          Could not load candidates. Please refresh.
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

export function CandidatePipelineDashboardLoader({
  candidatesPromise,
}: {
  candidatesPromise: Promise<{ rows: CandidateDbRow[]; total: number }>;
}) {
  return (
    <div className="flex flex-col gap-6 font-sans">
      <PageHeader
        title="Active Candidates"
        description="Search, filter, and screen candidate resume profiles."
      />

      <SuspenseErrorBoundary fallback={<CandidatesErrorFallback />}>
        <Suspense
          fallback={<DataTableSkeleton columnsCount={6} rowsCount={5} />}
        >
          <CandidatePipelineDashboard candidatesPromise={candidatesPromise} />
        </Suspense>
      </SuspenseErrorBoundary>
    </div>
  );
}
