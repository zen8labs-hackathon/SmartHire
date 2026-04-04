import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { ADMIN_CANDIDATES_SELECT } from "@/lib/candidates/admin-select";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { enrichCandidatesWithJobOpenings } from "@/lib/candidates/enrich-candidates-job-openings";

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
    .select(ADMIN_CANDIDATES_SELECT)
    .order("cv_uploaded_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (openingIds) {
    query = query.in("job_opening_id", openingIds);
  }

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as CandidateDbRow[];
  const enriched = await enrichCandidatesWithJobOpenings(auth.supabase, rows);

  return Response.json({ candidates: enriched });
}
