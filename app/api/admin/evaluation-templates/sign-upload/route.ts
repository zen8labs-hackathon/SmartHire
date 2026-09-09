import {
  CANDIDATE_EVAL_TEMPLATE_TEMP_KEY_PREFIX,
  isAllowedCandidateEvalTemplateFilename,
  isCandidateEvalTemplateTempKey,
} from "@/lib/admin/candidate-evaluation-template-constants";
import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { logApiError } from "@/lib/logger";
import { createSignedUploadUrl, deleteObject } from "@/lib/storage/s3";
import { buildStorageFilename } from "@/lib/storage/storage-key";

type PostBody = {
  filename?: string;
  mimeType?: string | null;
  /** Storage key of a previously-signed-but-discarded upload, to delete before issuing a new one. */
  replacePath?: string | null;
};

/**
 * Presigned upload for a library template's PDF, before the template's row
 * (and its id) exists -- see `buildLibraryEvalTemplateStoragePath`.
 * `POST /api/admin/evaluation-templates` moves the object into place once
 * the row is created.
 */
export async function POST(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
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

  const replacePath =
    typeof body.replacePath === "string" && body.replacePath.length > 0
      ? body.replacePath
      : null;

  if (replacePath && !isCandidateEvalTemplateTempKey(replacePath)) {
    return Response.json({ error: "Invalid replace path." }, { status: 400 });
  }

  if (replacePath) {
    try {
      await deleteObject(replacePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not delete previous upload.";
      logApiError("Evaluation template sign-upload: delete previous failed", err, {
        path: "/api/admin/evaluation-templates/sign-upload",
        replacePath,
      });
      return Response.json({ error: message }, { status: 500 });
    }
  }

  const baseName = filename.slice(0, filename.length - ".pdf".length);
  const storagePath = `${CANDIDATE_EVAL_TEMPLATE_TEMP_KEY_PREFIX}${buildStorageFilename(baseName, ".pdf")}`;
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : null;

  try {
    const signedUrl = await createSignedUploadUrl(storagePath, mimeType);
    return Response.json({ path: storagePath, signedUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create signed upload URL.";
    logApiError("Evaluation template sign-upload failed", err, {
      path: "/api/admin/evaluation-templates/sign-upload",
      storagePath,
    });
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const path = url.searchParams.get("path")?.trim() ?? "";

  if (!path || !isCandidateEvalTemplateTempKey(path)) {
    return Response.json({ error: "Invalid or missing path." }, { status: 400 });
  }

  try {
    await deleteObject(path);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not delete file.";
    logApiError("Evaluation template sign-upload: delete failed", err, {
      path: "/api/admin/evaluation-templates/sign-upload",
      storagePath: path,
    });
    return Response.json({ error: message }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
