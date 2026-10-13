import { filterViewableJobIds } from "@/lib/authz/can";
import {
  resolveApplicationStages,
  type ResolvedApplicationStage,
} from "@/lib/candidates/resolve-application-stage";
import { listApplicationsForCandidate } from "@/lib/db/campaign-applied-list";
import { getPool } from "@/lib/db/config/client";
import { logApiError } from "@/lib/logger";
import { loadScopedUploads } from "@/lib/position/cv-upload-actions";
import { guardPositionUpload } from "@/lib/position/cv-upload-guard";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

export type PositionCandidateApplication = ResolvedApplicationStage & {
  id: string;
  jobTitle: string;
  jobId: string | null;
  appliedAt: string;
  cvOriginalFilename: string | null;
  cvUploadedAt: string;
};

/** Every application of the candidate an upload resolved to ("already applied" modal). */
export async function GET(request: Request, ctx: Ctx) {
  const { id, fileId } = await ctx.params;
  const g = await guardPositionUpload(request, id);
  if (!g.ok) return g.response;
  const db = getPool();
  const [upload] = await loadScopedUploads(db, [fileId], g.jobId);
  if (!upload) return Response.json({ error: "Upload not found." }, { status: 404 });
  if (!upload.candidate_id) return Response.json({ applications: [] });
  try {
    const rows = await listApplicationsForCandidate(db, upload.candidate_id);
    const viewable = await filterViewableJobIds(db, g.auth.access, rows.map((r) => r.job_id));
    const visible = rows.filter((r) => viewable.has(r.job_id));
    const resolved = await resolveApplicationStages(db, visible);
    const applications: PositionCandidateApplication[] = visible.map((row) => ({
      id: row.id,
      jobTitle: row.job_position ?? "No Job Assigned",
      jobId: row.job_id,
      appliedAt: row.created_at.toISOString(),
      cvOriginalFilename: row.cv_original_filename ?? null,
      cvUploadedAt: (row.cv_created_at ?? row.created_at).toISOString(),
      ...resolved.get(row)!,
    }));
    return Response.json({ candidateId: upload.candidate_id, applications });
  } catch (err) {
    logApiError("Position CV candidate applications failed", err, { fileId });
    return Response.json({ error: "Database error" }, { status: 500 });
  }
}
