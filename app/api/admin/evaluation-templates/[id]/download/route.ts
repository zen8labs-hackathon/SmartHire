import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { getPool } from "@/lib/db/config/client";
import { getEvaluateTemplateByIdForRead } from "@/lib/db/job-permissions";
import { logApiError } from "@/lib/logger";
import { createSignedDownloadUrl } from "@/lib/storage/s3";

type RouteContext = { params: Promise<{ id: string }> };

const ID_RE = /^[0-9]{1,19}$/;

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!ID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  // No ownership check: this route is HR/admin-only, and HR/admin can
  // download any library entry (see /api/admin/evaluation-templates).
  const template = await getEvaluateTemplateByIdForRead(getPool(), id);
  if (!template?.storage_path) {
    return Response.json({ error: "No file on record." }, { status: 404 });
  }

  try {
    const signedUrl = await createSignedDownloadUrl(template.storage_path, 120);
    return Response.redirect(signedUrl, 302);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create download link.";
    logApiError("Evaluation template download: signed URL failed", err, {
      path: "/api/admin/evaluation-templates/[id]/download",
      templateId: id,
      storagePath: template.storage_path,
    });
    return Response.json({ error: message }, { status: 500 });
  }
}
