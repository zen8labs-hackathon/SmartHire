import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { canDecideProbation } from "@/lib/authz/probation-mentor";
import { getCampaignAppliedById, updateCampaignApplied } from "@/lib/db/campaign-applied";
import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import { insertStageHistory } from "@/lib/db/candidate-stage-history";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { guardLegacyJob } from "@/lib/migration/legacy-flow-guard";
import {
  fetchJobPipelineConfig,
  isHiredStageMapping,
} from "@/lib/pipelines/transition-validator";
import { validateProbationExtension } from "@/lib/probation/extension";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bodySchema = z
  .object({
    new_end_date: z.string(),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Extend (gia hạn) a candidate's probation. Allowed for the assigned Mentor
 * and RM / HR / Admin; the reason is logged in the stage history.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const db = getPool();
  const application = await getCampaignAppliedById(db, id);
  if (!application) return Response.json({ error: "Not found." }, { status: 404 });

  if (!(await canDecideProbation(auth.access, application))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const legacy = await guardLegacyJob(application.job_id);
  if (legacy) return legacy;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Enter a new end date and a reason." }, { status: 400 });
  }

  const { stageMappings, subStages } = await fetchJobPipelineConfig(db, application.job_id);
  const current = stageMappings.find((sm) => sm.id === application.current_job_stage_mapping_id);
  if (!isHiredStageMapping(current)) {
    return Response.json(
      { error: "Probation can only be extended while the candidate is in probation." },
      { status: 400 },
    );
  }
  const sub = subStages.find((s) => s.id === application.current_sub_state_id);
  if (sub?.is_terminal) {
    return Response.json(
      { error: "Probation has already ended and can no longer be extended." },
      { status: 400 },
    );
  }

  const check = validateProbationExtension({
    newEndDate: parsed.data.new_end_date,
    reason: parsed.data.reason,
    startDate: application.start_date,
    extendedUntil: application.probation_extended_until,
    today: new Date().toISOString().slice(0, 10),
  });
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });

  const count = application.probation_extension_count + 1;
  const note = `Probation extended (#${count}) until ${parsed.data.new_end_date}: ${parsed.data.reason}`;

  await withTransaction(async (tx) => {
    await updateCampaignApplied(tx, id, {
      probationExtendedUntil: parsed.data.new_end_date,
      probationExtensionCount: count,
    });
    await insertStageHistory(tx, {
      campaignAppliedId: id,
      fromStageMappingId: application.current_job_stage_mapping_id,
      toStageMappingId: application.current_job_stage_mapping_id,
      fromSubStateId: application.current_sub_state_id,
      toSubStateId: application.current_sub_state_id,
      reason: note,
      byUserId: auth.userId,
    });
  });

  const row = await getCampaignAppliedAdminRowById(db, id);
  return Response.json({ candidate: row });
}
