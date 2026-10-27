import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionForApplication } from "@/lib/authz/require-permission";
import { getPool } from "@/lib/db/config/client";
import { guardLegacyJob } from "@/lib/migration/legacy-flow-guard";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bodySchema = z.object({ accepted: z.boolean() });

type RouteContext = { params: Promise<{ id: string }> };

/**
 * HR records (or clears) that the candidate accepted the offer. Deliberately
 * leaves updated_at alone so the "days in stage" counter is unaffected.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  if (!auth.access.isHr) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id: candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const manageAccess = await requirePermissionForApplication(auth.access, "candidate.manage", candidateId);
  if (!manageAccess.ok) return manageAccess.response;
  const legacy = await guardLegacyJob(manageAccess.application.job_id);
  if (legacy) return legacy;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid request body." }, { status: 400 });

  const { rows } = await getPool().query<{ offer_accepted_at: Date | null }>(
    `UPDATE campaign_applied
     SET offer_accepted_at = CASE WHEN $2::boolean THEN COALESCE(offer_accepted_at, now()) ELSE NULL END
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING offer_accepted_at`,
    [candidateId, parsed.data.accepted],
  );
  if (!rows[0]) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ offerAcceptedAt: rows[0].offer_accepted_at?.toISOString() ?? null });
}
