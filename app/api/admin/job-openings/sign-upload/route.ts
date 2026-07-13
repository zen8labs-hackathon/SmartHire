import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import {
  extensionFromFilename,
  isAllowedJdFilename,
  MAX_JD_BYTES,
} from "@/lib/jd/upload-constants";
import { createSignedUploadUrl, deleteObject } from "@/lib/storage/s3";

type PostBody = {
  filename?: string;
  mimeType?: string | null;
  /** Storage key of a previously-signed-but-discarded upload, to delete before issuing a new one. */
  replacePath?: string | null;
};

// Historical URL path from the old 2-table (job_openings + job_descriptions)
// schema, kept as-is (see lib/db/jobs.ts's "no Draft status" note) -- this
// route no longer creates or reads any job_openings row; it's pure S3.
const JD_KEY_PREFIX = "jd/";

function isJdKey(key: string): boolean {
  return key.startsWith(JD_KEY_PREFIX) && !key.includes("..");
}

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
  if (!filename || !isAllowedJdFilename(filename)) {
    return Response.json(
      { error: "Only .pdf, .docx, and .txt files are allowed." },
      { status: 400 },
    );
  }

  const ext = extensionFromFilename(filename)!;
  const replacePath =
    typeof body.replacePath === "string" && body.replacePath.length > 0
      ? body.replacePath
      : null;

  if (replacePath && !isJdKey(replacePath)) {
    return Response.json({ error: "Invalid replace path." }, { status: 400 });
  }

  if (replacePath) {
    try {
      await deleteObject(replacePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not delete previous upload.";
      return Response.json({ error: message }, { status: 500 });
    }
  }

  const storagePath = `${JD_KEY_PREFIX}${crypto.randomUUID()}${ext}`;
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : null;

  try {
    const signedUrl = await createSignedUploadUrl(storagePath, mimeType);
    return Response.json({
      path: storagePath,
      signedUrl,
      maxBytes: MAX_JD_BYTES,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create signed upload URL.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const path = url.searchParams.get("path")?.trim() ?? "";

  if (!path || !isJdKey(path)) {
    return Response.json({ error: "Invalid or missing path." }, { status: 400 });
  }

  try {
    await deleteObject(path);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not delete file.";
    return Response.json({ error: message }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
