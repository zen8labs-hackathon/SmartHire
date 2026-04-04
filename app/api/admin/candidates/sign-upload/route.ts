import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { isCandidateSource } from "@/lib/candidates/source-constants";
import {
  CV_BUCKET,
  extensionFromFilename,
  isAllowedCvFilename,
  MAX_CV_BYTES,
} from "@/lib/candidates/upload-constants";
import { createAdminClient } from "@/lib/supabase/admin";

type Body = {
  jobOpeningId?: string | null;
  filename?: string;
  mimeType?: string | null;
  source?: string;
  sourceOther?: string | null;
};

const MAX_SOURCE_OTHER_LEN = 500;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string) {
  return UUID_RE.test(s);
}

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
  if (!filename || !isAllowedCvFilename(filename)) {
    return Response.json(
      { error: "Only .pdf and .docx files are allowed." },
      { status: 400 },
    );
  }

  const ext = extensionFromFilename(filename)!;
  const jobOpeningId =
    typeof body.jobOpeningId === "string" && body.jobOpeningId.length > 0
      ? body.jobOpeningId
      : null;

  if (jobOpeningId && !isUuid(jobOpeningId)) {
    return Response.json({ error: "Invalid job opening id." }, { status: 400 });
  }

  const sourceRaw =
    typeof body.source === "string" ? body.source.trim() : "";
  if (!sourceRaw || !isCandidateSource(sourceRaw)) {
    return Response.json(
      { error: "Select a valid candidate source." },
      { status: 400 },
    );
  }

  let sourceOther: string | null = null;
  if (sourceRaw === "Other") {
    const detail =
      typeof body.sourceOther === "string" ? body.sourceOther.trim() : "";
    if (!detail) {
      return Response.json(
        { error: "Please describe the source when you select Other." },
        { status: 400 },
      );
    }
    if (detail.length > MAX_SOURCE_OTHER_LEN) {
      return Response.json(
        { error: `Source description must be at most ${MAX_SOURCE_OTHER_LEN} characters.` },
        { status: 400 },
      );
    }
    sourceOther = detail;
  }

  const { supabase } = auth;

  if (jobOpeningId) {
    const { data: job, error: jobErr } = await supabase
      .from("job_openings")
      .select("id")
      .eq("id", jobOpeningId)
      .maybeSingle();
    if (jobErr || !job) {
      return Response.json({ error: "Job opening not found." }, { status: 400 });
    }
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

  const candidateId = crypto.randomUUID();
  const folder = jobOpeningId ?? "unassigned";
  const storagePath = `${folder}/${candidateId}${ext}`;

  const { error: insErr } = await supabase.from("candidates").insert({
    id: candidateId,
    job_opening_id: jobOpeningId,
    cv_storage_path: storagePath,
    original_filename: filename,
    mime_type: typeof body.mimeType === "string" ? body.mimeType : null,
    parsing_status: "pending",
    source: sourceRaw,
    source_other: sourceOther,
  });

  if (insErr) {
    return Response.json({ error: insErr.message }, { status: 500 });
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(CV_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (signErr || !signed) {
    await admin.from("candidates").delete().eq("id", candidateId);
    return Response.json(
      { error: signErr?.message ?? "Could not create signed upload URL" },
      { status: 500 },
    );
  }

  return Response.json({
    candidateId,
    path: signed.path,
    token: signed.token,
    signedUrl: signed.signedUrl,
    maxBytes: MAX_CV_BYTES,
  });
}
