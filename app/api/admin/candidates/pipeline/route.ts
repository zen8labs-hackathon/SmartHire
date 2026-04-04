import { z } from "zod";

import { requireAdminForRequest } from "@/lib/admin/require-admin-request";

const isoDateTime = z.string().refine(
  (s) => s.length > 0 && Number.isFinite(Date.parse(s)),
  "Invalid ISO datetime",
);

const pipelineUpdateSchema = z.discriminatedUnion("status", [
  z.object({
    id: z.string().uuid(),
    status: z.literal("Interviewing"),
    interview_at: isoDateTime,
  }),
  z.object({
    id: z.string().uuid(),
    status: z.literal("Offer"),
    onboarding_at: isoDateTime,
  }),
  z.object({
    id: z.string().uuid(),
    status: z.literal("Failed"),
  }),
]);

const bodySchema = z.object({
  jobDescriptionId: z.coerce.number().int().positive(),
  updates: z.array(pipelineUpdateSchema).min(1).max(100),
});

export async function POST(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

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

  const { jobDescriptionId, updates } = parsed.data;

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

  const uniqueIds = [...new Set(updates.map((u) => u.id))];
  const { data: existing, error: loadError } = await auth.supabase
    .from("candidates")
    .select("id, job_opening_id")
    .in("id", uniqueIds);

  if (loadError) {
    return Response.json({ error: loadError.message }, { status: 500 });
  }

  if (!existing || existing.length !== uniqueIds.length) {
    return Response.json(
      { error: "One or more candidates were not found." },
      { status: 404 },
    );
  }

  for (const row of existing) {
    const jo = row.job_opening_id as string | null;
    if (!jo || !allowedOpeningIds.has(jo)) {
      return Response.json(
        {
          error:
            "One or more candidates are not assigned to a job opening for this job description.",
        },
        { status: 403 },
      );
    }
  }

  for (const u of updates) {
    const patch: Record<string, unknown> = { status: u.status };
    if (u.status === "Interviewing") {
      patch.interview_at = u.interview_at;
      patch.onboarding_at = null;
    } else if (u.status === "Offer") {
      patch.onboarding_at = u.onboarding_at;
    } else {
      patch.interview_at = null;
      patch.onboarding_at = null;
    }

    const { error: upErr } = await auth.supabase
      .from("candidates")
      .update(patch)
      .eq("id", u.id);

    if (upErr) {
      return Response.json({ error: upErr.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true, updated: updates.length });
}
