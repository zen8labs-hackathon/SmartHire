import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { CV_BUCKET } from "@/lib/candidates/upload-constants";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const { data: row, error } = await auth.supabase
    .from("candidates")
    .select("cv_storage_path")
    .eq("id", candidateId)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const path = (row?.cv_storage_path as string | null | undefined)?.trim();
  if (!path) {
    return Response.json({ error: "No CV file on record." }, { status: 404 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json(
      { error: "Server cannot sign storage URLs." },
      { status: 500 },
    );
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(CV_BUCKET)
    .createSignedUrl(path, 120);

  if (signErr || !signed?.signedUrl) {
    return Response.json(
      { error: signErr?.message ?? "Could not create download link." },
      { status: 500 },
    );
  }

  return Response.redirect(signed.signedUrl, 302);
}
