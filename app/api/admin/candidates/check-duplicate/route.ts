import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import {
  evaluateDuplicatePrecheck,
  shouldQueryForPrecheck,
  type PrecheckSignals,
} from "@/lib/candidates/check-duplicate-precheck";
import {
  normalizePhoneFromPayload,
  type CandidateDedupeRow,
} from "@/lib/candidates/duplicate-detection";
import {
  dedupeMatchStatusLabel,
  findCandidatesByDedupeSignals,
} from "@/lib/db/candidates-dedupe";
import { getPool } from "@/lib/db/config/client";

type Body = {
  jobOpeningId?: string | null;
  cvFileSha256?: string | null;
  cvContentSha256?: string | null;
  email?: string | null;
  phone?: string | null;
};

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

  const db = getPool();
  const phoneNorm = signals.phone ? normalizePhoneFromPayload(signals.phone) : null;

  try {
    const matches = await findCandidatesByDedupeSignals(db, {
      email: signals.email,
      phoneVariants: phoneNorm?.variants ?? [],
      cvFileSha256: signals.cvFileSha256,
      cvContentSha256: signals.cvContentSha256,
    });

    const others: CandidateDedupeRow[] = matches.map((m) => ({
      id: m.campaign_applied_id,
      candidate_id: m.candidate_id,
      name: m.candidate_name,
      status: dedupeMatchStatusLabel(m),
      job_opening_id: m.job_id,
      job_opening_title: m.job_position,
      cv_uploaded_at: m.cv_created_at ? m.cv_created_at.toISOString() : m.created_at.toISOString(),
      created_at: m.created_at.toISOString(),
      parsed_payload: { email: m.candidate_email, phone: m.candidate_phone, role: m.cv_role },
      cv_file_sha256: m.cv_file_sha256,
      cv_content_sha256: m.cv_content_sha256,
    }));

    const { duplicateCandidates, duplicateNewUpload } = evaluateDuplicatePrecheck(
      signals,
      others,
    );

    return Response.json({ duplicateCandidates, duplicateNewUpload });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Deduplication error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
