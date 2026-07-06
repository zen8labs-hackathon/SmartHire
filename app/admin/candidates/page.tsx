import { redirect } from "next/navigation";

import { CandidatePipelineDashboardLoader } from "./candidate-pipeline-dashboard-loader";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { queryDedupedCandidatesList } from "@/lib/candidates/candidates-dedup";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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
  supabase: SupabaseServerClient,
): Promise<InitialCandidatesData> {
  const result = await queryDedupedCandidatesList(supabase, {
    limit: 50,
    offset: 0,
  });
  if (result.error) throw new Error(result.error);
  return { rows: result.people, total: result.pagination.total };
}

export default async function AdminCandidatesPage() {
  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/candidates");
  if (!access?.isHr) redirect("/admin/jd");

  const supabase = await createClient();

  // Kick off the candidates query but don't await it here, so the static
  // header + Add Candidate button render immediately. The Suspense boundary
  // inside CandidatePipelineDashboardLoader only gates the filters+table
  // region, which is the part that actually needs the data.
  const candidatesPromise = getInitialCandidates(supabase);

  return (
    <CandidatePipelineDashboardLoader candidatesPromise={candidatesPromise} />
  );
}
