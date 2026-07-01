import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import {
  evaluateDuplicatePrecheck,
  shouldQueryForPrecheck,
  type PrecheckSignals,
} from "@/lib/candidates/check-duplicate-precheck";
import type { CandidateDedupeRow } from "@/lib/candidates/duplicate-detection";

type Body = {
  jobOpeningId?: string | null;
  cvFileSha256?: string | null;
  cvContentSha256?: string | null;
  email?: string | null;
  phone?: string | null;
};

function candidateRowToDedupe(row: Record<string, unknown>): CandidateDedupeRow {
  const jo = row.job_openings as { title?: string } | null;
  return {
    id: String(row.id),
    name: (row.name as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    job_opening_id: (row.job_opening_id as string | null) ?? null,
    job_opening_title: jo?.title ?? null,
    cv_uploaded_at: (row.cv_uploaded_at as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
    parsed_payload: row.parsed_payload,
    cv_file_sha256: (row.cv_file_sha256 as string | null) ?? null,
    cv_content_sha256: (row.cv_content_sha256 as string | null) ?? null,
  };
}

/**
 * Pre-upload duplicate check: runs the same dedupe matcher as `/process`,
 * but against client-computed hashes/contact before the file is stored in
 * Supabase or parsed by the AI. No DB writes, no Storage access.
 */
export async function POST(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const signals: PrecheckSignals = {
    jobOpeningId:
      typeof body.jobOpeningId === "string" && body.jobOpeningId.length > 0
        ? body.jobOpeningId
        : null,
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

  if (!shouldQueryForPrecheck(signals)) {
    return Response.json({ duplicateCandidates: [], duplicateNewUpload: null });
  }

  const { data: others, error: othersErr } = await auth.supabase
    .from("candidates")
    .select(
      "id, name, status, job_opening_id, cv_uploaded_at, created_at, parsed_payload, cv_file_sha256, cv_content_sha256, job_openings ( title )",
    )
    .eq("is_active", true);
  if (othersErr) {
    return Response.json({ error: othersErr.message }, { status: 500 });
  }

  const { duplicateCandidates, duplicateNewUpload } = evaluateDuplicatePrecheck(
    signals,
    (others as Record<string, unknown>[]).map(candidateRowToDedupe),
  );

  return Response.json({ duplicateCandidates, duplicateNewUpload });
}
