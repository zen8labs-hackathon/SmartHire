import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionForApplication } from "@/lib/authz/require-permission";
import { getPool } from "@/lib/db/config/client";
import { getEmailMessageById } from "@/lib/db/email-messages";
import { listAttachmentsForMessage } from "@/lib/db/email-attachments";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: RouteContext) {
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
      "candidate.view",
      message.campaign_applied_id,
    );
    if (!access.ok) return access.response;
  } else if (!auth.access.isHr) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const attachments = await listAttachmentsForMessage(db, id);
  return Response.json({ message, attachments });
}
