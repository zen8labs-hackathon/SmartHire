import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { redactAdminRowSalaryForAccess } from "@/lib/authz/redact-salary";
import { requirePermissionForApplication } from "@/lib/authz/require-permission";
import { z } from "zod";

import { reassignCvVersionToApplication } from "@/lib/candidates/reassign-cv-version";
import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { isUniqueViolation } from "@/lib/db/query-helpers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    targetCampaignAppliedId: z.string().regex(UUID_RE),
    /** Defaults to the source application's current active version. */
    cvVersionId: z
      .string()
      .regex(/^\d+$/)
      .optional(),
    note: z
      .string()
      .max(500)
      .optional()
      .transform((s) => (s === undefined ? undefined : s.trim() || undefined)),
  })
  .strict();

/**
 * Admin recovery action: HR confirms a CV on `[id]` actually belongs to a
 * different, existing application for the same job (`targetCampaignAppliedId`)
 * -- e.g. AI parsing extracted a wrong-but-real email/phone that matched
 * someone else, so the upload dedupe auto-merged it onto the wrong person.
 * See `lib/candidates/reassign-cv-version.ts` for what this actually does.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: sourceCampaignAppliedId } = await params;
  if (!sourceCampaignAppliedId || !UUID_RE.test(sourceCampaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const sourceAccess = await requirePermissionForApplication(
    auth.access,
    "candidate.manage",
    sourceCampaignAppliedId,
  );
  if (!sourceAccess.ok) return sourceAccess.response;

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
  const { targetCampaignAppliedId, cvVersionId, note } = parsed.data;

  const targetAccess = await requirePermissionForApplication(
    auth.access,
    "candidate.manage",
    targetCampaignAppliedId,
  );
  if (!targetAccess.ok) return targetAccess.response;

  try {
    const result = await withTransaction((tx) =>
      reassignCvVersionToApplication(tx, {
        sourceCampaignAppliedId,
        cvVersionId,
        targetCampaignAppliedId,
        changeSummary: note ?? null,
        createdBy: auth.userId,
      }),
    );
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    const db = getPool();
    const enrichedTarget = await getCampaignAppliedAdminRowById(db, targetCampaignAppliedId);
    if (!enrichedTarget) {
      return Response.json(
        { error: "Could not load updated candidate." },
        { status: 500 },
      );
    }

    return Response.json({
      candidate: await redactAdminRowSalaryForAccess(db, auth.access, enrichedTarget),
      newCvVersionId: result.newCvVersionId,
      sourceActiveCvVersionId: result.sourceActiveCvVersionId,
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
    const msg = err instanceof Error ? err.message : "Failed to reassign CV version.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
