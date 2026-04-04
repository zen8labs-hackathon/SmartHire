import {
  CANDIDATE_EVAL_TEMPLATE_BUCKET,
  MAX_CANDIDATE_EVAL_TEMPLATE_BYTES,
  isAllowedCandidateEvalTemplateFilename,
  isValidCandidateEvalTemplateStoragePath,
} from "@/lib/admin/candidate-evaluation-template-constants";
import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { createAdminClient } from "@/lib/supabase/admin";

type Body = {
  path?: string;
  filename?: string;
  mimeType?: string | null;
};

export async function POST(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const path = typeof body.path === "string" ? body.path.trim() : "";
  if (!isValidCandidateEvalTemplateStoragePath(path)) {
    return Response.json({ error: "Invalid storage path." }, { status: 400 });
  }

  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  if (!filename || !isAllowedCandidateEvalTemplateFilename(filename)) {
    return Response.json(
      { error: "Only PDF files are allowed for the evaluation template." },
      { status: 400 },
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json(
      { error: "Server missing service role key." },
      { status: 500 },
    );
  }

  const { data: blob, error: dlErr } = await admin.storage
    .from(CANDIDATE_EVAL_TEMPLATE_BUCKET)
    .download(path);

  if (dlErr || !blob) {
    return Response.json(
      { error: "Upload not found or not ready. Try uploading again." },
      { status: 400 },
    );
  }

  const size =
    typeof (blob as Blob).size === "number" ? (blob as Blob).size : 0;
  if (size <= 0 || size > MAX_CANDIDATE_EVAL_TEMPLATE_BYTES) {
    await admin.storage.from(CANDIDATE_EVAL_TEMPLATE_BUCKET).remove([path]);
    return Response.json(
      { error: "File is empty or exceeds the 10 MB limit." },
      { status: 400 },
    );
  }

  const { data: row, error: selErr } = await auth.supabase
    .from("candidate_evaluation_template")
    .select("storage_path")
    .eq("id", 1)
    .maybeSingle();

  if (selErr) {
    return Response.json({ error: selErr.message }, { status: 500 });
  }

  const prevPath = (row as { storage_path: string | null } | null)?.storage_path;

  if (prevPath && prevPath !== path) {
    const { error: rmErr } = await admin.storage
      .from(CANDIDATE_EVAL_TEMPLATE_BUCKET)
      .remove([prevPath]);
    if (rmErr) {
      return Response.json({ error: rmErr.message }, { status: 500 });
    }
  }

  const { error: upErr } = await auth.supabase
    .from("candidate_evaluation_template")
    .update({
      storage_path: path,
      original_filename: filename,
      mime_type: typeof body.mimeType === "string" ? body.mimeType : null,
      updated_by: auth.userId,
    })
    .eq("id", 1);

  if (upErr) {
    return Response.json({ error: upErr.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
