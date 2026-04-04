import { requireAdminForRequest } from "@/lib/admin/require-admin-request";

export async function GET(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("candidates")
    .select(
      "id, job_opening_id, cv_storage_path, original_filename, mime_type, parsing_status, parsing_error, parsed_payload, name, role, avatar_url, experience_years, skills, degree, school, status, chapter, source, source_other, jd_match_score, jd_match_status, jd_match_error, jd_match_rationale, created_at, updated_at",
    )
    .order("jd_match_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ candidates: data ?? [] });
}
