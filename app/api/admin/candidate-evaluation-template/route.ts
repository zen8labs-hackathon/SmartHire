import { CANDIDATE_EVAL_TEMPLATE_BUCKET } from "@/lib/admin/candidate-evaluation-template-constants";
import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("candidate_evaluation_template")
    .select("storage_path, original_filename, mime_type, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const row = data as {
    storage_path: string | null;
    original_filename: string | null;
    mime_type: string | null;
    updated_at: string;
  } | null;

  return Response.json({
    hasFile: Boolean(row?.storage_path),
    originalFilename: row?.original_filename ?? null,
    mimeType: row?.mime_type ?? null,
    updatedAt: row?.updated_at ?? null,
  });
}

export async function DELETE(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json(
      { error: "Server missing service role key; cannot remove file." },
      { status: 500 },
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

  const storagePath = (row as { storage_path: string | null } | null)?.storage_path;
  if (storagePath) {
    const { error: rmErr } = await admin.storage
      .from(CANDIDATE_EVAL_TEMPLATE_BUCKET)
      .remove([storagePath]);
    if (rmErr) {
      return Response.json({ error: rmErr.message }, { status: 500 });
    }
  }

  const { error: upErr } = await auth.supabase
    .from("candidate_evaluation_template")
    .update({
      storage_path: null,
      original_filename: null,
      mime_type: null,
      updated_by: auth.userId,
    })
    .eq("id", 1);

  if (upErr) {
    return Response.json({ error: upErr.message }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
