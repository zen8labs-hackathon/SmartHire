import { z } from "zod";
import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { mergeDuplicateApplicationIntoExisting } from "@/lib/candidates/merge-duplicate-application";
import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import { getPool } from "@/lib/db/config/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    newCandidateId: z.string().regex(UUID_RE),
    matchedOn: z
      .enum(["email", "phone", "email_or_phone", "cv_content", "cv_file"])
      .optional(),
  })
  .strict();

export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: existingCampaignAppliedId } = await params;
  if (!existingCampaignAppliedId || !UUID_RE.test(existingCampaignAppliedId)) {
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
  const { newCandidateId: newCampaignAppliedId, matchedOn } = parsed.data;
  if (newCampaignAppliedId === existingCampaignAppliedId) {
    return Response.json(
      { error: "newCandidateId must differ from the existing candidate id." },
      { status: 400 },
    );
  }

  try {
    const result = await mergeDuplicateApplicationIntoExisting(
      existingCampaignAppliedId,
      newCampaignAppliedId,
      matchedOn ?? null,
      auth.userId,
    );
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    const enriched = await getCampaignAppliedAdminRowById(getPool(), existingCampaignAppliedId);
    if (!enriched) {
      return Response.json(
        { error: "Could not load updated candidate." },
        { status: 500 },
      );
    }

    return Response.json({ candidate: enriched });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to merge candidate profile.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
