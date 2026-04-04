import {
  CANDIDATE_EVAL_TEMPLATE_BUCKET,
  MAX_CANDIDATE_EVAL_TEMPLATE_BYTES,
  isAllowedCandidateEvalTemplateFilename,
} from "@/lib/admin/candidate-evaluation-template-constants";
import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { createAdminClient } from "@/lib/supabase/admin";

type Body = {
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
      {
        error:
          "Server missing service role key; cannot create signed upload URL.",
      },
      { status: 500 },
    );
  }

  const fileId = crypto.randomUUID();
  const storagePath = `singleton/${fileId}.pdf`;

  const { data: signed, error: signErr } = await admin.storage
    .from(CANDIDATE_EVAL_TEMPLATE_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (signErr || !signed) {
    return Response.json(
      { error: signErr?.message ?? "Could not create signed upload URL" },
      { status: 500 },
    );
  }

  return Response.json({
    path: signed.path,
    token: signed.token,
    signedUrl: signed.signedUrl,
    maxBytes: MAX_CANDIDATE_EVAL_TEMPLATE_BYTES,
  });
}
