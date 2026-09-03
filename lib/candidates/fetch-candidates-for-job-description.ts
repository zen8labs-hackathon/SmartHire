import { queryCandidatesList } from "@/lib/candidates/candidates-list-query";
import type { QueryExecutor } from "@/lib/db/config/client";
import type { CampaignAppliedAdminRow } from "@/lib/db/campaign-applied-list";

export type FetchCandidatesForJdResult = {
  rows: CampaignAppliedAdminRow[];
  error: string | null;
};

const INITIAL_PAGE_SIZE = 10;

export async function fetchCandidatesForJobDescription(
  db: QueryExecutor,
  jobId: string,
): Promise<FetchCandidatesForJdResult> {
  const { candidates, error } = await queryCandidatesList(db, {
    jobId,
    limit: INITIAL_PAGE_SIZE,
    offset: 0,
  });

  return { rows: candidates, error };
}
