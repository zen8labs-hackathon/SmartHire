import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import {
  CV_FOLDER_PREFIX,
  MAX_BATCH_FILES,
  isAllowedCvFilename,
} from "@/lib/candidates/upload-constants";
import { logApiError } from "@/lib/logger";
import { createSignedUploadUrl } from "@/lib/storage/s3";

export { MAX_BATCH_FILES };

type FileInput = {
  filename?: string;
  storageKey?: string;
  mimeType?: string | null;
};

type Body = {
  files?: FileInput[];
};

export type FileResult =
  | { filename: string; ok: true; storageKey: string; signedUrl: string }
  | { filename: string; ok: false; error: string };

export async function POST(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const files = Array.isArray(body.files) ? body.files : [];
  if (files.length === 0) {
    return Response.json({ error: "No files provided." }, { status: 400 });
  }
  if (files.length > MAX_BATCH_FILES) {
    return Response.json(
      { error: `A batch is limited to ${MAX_BATCH_FILES} files.` },
      { status: 400 },
    );
  }

  const results: FileResult[] = await Promise.all(
    files.map(async (file): Promise<FileResult> => {
      const filename =
        typeof file.filename === "string" ? file.filename.trim() : "";
      if (!filename || !isAllowedCvFilename(filename)) {
        return {
          filename: filename || "(unnamed)",
          ok: false,
          error: "Only .pdf and .docx files are allowed.",
        };
      }

      const storageKey =
        typeof file.storageKey === "string" ? file.storageKey.trim() : "";
      if (
        !storageKey.startsWith(CV_FOLDER_PREFIX) ||
        storageKey.includes("..")
      ) {
        return { filename, ok: false, error: "Invalid storage key." };
      }

      const mimeType = typeof file.mimeType === "string" ? file.mimeType : null;

      try {
        const signedUrl = await createSignedUploadUrl(storageKey, mimeType);
        return { filename, ok: true, storageKey, signedUrl };
      } catch (e) {
        logApiError("Upload-files: create signed URL failed", e, {
          path: "/api/admin/upload-files/sign-urls",
          filename,
        });
        return {
          filename,
          ok: false,
          error: "Could not create signed upload URL.",
        };
      }
    }),
  );

  return Response.json({ files: results });
}
