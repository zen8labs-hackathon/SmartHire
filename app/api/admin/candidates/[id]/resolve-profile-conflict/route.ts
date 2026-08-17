import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { canViewSalary } from "@/lib/authz/can";
import { redactAdminRowSalaryForAccess } from "@/lib/authz/redact-salary";
import { requirePermissionForApplication } from "@/lib/authz/require-permission";
import { z } from "zod";

import { resolveProfileConflict } from "@/lib/candidates/resolve-profile-conflict";
import { candidateProfilePatchSchema } from "@/lib/candidates/candidate-profile-patch";
import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import { getPool } from "@/lib/db/config/client";
import { isUniqueViolation } from "@/lib/db/query-helpers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    targetCandidateId: z.string().regex(UUID_RE),
    patch: candidateProfilePatchSchema,
  })
  .strict();

/**
 * Confirms a merge offered by `PATCH .../profile`'s 409 conflict response:
 * HR is telling us the application at `[id]` actually belongs to
 * `targetCandidateId`, not the candidate it's currently under. Moves just
 * that one application onto the target candidate and applies the rest of
 * the pending edit in the same transaction -- see
 * `lib/candidates/resolve-profile-conflict.ts` for the actual logic.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: editedCampaignAppliedId } = await params;
  if (!editedCampaignAppliedId || !UUID_RE.test(editedCampaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const manageAccess = await requirePermissionForApplication(
    auth.access,
    "candidate.manage",
    editedCampaignAppliedId,
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
  const { targetCandidateId, patch } = parsed.data;

  if (patch.expected_salary !== undefined) {
    const allowed = await canViewSalary(
      getPool(),
      auth.access,
      manageAccess.application.job_id,
    );
    if (!allowed) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const result = await resolveProfileConflict({
      editedCampaignAppliedId,
      targetCandidateId,
      patch,
      createdBy: auth.userId,
    });
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    const db = getPool();
    const enriched = await getCampaignAppliedAdminRowById(db, result.survivingCampaignAppliedId);
    if (!enriched) {
      return Response.json(
        { error: "Could not load updated candidate." },
        { status: 500 },
      );
    }

    return Response.json({
      candidate: await redactAdminRowSalaryForAccess(db, auth.access, enriched),
      survivingCampaignAppliedId: result.survivingCampaignAppliedId,
      applicationIdChanged: result.survivingCampaignAppliedId !== editedCampaignAppliedId,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return Response.json(
        {
          error:
            "Another candidate already uses this email or phone number. Use different contact info.",
        },
        { status: 409 },
      );
    }
    const msg = err instanceof Error ? err.message : "Failed to merge candidate profile.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
