import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { canViewSalary } from "@/lib/authz/can";
import { requirePermissionForApplication } from "@/lib/authz/require-permission";
import { redactAdminRowSalary } from "@/lib/authz/redact-salary";
import { requireJobViewAccess } from "@/lib/authz/require-job-view";
import {
  getCampaignAppliedAdminRowById,
} from "@/lib/db/campaign-applied-list";
import {
  softDeleteCampaignApplied,
  updateCampaignApplied,
} from "@/lib/db/campaign-applied";
import { softDeleteCandidate } from "@/lib/db/candidates";
import { getPool, withTransaction } from "@/lib/db/config/client";
import {
  fetchJobPipelineConfig,
  validateAndBuildPipelineTransition,
} from "@/lib/pipelines/transition-validator";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const patchBodySchema = z.object({
  current_job_stage_mapping_id: z.string().uuid(),
  current_sub_state_id: z.string().uuid(),
});

type RouteContext = { params: Promise<{ id: string }> };

/** Full application row (candidate + active CV + pipeline position) for drawer / detail hydration. */
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const db = getPool();
  const row = await getCampaignAppliedAdminRowById(db, candidateId);
  if (!row) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const jobAccess = await requireJobViewAccess(auth.access, row.job_id);
  if (!jobAccess.ok) return jobAccess.response;

  const viewSalary = await canViewSalary(db, auth.access, row.job_id);
  return Response.json({ candidate: redactAdminRowSalary(row, viewSalary) });
}

/**
 * Updates the application's pipeline stage/sub-stage, with the same
 * transition rules as PATCH /api/admin/candidates/pipeline.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const manageAccess = await requirePermissionForApplication(
    auth.access,
    "candidate.manage",
    candidateId,
  );
  if (!manageAccess.ok) return manageAccess.response;
  const existing = manageAccess.application;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const { current_job_stage_mapping_id, current_sub_state_id } = parsed.data;

  const db = getPool();

  const { stageMappings, subStages } = await fetchJobPipelineConfig(
    db,
    existing.job_id,
  );
  if (stageMappings.length === 0) {
    return Response.json(
      { error: "Could not load pipeline configuration for this job." },
      { status: 400 },
    );
  }

  const result = validateAndBuildPipelineTransition(
    existing,
    {
      toStageMappingId: current_job_stage_mapping_id,
      toSubStateId: current_sub_state_id,
    },
    stageMappings,
    subStages,
  );
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  await updateCampaignApplied(db, candidateId, {
    currentJobStageMappingId: result.patch.currentJobStageMappingId,
    currentSubStateId: result.patch.currentSubStateId,
    hiredAt: result.patch.hiredAt,
  });

  const row = await getCampaignAppliedAdminRowById(db, candidateId);
  if (!row) {
    return Response.json(
      { error: "Could not load updated candidate." },
      { status: 500 },
    );
  }

  return Response.json({ candidate: row });
}

/**
 * Soft-deletes the application. Unlike the old hard-delete, this does not
 * remove the CV file from storage -- `cv_detail_versions` rows (and their
 * storage paths) are kept for history, matching the rest of this schema's
 * soft-delete design (`deleted_at` everywhere, no destructive deletes).
 *
 * Also soft-deletes the person (`candidates`) row when this was their last
 * live application. Otherwise the person row lingers with `deleted_at NULL`,
 * invisible to dedupe lookups (which only join through live applications)
 * but still occupying `candidates_email_unique_idx` / `_phone_unique_idx` --
 * any future upload reusing that email/phone then fails the unique
 * constraint instead of surfacing the duplicate-candidate flow.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const manageAccess = await requirePermissionForApplication(
    auth.access,
    "candidate.manage",
    candidateId,
  );
  if (!manageAccess.ok) return manageAccess.response;

  const deleted = await withTransaction(async (tx) => {
    const row = await softDeleteCampaignApplied(tx, candidateId);
    if (!row) return null;

    const { rows: remaining } = await tx.query<{ count: string }>(
      `SELECT count(*)::int AS count FROM campaign_applied WHERE candidate_id = $1 AND deleted_at IS NULL`,
      [row.candidate_id],
    );
    if (Number(remaining[0]?.count ?? 0) === 0) {
      await softDeleteCandidate(tx, row.candidate_id);
    }
    return row;
  });
  if (!deleted) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
