"use client";

import dynamic from "next/dynamic";

import type { CandidateDbRow } from "@/lib/candidates/db-row";

const CandidatePipelineKanban = dynamic(
  () =>
    import("@/components/admin/candidates/candidate-pipeline-kanban").then(
      (m) => m.CandidatePipelineKanban,
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

export function CandidatePipelineKanbanLoader({
  initialRows,
}: {
  initialRows?: CandidateDbRow[];
}) {
  return <CandidatePipelineKanban initialRows={initialRows} />;
}
