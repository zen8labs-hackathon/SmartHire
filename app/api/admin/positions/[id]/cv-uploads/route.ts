import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { createBatchDone } from "@/lib/db/batch-done";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";
import { insertManyFileUploads } from "@/lib/db/upload-history";
import { logApiError } from "@/lib/logger";
import {
  POOL_ID,
  validateCvUploadBody,
  type CvUploadBody,
} from "@/lib/position/cv-upload";
import { createSignedUploadUrl } from "@/lib/storage/s3";
import dayjs from "dayjs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Step 1 of a CV upload into a position (or the talent pool when `id` is
 * "pool"): records one `file_uploads` row per file and returns a presigned S3
 * PUT url for each. The recruiter is always the logged-in user.
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const jobId = id === POOL_ID ? null : id;

  if (jobId) {
    const job = await getJobById(getPool(), jobId);
    if (!job || job.deleted_at) {
      return Response.json({ error: "Position not found." }, { status: 404 });
    }
    const perm = await requirePermissionOnJob(auth.access, "candidate.manage", jobId);
    if (!perm.ok) return perm.response;
  }

  let body: CvUploadBody;
  try {
    body = (await request.json()) as CvUploadBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = validateCvUploadBody(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const recruiter = parsed.recruiter ?? (auth.access.username || null);
  const batchId = dayjs().format("YYYYMMDDHHmmss");

  try {
    const rows = await withTransaction(async (tx) => {
      const inserted = await insertManyFileUploads(
        tx,
        jobId,
        batchId,
        parsed.files.map((f) => ({
          fileName: f.fileName,
          storageKey: f.storageKey,
          mimeType: f.mimeType,
          fileSource: parsed.source,
          recruiter,
          uploadedBy: auth.userId,
        })),
      );
      await createBatchDone(tx, batchId);
      return inserted;
    });

    const files = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        fileName: r.file_name,
        signedUrl: await createSignedUploadUrl(r.storage_key, r.mime_type),
        mimeType: r.mime_type,
      })),
    );
    return Response.json({ batchId, files }, { status: 201 });
  } catch (e) {
    logApiError("Position CV upload: init failed", e, { jobId, batchId });
    return Response.json({ error: "Could not start the upload." }, { status: 500 });
  }
}
