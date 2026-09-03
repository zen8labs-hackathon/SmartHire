import { z } from "zod";

import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { mergeCvVersionInto } from "@/lib/candidates/merge-candidate-into";
import { getCandidateById } from "@/lib/db/candidates";
import { getPool } from "@/lib/db/config/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ candidateId: string }> };

/** Trimmed string; empty string collapses to `null` (an explicit clear).
 * Mirrors the `PATCH .../profile/:candidateId` body schema. */
const nullableString = z
  .string()
  .trim()
  .transform((s) => (s.length === 0 ? null : s))
  .nullable();

const patchSchema = z
  .object({
    name: nullableString.optional(),
    email: nullableString.optional(),
    phone: nullableString.optional(),
    degree: nullableString.optional(),
    education: nullableString.optional(),
    role: nullableString.optional(),
    experienceYears: z.number().min(0).max(80).nullable().optional(),
    skills: z.array(z.string().trim().min(1)).max(100).optional(),
  })
  .strict();

const bodySchema = z
  .object({
    /** The chosen CV version of the duplicate candidate to fold into this
     * one. `cv_detail_versions.id` is a bigint, not a UUID -- digits only. */
    cvVersionId: z.string().regex(/^\d+$/),
    patch: patchSchema.optional(),
  })
  .strict();

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Invalid candidate ID" }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const { cvVersionId, patch } = parsed.data;

  if (patch && typeof patch.email === "string") {
    patch.email = patch.email.toLowerCase();
  }

  const canonical = await getCandidateById(getPool(), candidateId);
  if (!canonical) {
    return Response.json({ error: "Invalid candidate ID" }, { status: 400 });
  }

  const result = await mergeCvVersionInto({
    canonicalCandidateId: candidateId,
    cvVersionId,
    createdBy: auth.userId,
    patch,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({
    candidate: result.canonicalCandidate,
    canonicalCandidateId: result.canonicalCandidateId,
    duplicateCandidateId: result.duplicateCandidateId,
    duplicateCandidateDeleted: result.duplicateCandidateDeleted,
    targetCampaignAppliedId: result.targetCampaignAppliedId,
    mergedCvVersionId: result.mergedCvVersionId,
    sourceDisposition: result.sourceDisposition,
  });
}
