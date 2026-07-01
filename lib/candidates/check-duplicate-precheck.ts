/**
 * Pure logic backing `POST /api/admin/candidates/check-duplicate`: builds a
 * synthetic dedupe row from client-computed CV signals (no candidate row
 * exists yet) and runs it through the existing, unmodified dedupe matcher.
 */

import {
  duplicateNewUploadPreviewFromRow,
  findDuplicateCandidateHits,
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
