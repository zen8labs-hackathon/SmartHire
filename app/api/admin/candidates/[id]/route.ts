import { z } from "zod";

import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { ADMIN_CANDIDATES_SELECT } from "@/lib/candidates/admin-select";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { enrichCandidatesWithJobOpenings } from "@/lib/candidates/enrich-candidates-job-openings";
import { isPipelineTransitionAllowed } from "@/lib/candidates/pipeline-allowed-transitions";
import { buildCandidatePipelinePatch } from "@/lib/candidates/pipeline-transition";
import { CV_BUCKET } from "@/lib/candidates/upload-constants";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isoDateTime = z.string().refine(
  (s) => s.length > 0 && Number.isFinite(Date.parse(s)),
  "Invalid ISO datetime",
);

const patchBodySchema = z.object({
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

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Updates pipeline status (and optional interview/onboarding times) with the same
 * transition rules as POST /api/admin/candidates/pipeline.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  const u = parsed.data;

  const { data: existing, error: loadError } = await auth.supabase
    .from("candidates")
    .select("id, status, interview_at, onboarding_at")
    .eq("id", candidateId)
    .maybeSingle();

  if (loadError) {
    return Response.json({ error: loadError.message }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const prev = {
    status: String(existing.status),
    interview_at: (existing.interview_at as string | null) ?? null,
    onboarding_at: (existing.onboarding_at as string | null) ?? null,
  };

  if (!isPipelineTransitionAllowed(prev.status, u.status)) {
    return Response.json(
      {
        error: `Invalid status transition: ${prev.status} → ${u.status}.`,
      },
      { status: 400 },
    );
  }

  const patch = buildCandidatePipelinePatch(prev, u);

  const { error: upErr } = await auth.supabase
    .from("candidates")
    .update(patch)
    .eq("id", candidateId);

  if (upErr) {
    return Response.json({ error: upErr.message }, { status: 500 });
  }

  const { data: row, error: selErr } = await auth.supabase
    .from("candidates")
    .select(ADMIN_CANDIDATES_SELECT)
    .eq("id", candidateId)
    .maybeSingle();

  if (selErr || !row) {
    return Response.json(
      { error: selErr?.message ?? "Could not load updated candidate." },
      { status: 500 },
    );
  }

  const [enriched] = await enrichCandidatesWithJobOpenings(auth.supabase, [
    row as unknown as CandidateDbRow,
  ]);

  return Response.json({ candidate: enriched });
}

/**
 * Deletes the candidate row and removes the CV file from storage when present.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const { data: row, error: fetchErr } = await auth.supabase
    .from("candidates")
    .select("cv_storage_path")
    .eq("id", candidateId)
    .maybeSingle();

  if (fetchErr) {
    return Response.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!row) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const path = (row.cv_storage_path as string | null | undefined)?.trim();
  if (path) {
    const { error: storageErr } = await auth.supabase.storage
      .from(CV_BUCKET)
      .remove([path]);
    if (storageErr) {
      return Response.json(
        { error: storageErr.message ?? "Could not remove CV file from storage." },
        { status: 500 },
      );
    }
  }

  const { error: delErr } = await auth.supabase
    .from("candidates")
    .delete()
    .eq("id", candidateId);

  if (delErr) {
    return Response.json({ error: delErr.message }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
