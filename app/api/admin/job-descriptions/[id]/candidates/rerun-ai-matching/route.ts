import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requireJobViewAccess, requirePermissionOnJob } from "@/lib/authz";
import { listCandidatesByIds } from "@/lib/db/candidates";
import { listCampaignAppliedByCandidateIdsAndJob } from "@/lib/db/campaign-applied";
import { getPool } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";
import { fileUploadQueue } from "@/lib/queue/file-upload.queue";
import { logApiError } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1).max(500),
});

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: jobId } = await params;
  if (!jobId) {
    return Response.json(
      { error: "Job id is missing from request" },
      { status: 400 },
    );
  }

  const jobAccess = await requireJobViewAccess(auth.access, jobId);
  if (!jobAccess.ok) return jobAccess.response;

  // Rerunning JD-match mutates every matching application's score/status,
  // so this needs manage access, not just view access.
  const manageAccess = await requirePermissionOnJob(
    auth.access,
    "candidate.manage",
    jobId,
  );
  if (!manageAccess.ok) return manageAccess.response;

  const db = getPool();
  const job = await getJobById(db, jobId);
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const candidateIds = [...new Set(parsed.data.candidateIds)];

  // 1. Candidate existence.
  const existingCandidates = await listCandidatesByIds(db, candidateIds);
  const existingCandidateIds = new Set(existingCandidates.map((c) => c.id));
  const errorIds = candidateIds.filter((id) => !existingCandidateIds.has(id));

  // 2. campaign_applied for this job + a non-null active_cv_version_id.
  const applications = await listCampaignAppliedByCandidateIdsAndJob(
    db,
    [...existingCandidateIds],
    jobId,
  );
  const applicationByCandidateId = new Map(
    applications.map((a) => [a.candidate_id, a]),
  );

  const candidates: {
    candidateId: string;
    campaignAppliedId: string;
    cvDetailVersionId: string;
  }[] = [];
  for (const candidateId of existingCandidateIds) {
    const application = applicationByCandidateId.get(candidateId);
    if (!application || !application.active_cv_version_id) {
      errorIds.push(candidateId);
      continue;
    }
    candidates.push({
      candidateId,
      campaignAppliedId: application.id,
      cvDetailVersionId: application.active_cv_version_id,
    });
  }

  if (candidates.length > 0) {
    try {
      await fileUploadQueue.addBulk(
        candidates.map((c) => ({
          name: "rerun-ai-matching",
          data: {
            cvDetailVersionId: c.cvDetailVersionId,
            userId: auth.userId,
            jobId,
            candidateId: c.candidateId,
          },
          opts: {
            deduplication: { id: `rerun-ai-matching-${c.campaignAppliedId}` },
            priority: 2,
          },
        })),
      );
    } catch (e) {
      logApiError("Rerun AI matching enqueue: queue add failed", e, {
        jobId,
      });
      return Response.json(
        { error: "Failed to enqueue candidates for AI matching." },
        { status: 500 },
      );
    }
  }

  return Response.json({ candidates, errorIds });
}
