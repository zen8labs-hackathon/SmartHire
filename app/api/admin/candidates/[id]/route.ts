import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { CV_BUCKET } from "@/lib/candidates/upload-constants";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Deletes the candidate row and removes the CV file from storage when present.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const { data: row, error: fetchErr } = await auth.supabase
    .from("candidates")
    .select("cv_storage_path")
    .eq("id", candidateId)
    .maybeSingle();

  if (fetchErr) {
    return Response.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!row) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const path = (row.cv_storage_path as string | null | undefined)?.trim();
  if (path) {
    const { error: storageErr } = await auth.supabase.storage
      .from(CV_BUCKET)
      .remove([path]);
    if (storageErr) {
      return Response.json(
        { error: storageErr.message ?? "Could not remove CV file from storage." },
        { status: 500 },
      );
    }
  }

  const { error: delErr } = await auth.supabase
    .from("candidates")
    .delete()
    .eq("id", candidateId);

  if (delErr) {
    return Response.json({ error: delErr.message }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
