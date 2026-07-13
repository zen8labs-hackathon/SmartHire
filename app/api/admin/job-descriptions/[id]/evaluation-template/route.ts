import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { getPool } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";
import {
  deleteJobEvaluateTemplate,
  getJobEvaluateTemplate,
} from "@/lib/db/job-permissions";
import { deleteObject } from "@/lib/storage/s3";

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

  return Response.json({
    hasFile: Boolean(template?.storage_path),
    originalFilename: template?.original_filename ?? null,
    mimeType: template?.mime_type ?? null,
    updatedAt: template?.updated_at ?? null,
  });
}

export async function DELETE(request: Request, { params }: RouteContext) {
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
  if (template?.storage_path) {
    try {
      await deleteObject(template.storage_path);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not remove file.";
      return Response.json({ error: message }, { status: 500 });
    }
  }

  await deleteJobEvaluateTemplate(db, jobId);

  return new Response(null, { status: 204 });
}
