import { z } from "zod";

import { requireAdminForRequest } from "@/lib/admin/require-admin-request";

const isoDateTime = z.string().refine(
  (s) => s.length > 0 && Number.isFinite(Date.parse(s)),
  "Invalid ISO datetime",
);

const bodySchema = z.object({
  jobDescriptionId: z.coerce.number().int().positive(),
  interview_at: z.union([isoDateTime, z.null()]).optional(),
  onboarding_at: z.union([isoDateTime, z.null()]).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: candidateId } = await params;
  if (!candidateId) {
    return Response.json({ error: "Missing candidate id." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  const { jobDescriptionId, interview_at, onboarding_at } = parsed.data;
  if (interview_at === undefined && onboarding_at === undefined) {
    return Response.json(
      { error: "Provide interview_at and/or onboarding_at." },
      { status: 400 },
    );
  }

  const { data: openings, error: openingsError } = await auth.supabase
    .from("job_openings")
    .select("id")
    .eq("job_description_id", jobDescriptionId);

  if (openingsError) {
    return Response.json({ error: openingsError.message }, { status: 500 });
  }

  const allowedOpeningIds = new Set(
    (openings ?? []).map((o) => o.id as string).filter(Boolean),
  );
  if (allowedOpeningIds.size === 0) {
    return Response.json(
      { error: "No job opening is linked to this job description." },
      { status: 400 },
    );
  }

  const { data: row, error: rowErr } = await auth.supabase
    .from("candidates")
    .select("id, job_opening_id, status")
    .eq("id", candidateId)
    .maybeSingle();

  if (rowErr || !row) {
    return Response.json({ error: "Candidate not found." }, { status: 404 });
  }

  const jo = row.job_opening_id as string | null;
  if (!jo || !allowedOpeningIds.has(jo)) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const status = String(row.status);
  const patch: Record<string, unknown> = {};

  if (interview_at !== undefined) {
    if (status !== "Interviewing") {
      return Response.json(
        { error: "Interview time can only be set when status is Interviewing." },
        { status: 400 },
      );
    }
    patch.interview_at = interview_at;
  }

  if (onboarding_at !== undefined) {
    if (status !== "Offer") {
      return Response.json(
        { error: "Onboarding time can only be set when status is Offer." },
        { status: 400 },
      );
    }
    patch.onboarding_at = onboarding_at;
  }

  const { error: upErr } = await auth.supabase
    .from("candidates")
    .update(patch)
    .eq("id", candidateId);

  if (upErr) {
    return Response.json({ error: upErr.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
