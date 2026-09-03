import { NextRequest } from "next/server";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { filterViewableJobIds } from "@/lib/authz/can";
import { resolveApplicationStages } from "@/lib/candidates/resolve-application-stage";
import { listApplicationsForCandidate } from "@/lib/db/campaign-applied-list";
import { getPool } from "@/lib/db/config/client";
import { getFileUploadById } from "@/lib/db/upload-history";
import type { ResolvedApplicationStage } from "@/lib/candidates/resolve-application-stage";
import { logApiError } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

/** One row of the "candidate already applied" modal in the upload-history panel. */
export type CandidateApplicationSummary = ResolvedApplicationStage & {
  id: string;
  jobTitle: string;
  jobId: string | null;
  appliedAt: string;
  cvOriginalFilename: string | null;
  cvUploadedAt: string;
};

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getPool();

  const upload = await getFileUploadById(db, id);
  if (!upload) {
    return Response.json({ error: "Upload data not found." }, { status: 404 });
  }
  if (!upload.candidate_id) {
    return Response.json({ applications: [] });
  }

  try {
    const rows = await listApplicationsForCandidate(db, upload.candidate_id);

    const viewableJobIds = await filterViewableJobIds(
      db,
      auth.access,
      rows.map((row) => row.job_id),
    );
    const visibleRows = rows.filter((row) => viewableJobIds.has(row.job_id));

    const resolvedByRow = await resolveApplicationStages(db, visibleRows);

    const applications: CandidateApplicationSummary[] = visibleRows.map(
      (row) => ({
        id: row.id,
        jobTitle: row.job_position ?? "No Job Assigned",
        jobId: row.job_id,
        appliedAt: row.created_at.toISOString(),
        cvOriginalFilename: row.cv_original_filename ?? null,
        cvUploadedAt: row.cv_created_at
          ? row.cv_created_at.toISOString()
          : row.created_at.toISOString(),
        ...resolvedByRow.get(row)!,
      }),
    );

    return Response.json({ candidateId: upload.candidate_id, applications });
  } catch (err) {
    logApiError("Upload-files: candidate applications lookup failed", err, {
      id,
    });
    return Response.json({ error: "Database error" }, { status: 500 });
  }
}
