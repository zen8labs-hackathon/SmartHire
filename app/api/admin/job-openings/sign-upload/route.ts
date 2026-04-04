import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import {
  JD_BUCKET,
  extensionFromFilename,
  isAllowedJdFilename,
  MAX_JD_BYTES,
} from "@/lib/jd/upload-constants";
import { createAdminClient } from "@/lib/supabase/admin";

type PostBody = {
  filename?: string;
  mimeType?: string | null;
  replaceJobOpeningId?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string) {
  return UUID_RE.test(s);
}

async function deleteDraftJobAndFile(
  admin: ReturnType<typeof createAdminClient>,
  supabase: SupabaseClient,
  jobOpeningId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const { data: row, error: selErr } = await supabase
    .from("job_openings")
    .select("id, status, jd_storage_path")
    .eq("id", jobOpeningId)
    .maybeSingle();

  if (selErr) {
    return {
      ok: false,
      response: Response.json({ error: selErr.message }, { status: 500 }),
    };
  }
  if (!row || row.status !== "Draft" || !row.jd_storage_path) {
    return {
      ok: false,
      response: Response.json(
        { error: "Draft job opening not found or not removable." },
        { status: 400 },
      ),
    };
  }

  await admin.storage.from(JD_BUCKET).remove([row.jd_storage_path]);

  const { error: delErr } = await supabase
    .from("job_openings")
    .delete()
    .eq("id", jobOpeningId);
  if (delErr) {
    return {
      ok: false,
      response: Response.json({ error: delErr.message }, { status: 500 }),
    };
  }
  return { ok: true };
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
  const replaceId =
    typeof body.replaceJobOpeningId === "string" && body.replaceJobOpeningId.length > 0
      ? body.replaceJobOpeningId
      : null;

  if (replaceId && !isUuid(replaceId)) {
    return Response.json({ error: "Invalid job opening id." }, { status: 400 });
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

  const { supabase } = auth;

  if (replaceId) {
    const removed = await deleteDraftJobAndFile(admin, supabase, replaceId);
    if (!removed.ok) return removed.response;
  }

  const jobOpeningId = crypto.randomUUID();
  const fileId = crypto.randomUUID();
  const storagePath = `jd/${jobOpeningId}/${fileId}${ext}`;

  const { error: insErr } = await supabase.from("job_openings").insert({
    id: jobOpeningId,
    title: "Untitled draft",
    status: "Draft",
    jd_storage_path: storagePath,
    jd_original_filename: filename,
    jd_mime_type: typeof body.mimeType === "string" ? body.mimeType : null,
  });

  if (insErr) {
    return Response.json({ error: insErr.message }, { status: 500 });
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(JD_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (signErr || !signed) {
    await admin.from("job_openings").delete().eq("id", jobOpeningId);
    return Response.json(
      { error: signErr?.message ?? "Could not create signed upload URL" },
      { status: 500 },
    );
  }

  return Response.json({
    jobOpeningId,
    path: signed.path,
    token: signed.token,
    signedUrl: signed.signedUrl,
    maxBytes: MAX_JD_BYTES,
  });
}

export async function DELETE(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const jobOpeningId = url.searchParams.get("jobOpeningId")?.trim() ?? "";

  if (!jobOpeningId || !isUuid(jobOpeningId)) {
    return Response.json({ error: "Invalid or missing jobOpeningId." }, { status: 400 });
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

  const { supabase } = auth;
  const removed = await deleteDraftJobAndFile(admin, supabase, jobOpeningId);
  if (!removed.ok) return removed.response;

  return new Response(null, { status: 204 });
}
