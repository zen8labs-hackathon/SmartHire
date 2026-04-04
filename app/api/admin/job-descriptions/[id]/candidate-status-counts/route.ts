import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { ALL_PIPELINE_STATUSES } from "@/lib/candidates/pipeline-allowed-transitions";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: raw } = await params;
  const jdId = Number(raw);
  if (!Number.isInteger(jdId) || jdId <= 0) {
    return Response.json({ error: "Invalid job description id." }, { status: 400 });
  }

  const { data: openings, error: openingsError } = await auth.supabase
    .from("job_openings")
    .select("id")
    .eq("job_description_id", jdId);

  if (openingsError) {
    return Response.json({ error: openingsError.message }, { status: 500 });
  }

  const openingIds = (openings ?? [])
    .map((o) => o.id as string)
    .filter(Boolean);

  const counts: Record<string, number> = {};
  for (const s of ALL_PIPELINE_STATUSES) {
    counts[s] = 0;
  }

  if (openingIds.length === 0) {
    return Response.json({ counts });
  }

  const { data: rows, error } = await auth.supabase
    .from("candidates")
    .select("status")
    .in("job_opening_id", openingIds);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const allowed = new Set<string>(ALL_PIPELINE_STATUSES);
  for (const row of rows ?? []) {
    const st = String((row as { status: string }).status);
    if (allowed.has(st)) {
      counts[st] += 1;
    }
  }

  return Response.json({ counts });
}
