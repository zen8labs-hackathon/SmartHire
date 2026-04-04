import { requireAdminForRequest } from "@/lib/admin/require-admin-request";

const CANDIDATES_SELECT =
  "id, job_opening_id, cv_storage_path, original_filename, mime_type, parsing_status, parsing_error, parsed_payload, name, role, avatar_url, experience_years, skills, degree, school, status, chapter, source, source_other, jd_match_score, jd_match_status, jd_match_error, jd_match_rationale, created_at, updated_at";

export async function GET(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const jdParam = url.searchParams.get("jobDescriptionId");

  let openingIds: string[] | null = null;
  if (jdParam != null && jdParam !== "") {
    const jdId = Number(jdParam);
    if (!Number.isInteger(jdId) || jdId <= 0) {
      return Response.json(
        { error: "Invalid jobDescriptionId" },
        { status: 400 },
      );
    }
    const { data: openings, error: openingsError } = await auth.supabase
      .from("job_openings")
      .select("id")
      .eq("job_description_id", jdId);

    if (openingsError) {
      return Response.json({ error: openingsError.message }, { status: 500 });
    }
    openingIds = (openings ?? [])
      .map((o) => o.id as string)
      .filter(Boolean);
    if (openingIds.length === 0) {
      return Response.json({ candidates: [] });
    }
  }

  let query = auth.supabase
    .from("candidates")
    .select(CANDIDATES_SELECT)
    .order("jd_match_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (openingIds) {
    query = query.in("job_opening_id", openingIds);
  }

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ candidates: data ?? [] });
}
