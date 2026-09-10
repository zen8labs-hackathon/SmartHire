import {
  buildLibraryEvalTemplateStoragePath,
  isAllowedCandidateEvalTemplateFilename,
  isCandidateEvalTemplateTempKey,
  MAX_CANDIDATE_EVAL_TEMPLATE_BYTES,
  MAX_CANDIDATE_EVAL_TEMPLATE_TEXT_LEN,
  MAX_EVAL_TEMPLATE_TITLE_LEN,
} from "@/lib/admin/candidate-evaluation-template-constants";
import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { getPool } from "@/lib/db/config/client";
import {
  deleteEvaluateTemplateById,
  getEvaluateTemplateById,
  updateEvaluateTemplate,
} from "@/lib/db/job-permissions";
import { logApiError } from "@/lib/logger";
import { deleteObject, downloadObject, moveObject } from "@/lib/storage/s3";

type RouteContext = { params: Promise<{ id: string }> };

/** `job_evaluate_templates.id` is a bigint identity, so the path segment is digits. */
const ID_RE = /^[0-9]{1,19}$/;

function serialize(row: NonNullable<Awaited<ReturnType<typeof getEvaluateTemplateById>>>) {
  return {
    id: row.id,
    title: row.title,
    hasFile: Boolean(row.storage_path),
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    hasText: row.content_text != null,
    contentText: row.content_text,
    updatedAt: row.updated_at,
    createdById: row.created_by,
  };
}

type PatchBody = {
  title?: string;
  contentText?: string;
  /** Temp key from a prior POST .../sign-upload + direct PUT, to replace the file. */
  storagePath?: string;
  originalFilename?: string;
  mimeType?: string | null;
};

/**
 * Updates a library entry the caller owns. Switching to text clears any
 * existing file (and deletes its S3 object); switching to a new file clears
 * the text and replaces the old file. Sending only `title` leaves the
 * content -- whichever kind it currently is -- untouched.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!ID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const db = getPool();
  const existing = await getEvaluateTemplateById(db, id, auth.userId);
  if (!existing) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: {
    title?: string;
    storagePath?: string | null;
    originalFilename?: string | null;
    mimeType?: string | null;
    contentText?: string | null;
  } = {};

  if (body.title !== undefined) {
    const title = body.title.trim();
    if (!title || title.length > MAX_EVAL_TEMPLATE_TITLE_LEN) {
      return Response.json(
        {
          error: `Title is required and must be at most ${MAX_EVAL_TEMPLATE_TITLE_LEN} characters.`,
        },
        { status: 400 },
      );
    }
    patch.title = title;
  }

  const hasContentText = body.contentText !== undefined;
  const hasStoragePath =
    typeof body.storagePath === "string" && body.storagePath.length > 0;

  if (hasContentText && hasStoragePath) {
    return Response.json(
      { error: "Provide either text or a file, not both." },
      { status: 400 },
    );
  }

  if (hasContentText) {
    const contentText = (body.contentText ?? "").trim();
    if (!contentText) {
      return Response.json({ error: "Criteria text cannot be empty." }, { status: 400 });
    }
    if (contentText.length > MAX_CANDIDATE_EVAL_TEMPLATE_TEXT_LEN) {
      return Response.json(
        {
          error: `Criteria text must be at most ${MAX_CANDIDATE_EVAL_TEMPLATE_TEXT_LEN} characters.`,
        },
        { status: 400 },
      );
    }
    if (existing.storage_path) {
      try {
        await deleteObject(existing.storage_path);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not remove existing file.";
        return Response.json({ error: message }, { status: 500 });
      }
    }
    patch.contentText = contentText;
    patch.storagePath = null;
    patch.originalFilename = null;
    patch.mimeType = null;
  } else if (hasStoragePath) {
    const storagePath = body.storagePath!;
    if (!isCandidateEvalTemplateTempKey(storagePath)) {
      return Response.json({ error: "Invalid storage path." }, { status: 400 });
    }
    const originalFilename =
      typeof body.originalFilename === "string" ? body.originalFilename.trim() : "";
    if (!originalFilename || !isAllowedCandidateEvalTemplateFilename(originalFilename)) {
      return Response.json(
        { error: "Only PDF files are allowed for the evaluation template." },
        { status: 400 },
      );
    }
    let size: number;
    try {
      size = (await downloadObject(storagePath)).byteLength;
    } catch {
      return Response.json(
        { error: "Upload not found or not ready. Try uploading again." },
        { status: 400 },
      );
    }
    if (size <= 0 || size > MAX_CANDIDATE_EVAL_TEMPLATE_BYTES) {
      await deleteObject(storagePath).catch(() => {});
      return Response.json(
        { error: "File is empty or exceeds the 10 MB limit." },
        { status: 400 },
      );
    }

    const finalPath = buildLibraryEvalTemplateStoragePath(id, originalFilename);
    try {
      await moveObject(storagePath, finalPath);
    } catch (e) {
      logApiError("Evaluation template: failed to finalize replacement file", e, {
        path: "/api/admin/evaluation-templates/[id]",
        templateId: id,
      });
      return Response.json(
        { error: "The file failed to finalize. Please retry." },
        { status: 500 },
      );
    }
    if (existing.storage_path && existing.storage_path !== finalPath) {
      await deleteObject(existing.storage_path).catch(() => {});
    }
    patch.storagePath = finalPath;
    patch.originalFilename = originalFilename;
    patch.mimeType = typeof body.mimeType === "string" ? body.mimeType : null;
    patch.contentText = null;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No updates provided." }, { status: 400 });
  }

  const updated = await updateEvaluateTemplate(db, id, auth.userId, patch, auth.userId);
  if (!updated) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  return Response.json({ template: serialize(updated) });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!ID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const db = getPool();
  const deleted = await deleteEvaluateTemplateById(db, id, auth.userId);
  if (!deleted) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  if (deleted.storage_path) {
    await deleteObject(deleted.storage_path).catch((err) => {
      logApiError("Evaluation template: failed to delete S3 object", err, {
        path: "/api/admin/evaluation-templates/[id]",
        templateId: id,
        storagePath: deleted.storage_path,
      });
    });
  }

  return new Response(null, { status: 204 });
}
