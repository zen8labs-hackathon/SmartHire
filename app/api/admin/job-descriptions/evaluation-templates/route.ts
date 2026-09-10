import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requireCanCreateJobs } from "@/lib/authz/require-permission";
import { getPool } from "@/lib/db/config/client";
import { listEvaluateTemplates } from "@/lib/db/job-permissions";

/**
 * GET /api/admin/job-descriptions/evaluation-templates
 *
 * Evaluation template library entries (managed on /admin/evaluation-template)
 * for the "reuse an existing evaluation template" picker in the Create Job
 * modal -- see `useJdCreateState`. HR/admin see every entry in the library
 * (same as /admin/evaluation-template itself); a chapter head sees only the
 * entries they created.
 */
export async function GET(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const createAccess = requireCanCreateJobs(auth.access);
  if (!createAccess.ok) return createAccess.response;

  const rows = await listEvaluateTemplates(
    getPool(),
    auth.access.isHr ? null : auth.userId,
  );

  return Response.json({
    templates: rows.map((r) => ({
      id: r.id,
      title: r.title,
      originalFilename: r.original_filename,
      hasText: r.content_text != null,
      updatedAt: r.updated_at,
      createdByLabel: r.created_by_username ?? r.created_by_email,
    })),
  });
}
