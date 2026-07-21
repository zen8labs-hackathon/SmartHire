import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionForApplication } from "@/lib/authz/require-permission";
import { z } from "zod";

import { mergeDuplicateApplicationIntoExisting } from "@/lib/candidates/merge-duplicate-application";
import { isUniqueViolation } from "@/lib/db/query-helpers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  previousCandidateId: z.string().regex(UUID_RE),
  matchedOn: z
    .enum(["email", "phone", "email_or_phone", "cv_content", "cv_file"])
    .optional(),
});

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: newCampaignAppliedId } = await params;
  if (!newCampaignAppliedId || !UUID_RE.test(newCampaignAppliedId)) {
    return Response.json({ error: "Invalid candidate id." }, { status: 400 });
  }

  const manageAccess = await requirePermissionForApplication(
    auth.access,
    "candidate.manage",
    newCampaignAppliedId,
  );
  if (!manageAccess.ok) return manageAccess.response;

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
  const { previousCandidateId: existingCampaignAppliedId, matchedOn } = parsed.data;

  if (existingCampaignAppliedId === newCampaignAppliedId) {
    return Response.json({ error: "Cannot replace with the same candidate." }, { status: 400 });
  }

  try {
    const result = await mergeDuplicateApplicationIntoExisting(
      existingCampaignAppliedId,
      newCampaignAppliedId,
      matchedOn ?? "email_or_phone",
      auth.userId,
    );
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json({ ok: true });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return Response.json(
        {
          error:
            "This CV's email or phone number already belongs to another candidate profile. Refresh and check for duplicates before retrying.",
        },
        { status: 409 },
      );
    }
    const msg = err instanceof Error ? err.message : "Failed to replace candidate CV.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
