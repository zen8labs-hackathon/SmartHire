"use client";

import dynamic from "next/dynamic";

import type { CandidateDbRow } from "@/lib/candidates/db-row";

const CandidatePipelineDashboard = dynamic(
  () =>
    import("@/components/admin/candidates/candidate-pipeline-dashboard").then(
      (m) => m.CandidatePipelineDashboard,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-muted">
        <p className="text-sm font-medium">Loading candidates…</p>
      </div>
    ),
  },
);

export function CandidatePipelineDashboardLoader({
  initialRows,
}: {
  initialRows?: CandidateDbRow[];
}) {
  return <CandidatePipelineDashboard initialRows={initialRows} />;
}
