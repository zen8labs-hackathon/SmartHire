import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import { getPool } from "@/lib/db/config/client";
import {
  createEmailSchedule,
  listPendingSchedulesForCampaignApplied,
} from "@/lib/db/email-schedules";
import { getEmailTemplateById } from "@/lib/db/email-templates";

const bodySchema = z.object({
  campaignAppliedId: z.string().uuid(),
  templateId: z.string().regex(/^\d+$/),
  scheduledFor: z.string().datetime(),
});

export async function GET(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const campaignAppliedId = url.searchParams.get("campaignAppliedId");
  if (!campaignAppliedId) {
    return Response.json(
      { error: "campaignAppliedId is required." },
      { status: 400 },
    );
  }

  const db = getPool();
  const application = await getCampaignAppliedById(db, campaignAppliedId);
  if (!application) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  if (application.job_id) {
    const access = await requirePermissionOnJob(
      auth.access,
      "candidate.view",
      application.job_id,
    );
    if (!access.ok) return access.response;
  }

  const schedules = await listPendingSchedulesForCampaignApplied(
    db,
    campaignAppliedId,
  );
  return Response.json({ schedules });
}

/** Manually queue a template to send later for one candidate (the "gửi sau" case, distinct from the event-triggered auto-send path in candidates/pipeline/route.ts). */
export async function POST(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

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
  const { campaignAppliedId, templateId, scheduledFor } = parsed.data;

  const db = getPool();
  const application = await getCampaignAppliedById(db, campaignAppliedId);
  if (!application) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const access = await requirePermissionOnJob(
    auth.access,
    "candidate.manage",
    application.job_id,
  );
  if (!access.ok) return access.response;

  const template = await getEmailTemplateById(db, templateId);
  if (!template) {
    return Response.json({ error: "Template not found." }, { status: 404 });
  }

  const schedule = await createEmailSchedule(db, {
    jobId: application.job_id,
    campaignAppliedId: application.id,
    templateId,
    scheduledFor: new Date(scheduledFor),
    createdBy: auth.userId,
  });
  if (!schedule) {
    return Response.json(
      { error: "An identical schedule already exists." },
      { status: 409 },
    );
  }

  return Response.json({ schedule }, { status: 201 });
}
