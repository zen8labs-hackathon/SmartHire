import { z } from "zod";
import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { linkApplicationToExistingCandidate } from "@/lib/candidates/merge-duplicate-application";
import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import { getPool } from "@/lib/db/config/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    existingCandidateId: z.string().regex(UUID_RE),
  })
  .strict();

/**
 * Repoints a just-uploaded, already-parsed application (for a *different*
 * job than any existing match) onto an existing person, instead of leaving
 * it under the blank `candidates` row `sign-upload` created for it. See
 * `PUT /api/admin/candidates/[id]/update-with-history` for the same-job
 * equivalent, which merges the CV into the existing application instead.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: newCampaignAppliedId } = await params;
  if (!newCampaignAppliedId || !UUID_RE.test(newCampaignAppliedId)) {
    return Response.json({ error: "Invalid candidate id." }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const { existingCandidateId } = parsed.data;

  try {
    const result = await linkApplicationToExistingCandidate(
      newCampaignAppliedId,
      existingCandidateId,
    );
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    const enriched = await getCampaignAppliedAdminRowById(getPool(), newCampaignAppliedId);
    if (!enriched) {
      return Response.json(
        { error: "Could not load updated candidate." },
        { status: 500 },
      );
    }

    return Response.json({ candidate: enriched });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to link candidate profile.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
