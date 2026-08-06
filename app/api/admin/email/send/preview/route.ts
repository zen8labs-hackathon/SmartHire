import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { listCampaignAppliedByIds } from "@/lib/db/campaign-applied";
import { getPool } from "@/lib/db/config/client";
import { getEmailSettings } from "@/lib/db/email-settings";
import { getEmailTemplateById } from "@/lib/db/email-templates";
import { getPublicUserById } from "@/lib/db/users";
import { composeEmailForCandidate } from "@/lib/email/compose-for-candidate";

const bodySchema = z
  .object({
    campaignAppliedIds: z.array(z.string().uuid()).min(1).max(100),
    templateId: z.string().regex(/^\d+$/).optional(),
    subject: z.string().optional(),
    bodyHtml: z.string().optional(),
  })
  .refine((v) => v.templateId || (v.subject && v.bodyHtml), {
    message: "Either templateId or subject+bodyHtml is required.",
  });

/** Renders subject/body per selected candidate without creating any email_messages rows -- used by both the single-recipient compose modal and the bulk-send wizard's preview step. */
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
  const { campaignAppliedIds, templateId, subject, bodyHtml } = parsed.data;

  const db = getPool();

  let subjectTemplate = subject ?? "";
  let bodyTemplateText = bodyHtml ?? "";
  if (templateId) {
    const template = await getEmailTemplateById(db, templateId);
    if (!template) {
      return Response.json({ error: "Template not found." }, { status: 404 });
    }
    subjectTemplate = subject ?? template.subject_template;
    bodyTemplateText = bodyHtml ?? template.body_template;
  }

  const applications = await listCampaignAppliedByIds(db, campaignAppliedIds);
  if (applications.length !== campaignAppliedIds.length) {
    return Response.json(
      { error: "One or more candidates were not found." },
      { status: 404 },
    );
  }

  const jobIds = [...new Set(applications.map((a) => a.job_id).filter((id): id is string => !!id))];
  for (const jobId of jobIds) {
    const access = await requirePermissionOnJob(auth.access, "candidate.manage", jobId);
    if (!access.ok) return access.response;
  }

  const settings = await getEmailSettings(db);
  const senderUserRow = await getPublicUserById(db, auth.userId);
  const senderUser = senderUserRow
    ? {
        name: senderUserRow.display_name || senderUserRow.username,
        email: senderUserRow.email,
        phone: senderUserRow.phone,
      }
    : null;

  const previews = [];
  for (const application of applications) {
    const composed = await composeEmailForCandidate(
      db,
      application,
      subjectTemplate,
      bodyTemplateText,
      {
        senderName: auth.access.email,
        companyName: settings.company_name,
        signatureHtml: settings.signature_html,
        logoUrl: settings.logo_url,
        senderUser,
      },
    );
    if (composed) previews.push(composed);
  }

  return Response.json({ previews });
}
