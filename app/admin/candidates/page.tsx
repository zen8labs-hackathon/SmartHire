import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Candidates | Smart Hire Admin",
  description: "View active candidates, CV uploads, and pipeline statuses.",
};

import { CandidatePipelineDashboardLoader } from "./candidate-pipeline-dashboard-loader";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { CANDIDATES_LIST_DEFAULT_LIMIT } from "@/lib/candidates/candidates-list-query";
import { listCandidatePool } from "@/lib/db/candidates";
import { getPool } from "@/lib/db/config/client";
import type { QueryExecutor } from "@/lib/db/config/client";
import { GroupedCandidateRow } from "@/lib/service/candidate.service";

export type InitialCandidatesData = {
  rows: GroupedCandidateRow[];
  total: number;
  experiencedTotal: number;
};

/**
 * Server-side twin of `candidateService.getGroupedCandidatesList`: reads the
 * same `candidates` pool via `listCandidatePool` (exactly what `GET
 * /api/admin/candidates` serves the client) and shapes each row into
 * `GroupedCandidateRow` (timestamps as ISO strings, matching the JSON the
 * client would otherwise receive).
 */
async function getInitialCandidates(
  db: QueryExecutor,
): Promise<InitialCandidatesData> {
  const result = await listCandidatePool(db, {
    limit: CANDIDATES_LIST_DEFAULT_LIMIT,
    offset: 0,
  });
  return {
    rows: result.rows.map((row) => ({
      ...row,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
    })),
    total: result.total,
    experiencedTotal: result.experiencedTotal,
  };
}

export default async function AdminCandidatesPage() {
  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/candidates");
  if (!access?.isHr) redirect("/admin/jd");

  const candidatesPromise = getInitialCandidates(getPool());

  return (
    <CandidatePipelineDashboardLoader candidatesPromise={candidatesPromise} />
  );
}
