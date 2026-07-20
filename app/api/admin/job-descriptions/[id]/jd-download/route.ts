import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { getJobById } from "@/lib/db/jobs";
import { getPool } from "@/lib/db/config/client";
import { createSignedDownloadUrl } from "@/lib/storage/s3";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: jobId } = await params;
  if (!UUID_RE.test(jobId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const job = await getJobById(getPool(), jobId);
  if (!job) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  if (!job.jd_storage_path) {
    return Response.json({ error: "No JD file on record." }, { status: 404 });
  }

  try {
    const signedUrl = await createSignedDownloadUrl(job.jd_storage_path, 120);
    return Response.redirect(signedUrl, 302);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create download link.";
    return Response.json({ error: message }, { status: 500 });
  }
}
