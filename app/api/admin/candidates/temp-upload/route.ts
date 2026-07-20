import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import {
  CV_TEMP_KEY_PREFIX,
  MAX_CV_BYTES,
  extensionFromFilename,
  isAllowedCvFilename,
} from "@/lib/candidates/upload-constants";
import { createSignedUploadUrl } from "@/lib/storage/s3";

type Body = {
  filename?: string;
  mimeType?: string | null;
};

/**
 * Signs a PUT URL for a temp S3 key -- no DB rows created yet (CV9X7R:
 * dedupe/basic-info confirmation happens against the temp object before any
 * `candidates`/`campaign_applied`/`cv_detail_versions` row exists). Pair with
 * `POST .../temp-upload/confirm` once the file is uploaded.
 */
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
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : null;
  const tempKey = `${CV_TEMP_KEY_PREFIX}${crypto.randomUUID()}${ext}`;

  try {
    const signedUrl = await createSignedUploadUrl(tempKey, mimeType);
    return Response.json({ tempKey, signedUrl, maxBytes: MAX_CV_BYTES });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create signed upload URL.";
    return Response.json({ error: message }, { status: 500 });
  }
}
