import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { logApiError } from "@/lib/logger";
import { createSignedUploadUrl } from "@/lib/storage/s3";
import { buildStorageFilename } from "@/lib/storage/storage-key";

const EMAIL_ATTACHMENT_KEY_PREFIX = "email-attachments/";
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

type Body = {
  filename?: string;
  mimeType?: string | null;
  fileSize?: number;
};

export async function POST(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  if (!filename) {
    return Response.json({ error: "filename is required." }, { status: 400 });
  }
  if (typeof body.fileSize === "number" && body.fileSize > MAX_FILE_SIZE_BYTES) {
    return Response.json(
      { error: "Attachment exceeds the 15MB limit." },
      { status: 400 },
    );
  }

  const dotIndex = filename.lastIndexOf(".");
  const ext = dotIndex >= 0 ? filename.slice(dotIndex) : "";
  const baseName = dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
  const storagePath = `${EMAIL_ATTACHMENT_KEY_PREFIX}${buildStorageFilename(baseName, ext)}`;
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : null;

  try {
    const signedUrl = await createSignedUploadUrl(storagePath, mimeType);
    return Response.json({ path: storagePath, signedUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create signed upload URL.";
    logApiError("Email attachment sign-upload failed", err, { storagePath });
    return Response.json({ error: message }, { status: 500 });
  }
}
