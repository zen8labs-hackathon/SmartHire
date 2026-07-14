import {
  isAllowedCandidateEvalTemplateFilename,
  CANDIDATE_EVAL_TEMPLATE_KEY_PREFIX,
} from "@/lib/admin/candidate-evaluation-template-constants";
import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { getPool } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";
import { createSignedUploadUrl } from "@/lib/storage/s3";
import { buildStorageFilename } from "@/lib/storage/storage-key";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Body = {
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
  const job = await getJobById(getPool(), jobId);
  if (!job) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  if (!filename || !isAllowedCandidateEvalTemplateFilename(filename)) {
    return Response.json(
      { error: "Only PDF files are allowed for the evaluation template." },
      { status: 400 },
    );
  }

  const baseName = filename.slice(0, filename.length - ".pdf".length);
  const storagePath = `${CANDIDATE_EVAL_TEMPLATE_KEY_PREFIX}${jobId}/${buildStorageFilename(baseName, ".pdf")}`;
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : null;

  try {
    const signedUrl = await createSignedUploadUrl(storagePath, mimeType);
    return Response.json({ path: storagePath, signedUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create signed upload URL.";
    return Response.json({ error: message }, { status: 500 });
  }
}
