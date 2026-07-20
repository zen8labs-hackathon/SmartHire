import { queryCandidatesList } from "@/lib/candidates/candidates-list-query";
import type { QueryExecutor } from "@/lib/db/config/client";
import type { CampaignAppliedAdminRow } from "@/lib/db/campaign-applied-list";

export type FetchCandidatesForJdResult = {
  rows: CampaignAppliedAdminRow[];
  error: string | null;
};

/**
 * Loads every application tied to this job. Mirrors
 * `GET /api/admin/candidates?jobId=…&all=true`.
 */
export async function fetchCandidatesForJobDescription(
  db: QueryExecutor,
  jobId: string,
): Promise<FetchCandidatesForJdResult> {
  const { candidates, error } = await queryCandidatesList(db, {
    jobId,
    all: true,
  });

  return { rows: candidates, error };
}
