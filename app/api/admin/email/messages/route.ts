import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionForApplication } from "@/lib/authz/require-permission";
import { getPool } from "@/lib/db/config/client";
import { listEmailMessages, type EmailMessageStatus } from "@/lib/db/email-messages";

const STATUSES: EmailMessageStatus[] = [
  "draft",
  "pending_approval",
  "sending",
  "sent",
  "failed",
  "cancelled",
];

/**
 * Global Logs tab is HR-only (implicit via requireStaffForRequest + isHr not
 * checked here would leak other job's mail -- but `campaignAppliedId`-scoped
 * requests additionally verify job ACL below). Un-scoped queries (Logs tab)
 * are staff-wide since email_messages carries no per-row viewer restriction
 * beyond staff access, matching the Email Config page's own HR-only route gate.
 * `candidateId`-scoped requests (candidate-detail's "all mail across jobs"
 * view) span every job the candidate applied to, each with its own ACL, so
 * rather than checking permission per job they're gated the same as unscoped
 * queries (HR-only) -- matching the HR-only gate already on the
 * candidate-detail page itself.
 */
export async function GET(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const campaignAppliedId = url.searchParams.get("campaignAppliedId") ?? undefined;
  const candidateId = url.searchParams.get("candidateId") ?? undefined;
  const jobId = url.searchParams.get("jobId") ?? undefined;
  const statusParam = url.searchParams.get("status");
  const triggerType = url.searchParams.get("triggerType") ?? undefined;

  if (campaignAppliedId) {
    const access = await requirePermissionForApplication(
      auth.access,
      "candidate.view",
      campaignAppliedId,
    );
    if (!access.ok) return access.response;
  } else if (!auth.access.isHr) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = STATUSES.includes(statusParam as EmailMessageStatus)
    ? (statusParam as EmailMessageStatus)
    : undefined;

  const result = await listEmailMessages(getPool(), {
    campaignAppliedId,
    candidateId,
    jobId,
    status,
    triggerType,
    limit: Number(url.searchParams.get("limit")) || undefined,
    offset: Number(url.searchParams.get("offset")) || undefined,
  });

  return Response.json(result);
}
