"use client";

import { Suspense, useCallback, useRef, useState } from "react";

import { Alert, Button } from "@heroui/react";

import { SuspenseErrorBoundary } from "@/components/admin/suspense-error-boundary";
import {
  CandidatePipelineDashboard,
  type CandidatePipelineDashboardHandle,
} from "@/components/admin/candidates/candidate-pipeline-dashboard";
import { CandidateTableSkeleton } from "@/components/admin/candidates/candidate-table-skeleton";
import type { CandidateDbRow } from "@/lib/candidates/db-row";

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
  // Imperative handle to trigger "Add Candidate" from the header, which
  // stays outside the Suspense boundary wrapping CandidatePipelineDashboard.
  const dashboardRef = useRef<CandidatePipelineDashboardHandle | null>(null);
  const [dashboardReady, setDashboardReady] = useState(false);
  const setDashboardRef = useCallback(
    (handle: CandidatePipelineDashboardHandle | null) => {
      dashboardRef.current = handle;
      setDashboardReady(handle !== null);
    },
    [],
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Smart Hire Suite
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Active Talent Pool
          </h1>
        </div>
        <Button
          variant="primary"
          className="bg-gradient-to-br from-[#002542] to-[#1b3b5a] shadow-sm"
          onPress={() => dashboardRef.current?.openAddModal()}
          isDisabled={!dashboardReady}
        >
          <span className="text-lg leading-none">+</span>
          Add Candidate
        </Button>
      </div>

      <SuspenseErrorBoundary fallback={<CandidatesErrorFallback />}>
        <Suspense fallback={<CandidateTableSkeleton />}>
          <CandidatePipelineDashboard
            ref={setDashboardRef}
            candidatesPromise={candidatesPromise}
          />
        </Suspense>
      </SuspenseErrorBoundary>
    </div>
  );
}
