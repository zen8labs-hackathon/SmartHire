import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { canChangeMentor } from "@/lib/authz/probation-mentor";
import { getCampaignAppliedById, updateCampaignApplied } from "@/lib/db/campaign-applied";
import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import { insertStageHistory } from "@/lib/db/candidate-stage-history";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { listAllowedProfilesForJob } from "@/lib/db/job-permissions";
import { getUsersByIds } from "@/lib/db/users";
import { guardLegacyJob } from "@/lib/migration/legacy-flow-guard";
import {
  fetchJobPipelineConfig,
  isHiredStageMapping,
} from "@/lib/pipelines/transition-validator";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bodySchema = z
  .object({
    mentor_profile_id: z.string().uuid(),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Change (or assign, for legacy rows without one) the probation Mentor.
 * HR / Admin / chapter head only; logged in the stage history.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const db = getPool();
  const application = await getCampaignAppliedById(db, id);
  if (!application) return Response.json({ error: "Not found." }, { status: 404 });

  if (!(await canChangeMentor(auth.access, application.job_id))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const legacy = await guardLegacyJob(application.job_id);
  if (legacy) return legacy;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Choose a Mentor." }, { status: 400 });
  }
  const { mentor_profile_id, reason } = parsed.data;

  const { stageMappings } = await fetchJobPipelineConfig(db, application.job_id);
  const current = stageMappings.find((sm) => sm.id === application.current_job_stage_mapping_id);
  if (!isHiredStageMapping(current)) {
    return Response.json(
      { error: "A Mentor can only be changed while the candidate is in probation." },
      { status: 400 },
    );
  }

  const members = application.job_id
    ? await listAllowedProfilesForJob(db, application.job_id)
    : [];
  if (!members.some((m) => m.profile_id === mentor_profile_id)) {
    return Response.json(
      { error: "The Mentor must be someone already added to this position." },
      { status: 422 },
    );
  }
  if (application.mentor_profile_id === mentor_profile_id) {
    return Response.json({ error: "That person is already the Mentor." }, { status: 400 });
  }

  const names = await getUsersByIds(db, [
    mentor_profile_id,
    ...(application.mentor_profile_id ? [application.mentor_profile_id] : []),
  ]);
  const nameOf = (uid: string | null) =>
    (uid && names.find((u) => u.id === uid)?.username) || "none";
  const note = `Mentor changed: ${nameOf(application.mentor_profile_id)} → ${nameOf(mentor_profile_id)}${reason ? ` (${reason})` : ""}`;

  await withTransaction(async (tx) => {
    await updateCampaignApplied(tx, id, { mentorProfileId: mentor_profile_id });
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
