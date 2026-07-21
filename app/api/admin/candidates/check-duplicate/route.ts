import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";

import {
  runDedupePrecheck,
  type PrecheckSignals,
} from "@/lib/candidates/check-duplicate-precheck";
import { getPool } from "@/lib/db/config/client";

type Body = {
  jobOpeningId?: string | null;
  cvFileSha256?: string | null;
  cvContentSha256?: string | null;
  email?: string | null;
  phone?: string | null;
};

export async function POST(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const jobOpeningId =
    typeof body.jobOpeningId === "string" && body.jobOpeningId.length > 0
      ? body.jobOpeningId
      : null;
  if (jobOpeningId) {
    const manageAccess = await requirePermissionOnJob(
      auth.access,
      "candidate.manage",
      jobOpeningId,
    );
    if (!manageAccess.ok) return manageAccess.response;
  }

  const signals: PrecheckSignals = {
    jobOpeningId,
    email: typeof body.email === "string" && body.email.trim() ? body.email.trim() : null,
    phone: typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null,
    cvFileSha256:
      typeof body.cvFileSha256 === "string" && body.cvFileSha256.trim()
        ? body.cvFileSha256.trim()
        : null,
    cvContentSha256:
      typeof body.cvContentSha256 === "string" && body.cvContentSha256.trim()
        ? body.cvContentSha256.trim()
        : null,
  };

  try {
    const { duplicateCandidates, duplicateNewUpload } = await runDedupePrecheck(
      getPool(),
      signals,
    );
    return Response.json({ duplicateCandidates, duplicateNewUpload });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Deduplication error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
