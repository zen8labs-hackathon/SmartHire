import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Candidates | Smart Hire Admin",
  description: "View active candidates, CV uploads, and pipeline statuses.",
};

import { CandidatePipelineDashboardLoader } from "./candidate-pipeline-dashboard-loader";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { queryDedupedCandidatesList } from "@/lib/candidates/candidates-dedup";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { getPool } from "@/lib/db/config/client";
import type { QueryExecutor } from "@/lib/db/config/client";

export type InitialCandidatesData = {
  rows: CandidateDbRow[];
  total: number;
};

// queryDedupedCandidatesList never rejects (it resolves with `error`
// populated), so this helper throws explicitly. That gives `use()` a real
// rejection to propagate to the SuspenseErrorBoundary inside
// CandidatePipelineDashboardLoader instead of the table silently rendering
// with an empty list.
async function getInitialCandidates(
  db: QueryExecutor,
): Promise<InitialCandidatesData> {
  const result = await queryDedupedCandidatesList(db, {
    limit: 10,
    offset: 0,
  });
  if (result.error) throw new Error(result.error);
  return { rows: result.people, total: result.pagination.total };
}

export default async function AdminCandidatesPage() {
  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/candidates");
  if (!access?.isHr) redirect("/admin/jd");

  // Kick off the candidates query but don't await it here, so the static
  // header + Add Candidate button render immediately. The Suspense boundary
  // inside CandidatePipelineDashboardLoader only gates the filters+table
  // region, which is the part that actually needs the data.
  const candidatesPromise = getInitialCandidates(getPool());

  return (
    <CandidatePipelineDashboardLoader candidatesPromise={candidatesPromise} />
  );
}
