/**
 * Pure logic backing `POST /api/admin/candidates/check-duplicate`: builds a
 * synthetic dedupe row from client-computed CV signals (no candidate row
 * exists yet) and runs it through the existing, unmodified dedupe matcher.
 */

import type { QueryExecutor } from "@/lib/db/config/client";
import {
  dedupeMatchStatusLabel,
  findCandidatesByDedupeSignals,
} from "@/lib/db/candidates-dedupe";

import {
  duplicateNewUploadPreviewFromRow,
  findDuplicateCandidateHits,
  normalizePhoneFromPayload,
  shouldFetchCandidatesForDedupe,
  type CandidateDedupeRow,
  type DuplicateCandidateHit,
  type DuplicateNewUploadPreview,
} from "./duplicate-detection";

export type PrecheckSignals = {
  jobOpeningId: string | null;
  email: string | null;
  phone: string | null;
  cvFileSha256: string | null;
  cvContentSha256: string | null;
};

const PRECHECK_ROW_ID = "__precheck__";

export function buildPrecheckRow(signals: PrecheckSignals): CandidateDedupeRow {
  return {
    id: PRECHECK_ROW_ID,
    name: null,
    status: null,
    job_opening_id: signals.jobOpeningId,
    cv_uploaded_at: null,
    created_at: null,
    parsed_payload: { email: signals.email, phone: signals.phone },
    cv_file_sha256: signals.cvFileSha256,
    cv_content_sha256: signals.cvContentSha256,
  };
}

export function shouldQueryForPrecheck(signals: PrecheckSignals): boolean {
  return shouldFetchCandidatesForDedupe(buildPrecheckRow(signals));
}

export function evaluateDuplicatePrecheck(
  signals: PrecheckSignals,
  others: CandidateDedupeRow[],
): {
  duplicateCandidates: DuplicateCandidateHit[];
  duplicateNewUpload: DuplicateNewUploadPreview | null;
} {
  const current = buildPrecheckRow(signals);
  const duplicateCandidates = findDuplicateCandidateHits(current, others);
  const duplicateNewUpload =
    duplicateCandidates.length > 0
      ? duplicateNewUploadPreviewFromRow(current)
      : null;
  return { duplicateCandidates, duplicateNewUpload };
}

/**
 * Full precheck orchestration: normalize phone -> query
 * `findCandidatesByDedupeSignals` -> map DB rows into `CandidateDedupeRow[]`
 * -> run them through `evaluateDuplicatePrecheck`. Shared by
 * `check-duplicate/route.ts` (pre-upload check from client-computed signals)
 * and `temp-upload/confirm/route.ts` (server-computed signals at confirm
 * time) so both call sites stay in lockstep.
 */
export async function runDedupePrecheck(
  db: QueryExecutor,
  signals: Omit<PrecheckSignals, "jobOpeningId"> & { jobOpeningId?: string | null },
  excludeCampaignAppliedId?: string,
): Promise<{
  duplicateCandidates: DuplicateCandidateHit[];
  duplicateNewUpload: DuplicateNewUploadPreview | null;
}> {
  const fullSignals: PrecheckSignals = {
    jobOpeningId: signals.jobOpeningId ?? null,
    email: signals.email,
    phone: signals.phone,
    cvFileSha256: signals.cvFileSha256,
    cvContentSha256: signals.cvContentSha256,
  };

  if (!shouldQueryForPrecheck(fullSignals)) {
    return { duplicateCandidates: [], duplicateNewUpload: null };
  }

  const phoneNorm = fullSignals.phone ? normalizePhoneFromPayload(fullSignals.phone) : null;

  const matches = await findCandidatesByDedupeSignals(
    db,
    {
      email: fullSignals.email,
      phoneVariants: phoneNorm?.variants ?? [],
      cvFileSha256: fullSignals.cvFileSha256,
      cvContentSha256: fullSignals.cvContentSha256,
    },
    excludeCampaignAppliedId,
  );

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

  return evaluateDuplicatePrecheck(fullSignals, others);
}
