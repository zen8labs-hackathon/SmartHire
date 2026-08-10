import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionForApplication, requirePermissionOnJob } from "@/lib/authz/require-permission";
import { getPool } from "@/lib/db/config/client";
import { getEmailMessageById, updateEmailMessageStatus } from "@/lib/db/email-messages";
import { buildGraphAttachmentsForMessage } from "@/lib/email/message-attachments";
import { sendEmail } from "@/lib/email/send-email";
import { logApiError } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Re-sends a message that previously failed, reusing its already-composed
 * subject/body/recipients/attachments rather than recomposing from the
 * template -- a retry should reproduce exactly what failed, not re-render
 * against the candidate's possibly-changed current data.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id." }, { status: 400 });
  }

  const db = getPool();
  const message = await getEmailMessageById(db, id);
  if (!message) return Response.json({ error: "Not found." }, { status: 404 });

  if (message.campaign_applied_id) {
    const access = await requirePermissionForApplication(
      auth.access,
      "candidate.manage",
      message.campaign_applied_id,
    );
    if (!access.ok) return access.response;
  } else {
    const access = await requirePermissionOnJob(auth.access, "candidate.manage", message.job_id);
    if (!access.ok) return access.response;
  }

  if (message.status !== "failed") {
    return Response.json(
      { error: "Only failed messages can be retried." },
      { status: 400 },
    );
  }

  try {
    const graphAttachments = await buildGraphAttachmentsForMessage(db, message.id);
    const sendResult = await sendEmail({
      fromEmail: message.from_email,
      toEmail: message.to_email,
      cc: message.cc,
      bcc: message.bcc,
      subject: message.subject,
      bodyHtml: message.body_html,
      attachments: graphAttachments,
    });

    if (sendResult.ok) {
      const updated = await updateEmailMessageStatus(db, message.id, {
        status: "sent",
        sentAt: new Date(),
        graphMessageId: sendResult.graphMessageId,
      });
      return Response.json({ ok: true, status: "sent", message: updated });
    }

    const updated = await updateEmailMessageStatus(db, message.id, {
      status: "failed",
      errorMessage: sendResult.error,
      incrementRetryCount: true,
    });
    return Response.json({ ok: false, status: "failed", error: sendResult.error, message: updated });
  } catch (error) {
    logApiError("Email retry failed", error, { messageId: message.id });
    const errMessage = error instanceof Error ? error.message : "Failed to retry email.";
    return Response.json({ error: errMessage }, { status: 500 });
  }
}
