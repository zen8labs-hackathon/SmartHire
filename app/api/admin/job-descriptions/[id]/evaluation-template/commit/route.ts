import {
  isAllowedCandidateEvalTemplateFilename,
  isValidCandidateEvalTemplateStoragePath,
  MAX_CANDIDATE_EVAL_TEMPLATE_BYTES,
} from "@/lib/admin/candidate-evaluation-template-constants";
import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { getPool } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";
import { getJobEvaluateTemplate, upsertJobEvaluateTemplate } from "@/lib/db/job-permissions";
import { deleteObject, downloadObject } from "@/lib/storage/s3";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Body = {
  path?: string;
  filename?: string;
  mimeType?: string | null;
};

export async function POST(request: Request, { params }: RouteContext) {
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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const path = typeof body.path === "string" ? body.path.trim() : "";
  if (!isValidCandidateEvalTemplateStoragePath(path, jobId)) {
    return Response.json({ error: "Invalid storage path." }, { status: 400 });
  }

  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  if (!filename || !isAllowedCandidateEvalTemplateFilename(filename)) {
    return Response.json(
      { error: "Only PDF files are allowed for the evaluation template." },
      { status: 400 },
    );
  }

  let size: number;
  try {
    const buf = await downloadObject(path);
    size = buf.byteLength;
  } catch {
    return Response.json(
      { error: "Upload not found or not ready. Try uploading again." },
      { status: 400 },
    );
  }

  if (size <= 0 || size > MAX_CANDIDATE_EVAL_TEMPLATE_BYTES) {
    await deleteObject(path);
    return Response.json(
      { error: "File is empty or exceeds the 10 MB limit." },
      { status: 400 },
    );
  }

  const existing = await getJobEvaluateTemplate(db, jobId);
  if (existing?.storage_path && existing.storage_path !== path) {
    await deleteObject(existing.storage_path);
  }

  await upsertJobEvaluateTemplate(db, {
    jobId,
    storagePath: path,
    originalFilename: filename,
    mimeType: typeof body.mimeType === "string" ? body.mimeType : null,
    contentText: null,
    createdBy: auth.userId,
    updatedBy: auth.userId,
  });

  return Response.json({ ok: true });
}
