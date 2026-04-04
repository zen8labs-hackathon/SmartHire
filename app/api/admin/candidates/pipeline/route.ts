import { z } from "zod";

import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { isPipelineTransitionAllowed } from "@/lib/candidates/pipeline-allowed-transitions";
import { buildCandidatePipelinePatch } from "@/lib/candidates/pipeline-transition";

const isoDateTime = z.string().refine(
  (s) => s.length > 0 && Number.isFinite(Date.parse(s)),
  "Invalid ISO datetime",
);

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum([
    "New",
    "Shortlisted",
    "Interviewing",
    "Offer",
    "Failed",
    "Matched",
    "Rejected",
  ]),
  interview_at: z.union([isoDateTime, z.null()]).optional(),
  onboarding_at: z.union([isoDateTime, z.null()]).optional(),
});

const bodySchema = z.object({
  jobDescriptionId: z.coerce.number().int().positive(),
  updates: z.array(updateSchema).min(1).max(100),
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
    .select("id, job_opening_id, status, interview_at, onboarding_at")
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

  const byId = new Map(
    existing.map((row) => [
      row.id as string,
      {
        job_opening_id: row.job_opening_id as string | null,
        status: String(row.status),
        interview_at: (row.interview_at as string | null) ?? null,
        onboarding_at: (row.onboarding_at as string | null) ?? null,
      },
    ]),
  );

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
    const prev = byId.get(u.id);
    if (!prev) {
      return Response.json({ error: "Candidate not found." }, { status: 404 });
    }
    if (!isPipelineTransitionAllowed(prev.status, u.status)) {
      return Response.json(
        {
          error: `Invalid status transition: ${prev.status} → ${u.status}.`,
        },
        { status: 400 },
      );
    }
    const patch = buildCandidatePipelinePatch(
      {
        status: prev.status,
        interview_at: prev.interview_at,
        onboarding_at: prev.onboarding_at,
      },
      u,
    );

    const { error: upErr } = await auth.supabase
      .from("candidates")
      .update(patch)
      .eq("id", u.id);

    if (upErr) {
      return Response.json({ error: upErr.message }, { status: 500 });
    }

    const nextInterview = patch.interview_at as string | null | undefined;
    const nextOnboarding = patch.onboarding_at as string | null | undefined;
    const nextStatus = patch.status as string;
    byId.set(u.id, {
      job_opening_id: prev.job_opening_id,
      status: nextStatus,
      interview_at:
        nextInterview !== undefined ? nextInterview : prev.interview_at,
      onboarding_at:
        nextOnboarding !== undefined ? nextOnboarding : prev.onboarding_at,
    });
  }

  return Response.json({ ok: true, updated: updates.length });
}
