import { guardLegacyJob } from "@/lib/migration/legacy-flow-guard";
import { requireUserForRequest } from "@/lib/admin/require-staff-request";
import { canViewSalary } from "@/lib/authz/can";
import { requirePermissionForApplication } from "@/lib/authz/require-permission";
import { redactAdminRowSalary } from "@/lib/authz/redact-salary";
import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import { updateCampaignApplied } from "@/lib/db/campaign-applied";
import { insertStageHistory } from "@/lib/db/candidate-stage-history";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { planRejectUndo, type RejectUndoHistory } from "@/lib/pipelines/reject-undo";
import { fetchJobPipelineConfig } from "@/lib/pipelines/transition-validator";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Undoes a reject within 10 minutes: puts the application back on the stage
 * and sub-stage it held before, provided nothing changed since. A separate
 * endpoint because PATCH only lets a candidate leave a stage from "passed".
 * Interview sessions the reject canceled are not restored.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireUserForRequest(request);
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
  const legacy = await guardLegacyJob(manageAccess.application.job_id);
  if (legacy) return legacy;

  const db = getPool();
  const { stageMappings, subStages } = await fetchJobPipelineConfig(
    db,
    manageAccess.application.job_id,
  );

  const outcome = await withTransaction(async (tx) => {
    // Lock the application so a concurrent move can't slip between check and write.
    const { rows: locked } = await tx.query<{
      current_job_stage_mapping_id: string | null;
      current_sub_state_id: string | null;
    }>(
      `SELECT current_job_stage_mapping_id, current_sub_state_id
       FROM campaign_applied WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [candidateId],
    );
    const current = locked[0];
    if (!current) return { ok: false as const, status: 404 as const, error: "Not found." };

    const { rows: history } = await tx.query<RejectUndoHistory>(
      `SELECT from_stage_mapping_id, from_sub_state_id, to_stage_mapping_id, to_sub_state_id, at
       FROM candidate_stage_history
       WHERE campaign_applied_id = $1
       ORDER BY at DESC, id DESC
       LIMIT 1`,
      [candidateId],
    );

    const plan = planRejectUndo({
      latest: history[0] ?? null,
      current: {
        stageMappingId: current.current_job_stage_mapping_id,
        subStateId: current.current_sub_state_id,
      },
      stageMappings,
      subStages,
    });
    if (!plan.ok) return plan;

    await updateCampaignApplied(tx, candidateId, {
      currentJobStageMappingId: plan.toStageMappingId,
      currentSubStateId: plan.toSubStateId,
    });
    await insertStageHistory(tx, {
      campaignAppliedId: candidateId,
      fromStageMappingId: current.current_job_stage_mapping_id,
      toStageMappingId: plan.toStageMappingId,
      fromSubStateId: current.current_sub_state_id,
      toSubStateId: plan.toSubStateId,
      reason: "Reject undone",
      byUserId: auth.userId,
    });
    if (current.current_job_stage_mapping_id !== plan.toStageMappingId) {
      await tx.query(
        `UPDATE campaign_applied SET entered_stage_at = now() WHERE id = $1`,
        [candidateId],
      );
    }
    return plan;
  });

  if (!outcome.ok) {
    return Response.json({ error: outcome.error }, { status: outcome.status });
  }

  const row = await getCampaignAppliedAdminRowById(db, candidateId);
  if (!row) {
    return Response.json({ error: "Could not load updated candidate." }, { status: 500 });
  }
  const viewSalary = await canViewSalary(db, auth.access, row.job_id);
  return Response.json({ candidate: redactAdminRowSalary(row, viewSalary) });
}
