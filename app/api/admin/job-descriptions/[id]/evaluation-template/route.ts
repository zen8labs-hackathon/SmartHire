import { MAX_CANDIDATE_EVAL_TEMPLATE_TEXT_LEN } from "@/lib/admin/candidate-evaluation-template-constants";
import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { getPool } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";
import {
  deleteJobEvaluateTemplate,
  getJobEvaluateTemplate,
  upsertJobEvaluateTemplate,
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
    hasText: Boolean(template?.content_text),
    contentText: template?.content_text ?? null,
    updatedAt: template?.updated_at ?? null,
  });
}

/**
 * Saves plain-text evaluation criteria, mutually exclusive with the uploaded
 * file (`job_evaluate_templates_file_xor_text` CHECK constraint) -- switching
 * to text clears any existing file, same as `commit/route.ts` clears text
 * when a file is uploaded.
 */
export async function PUT(request: Request, { params }: RouteContext) {
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

  let body: { contentText?: string };
  try {
    body = (await request.json()) as { contentText?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contentText = typeof body.contentText === "string" ? body.contentText.trim() : "";
  if (!contentText) {
    return Response.json({ error: "Criteria text cannot be empty." }, { status: 400 });
  }
  if (contentText.length > MAX_CANDIDATE_EVAL_TEMPLATE_TEXT_LEN) {
    return Response.json(
      { error: `Criteria text must be at most ${MAX_CANDIDATE_EVAL_TEMPLATE_TEXT_LEN} characters.` },
      { status: 400 },
    );
  }

  const existing = await getJobEvaluateTemplate(db, jobId);
  if (existing?.storage_path) {
    try {
      await deleteObject(existing.storage_path);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not remove existing file.";
      return Response.json({ error: message }, { status: 500 });
    }
  }

  await upsertJobEvaluateTemplate(db, {
    jobId,
    contentText,
    storagePath: null,
    originalFilename: null,
    mimeType: null,
    updatedBy: auth.userId,
  });

  return Response.json({ ok: true });
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
