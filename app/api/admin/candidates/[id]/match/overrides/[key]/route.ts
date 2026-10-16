import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionForApplication } from "@/lib/authz/require-permission";
import { parseJdMatchRationale } from "@/lib/candidates/jd-match-rationale";
import {
  requirementKey,
  revertCriterionOverride,
  upsertCriterionOverride,
} from "@/lib/db/candidate-criterion-overrides";
import { getPool } from "@/lib/db/config/client";
import { getCvDetailVersionById } from "@/lib/db/cv-detail-versions";
import { logApiError } from "@/lib/logger";

type Ctx = { params: Promise<{ id: string; key: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z
  .object({
    verdict: z.enum(["met", "partial", "missing", "unclear"]),
    reason: z.string().trim().max(2000).nullish(),
  })
  .strict();

export async function PUT(request: Request, ctx: Ctx) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const { id, key } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid body." }, { status: 400 });
  }
  try {
    const perm = await requirePermissionForApplication(
      auth.access,
      "candidate.manage",
      id,
    );
    if (!perm.ok) return perm.response;
    const db = getPool();

    const cvId = perm.application.active_cv_version_id;
    const cv = cvId ? await getCvDetailVersionById(db, cvId) : null;
    const rationale = parseJdMatchRationale(
      cv?.jd_match_rationale ?? perm.application.jd_match_rationale,
    );
    const item = rationale?.requirements.find(
      (r) => requirementKey(r.requirement) === key,
    );
    if (!item) {
      return Response.json({ error: "Criterion not found." }, { status: 404 });
    }

    await upsertCriterionOverride(db, {
      campaignAppliedId: id,
      key,
      verdict: parsed.data.verdict,
      originalVerdict: item.verdict,
      reason: parsed.data.reason || null,
      authorId: auth.userId,
    });
    return Response.json({ ok: true });
  } catch (e) {
    logApiError("Criterion override: PUT failed", e, { applicationId: id, key });
    return Response.json({ error: "Failed to save override." }, { status: 500 });
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const { id, key } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  try {
    const perm = await requirePermissionForApplication(
      auth.access,
      "candidate.manage",
      id,
    );
    if (!perm.ok) return perm.response;
    const removed = await revertCriterionOverride(getPool(), id, key);
    if (!removed) {
      return Response.json({ error: "No override." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    logApiError("Criterion override: DELETE failed", e, { applicationId: id, key });
    return Response.json({ error: "Failed to revert override." }, { status: 500 });
  }
}
