import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { JD_BUCKET } from "@/lib/jd/upload-constants";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(_request);
  if (!auth.ok) return auth.response;

  const { id: idParam } = await params;
  const jdId = Number(idParam);
  if (!Number.isInteger(jdId) || jdId <= 0) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const { data: jd } = await auth.supabase
    .from("job_descriptions")
    .select("id")
    .eq("id", jdId)
    .maybeSingle();

  if (!jd) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const { data: opening, error } = await auth.supabase
    .from("job_openings")
    .select("jd_storage_path")
    .eq("job_description_id", jdId)
    .not("jd_storage_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const path = opening?.jd_storage_path as string | undefined;
  if (!path) {
    return Response.json({ error: "No JD file on record." }, { status: 404 });
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
    .from(JD_BUCKET)
    .createSignedUrl(path, 120);

  if (signErr || !signed?.signedUrl) {
    return Response.json(
      { error: signErr?.message ?? "Could not create download link." },
      { status: 500 },
    );
  }

  return Response.redirect(signed.signedUrl, 302);
}
