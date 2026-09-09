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
  createEvaluateTemplate,
  deleteEvaluateTemplateById,
  listEvaluateTemplates,
  updateEvaluateTemplate,
  type JobEvaluateTemplateWithCreator,
} from "@/lib/db/job-permissions";
import { logApiError } from "@/lib/logger";
import { deleteObject, downloadObject, moveObject } from "@/lib/storage/s3";

function serialize(row: Awaited<ReturnType<typeof createEvaluateTemplate>>) {
  return {
    id: row.id,
    title: row.title,
    hasFile: Boolean(row.storage_path),
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    hasText: row.content_text != null,
    contentText: row.content_text,
    updatedAt: row.updated_at,
    /** So the client can tell which entries it may edit/delete (still
     * owner-scoped, see PATCH/DELETE) from ones it can only read/reuse. */
    createdById: row.created_by,
  };
}

function serializeWithCreator(row: JobEvaluateTemplateWithCreator) {
  return {
    ...serialize(row),
    createdByLabel: row.created_by_username ?? row.created_by_email,
  };
}

/**
 * The evaluation template library (`job_evaluate_templates` rows with
 * `job_id IS NULL`) -- managed on /admin/evaluation-template. This route is
 * HR/admin-only (`requireAdminForRequest`), so it lists every entry in the
 * library, not just the caller's own -- a shared team library, not a
 * personal one. The Create Job modal's "reuse an existing evaluation
 * template" picker (`/api/admin/job-descriptions/evaluation-templates`)
 * reads the same table but scopes to the caller's own entries unless *that*
 * caller is HR/admin too.
 */
export async function GET(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const rows = await listEvaluateTemplates(getPool(), null);
  return Response.json({ templates: rows.map(serializeWithCreator) });
}

type PostBody = {
  title?: string;
  contentText?: string;
  /** Temp key from a prior POST .../sign-upload + direct PUT. */
  storagePath?: string;
  originalFilename?: string;
  mimeType?: string | null;
};

/**
 * Creates a new library entry: exactly one of `contentText` (saved as-is) or
 * `storagePath` (a temp-uploaded PDF, moved into place under this new row's
 * id) must be given -- matches the `job_evaluate_templates_file_xor_text`
 * CHECK constraint.
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

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > MAX_EVAL_TEMPLATE_TITLE_LEN) {
    return Response.json(
      {
        error: `Title is required and must be at most ${MAX_EVAL_TEMPLATE_TITLE_LEN} characters.`,
      },
      { status: 400 },
    );
  }

  const contentText =
    typeof body.contentText === "string" ? body.contentText.trim() : "";
  const storagePath =
    typeof body.storagePath === "string" && body.storagePath ? body.storagePath : "";

  if (contentText && storagePath) {
    return Response.json(
      { error: "Provide either text or a file, not both." },
      { status: 400 },
    );
  }
  if (!contentText && !storagePath) {
    return Response.json(
      { error: "Provide either text or a file." },
      { status: 400 },
    );
  }
  if (contentText.length > MAX_CANDIDATE_EVAL_TEMPLATE_TEXT_LEN) {
    return Response.json(
      {
        error: `Criteria text must be at most ${MAX_CANDIDATE_EVAL_TEMPLATE_TEXT_LEN} characters.`,
      },
      { status: 400 },
    );
  }

  const originalFilename =
    typeof body.originalFilename === "string" ? body.originalFilename.trim() : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : null;

  if (storagePath) {
    if (!isCandidateEvalTemplateTempKey(storagePath)) {
      return Response.json({ error: "Invalid storage path." }, { status: 400 });
    }
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
  }

  const db = getPool();
  const created = await createEvaluateTemplate(db, {
    title,
    contentText: contentText || null,
    createdBy: auth.userId,
  });

  if (!storagePath) {
    return Response.json({ template: serialize(created) }, { status: 201 });
  }

  // The row (and its id) only exists after insert, so the temp-uploaded file
  // is moved into place here, now that the id is known -- mirrors the JD file
  // flow (`buildFinalJdStoragePath` + `moveObject` in job-descriptions/route.ts).
  const finalPath = buildLibraryEvalTemplateStoragePath(created.id, originalFilename);
  try {
    await moveObject(storagePath, finalPath);
  } catch (e) {
    // Never leave a template row with no content: roll it back and make the
    // caller retry, same reasoning as the JD create flow's rollback.
    await deleteEvaluateTemplateById(db, created.id, auth.userId).catch(() => {});
    logApiError("Evaluation template: failed to finalize file", e, {
      path: "/api/admin/evaluation-templates",
      templateId: created.id,
    });
    return Response.json(
      { error: "The file failed to finalize. Please retry." },
      { status: 500 },
    );
  }

  const updated = await updateEvaluateTemplate(
    db,
    created.id,
    auth.userId,
    { storagePath: finalPath, originalFilename, mimeType },
    auth.userId,
  );

  return Response.json({ template: serialize(updated ?? created) }, { status: 201 });
}
