import { requireAdminForRequest } from "@/lib/admin/require-admin-request";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Invalid candidate id." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("candidate_cv_replacements")
    .select(
      "id, previous_candidate_id, replacement_candidate_id, previous_status, new_status, matched_on, previous_filename, previous_cv_uploaded_at, replaced_by_email, replaced_at",
    )
    .eq("replacement_candidate_id", candidateId)
    .order("replaced_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const history = (data ?? []).map((row) => ({
    id: Number(row.id),
    previousCandidateId: String(row.previous_candidate_id),
    replacementCandidateId: String(row.replacement_candidate_id),
    previousStatus: String(row.previous_status ?? "New"),
    newStatus: String(row.new_status ?? "New"),
    matchedOn: String(row.matched_on ?? "email_or_phone"),
    previousFilename: (row.previous_filename as string | null) ?? null,
    previousCvUploadedAt: (row.previous_cv_uploaded_at as string | null) ?? null,
    replacedByEmail: (row.replaced_by_email as string | null) ?? null,
    replacedAt: (row.replaced_at as string | null) ?? null,
  }));

  return Response.json({ history });
}
