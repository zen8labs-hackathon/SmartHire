import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { getPool } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";
import { getJobEvaluateTemplate } from "@/lib/db/job-permissions";
import { createSignedDownloadUrl } from "@/lib/storage/s3";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: jobId } = await params;
  if (!UUID_RE.test(jobId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const db = getPool();
  const job = await getJobById(db, jobId);
  if (!job) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const template = await getJobEvaluateTemplate(db, jobId);
  if (!template?.storage_path) {
    return Response.json({ error: "No file on record." }, { status: 404 });
  }

  try {
    const signedUrl = await createSignedDownloadUrl(template.storage_path, 120);
    return Response.redirect(signedUrl, 302);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create download link.";
    return Response.json({ error: message }, { status: 500 });
  }
}
