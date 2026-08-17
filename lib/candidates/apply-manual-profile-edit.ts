import type { QueryExecutor } from "@/lib/db/config/client";
import { dbDateToIso } from "@/lib/db/query-helpers";
import {
  createCvDetailVersion,
  getNextCvVersionNumber,
  type CvDetailVersionRow,
} from "@/lib/db/cv-detail-versions";
import {
  updateCampaignApplied,
  type CampaignAppliedSource,
} from "@/lib/db/campaign-applied";
import { updateCandidate } from "@/lib/db/candidates";
import {
  mergeProfileIntoParsedPayload,
  patchInputToMergeFields,
  type CandidateProfilePatchInput,
} from "@/lib/candidates/candidate-profile-patch";

export type ApplyManualProfileEditParams = {
  campaignAppliedId: string;
  candidateId: string;
  /** The CV version to diff/copy from -- the *surviving* application's current active version, not necessarily the one the edit started from (see `resolveProfileConflict`, Path B). */
  baseCvVersion: CvDetailVersionRow;
  nextSource: CampaignAppliedSource;
  nextSourceOther: string | null;
  patch: CandidateProfilePatchInput;
  createdBy: string;
  /**
   * Skip writing `email`/`phone` to the candidate row even if present in
   * `patch`. Used by `resolveProfileConflict`: the target candidate already
   * owns the correct value (that's why it matched), so re-writing it here
   * would be redundant at best and a stale race at worst.
   */
  skipContactFields?: boolean;
};

/**
 * Creates a new `manual_edit` `cv_detail_versions` row layering `patch` on
 * top of `baseCvVersion`, points the application at it, and updates the
 * `candidates` row's editable fields. Shared by `PATCH .../profile` (the
 * ordinary single-candidate edit) and `resolveProfileConflict` (edit +
 * merge in one transaction) so both write paths stay in lockstep.
 */
export async function applyManualProfileEdit(
  db: QueryExecutor,
  params: ApplyManualProfileEditParams,
): Promise<{ cvVersionId: string }> {
  const {
    campaignAppliedId,
    candidateId,
    baseCvVersion,
    nextSource,
    nextSourceOther,
    patch,
    createdBy,
    skipContactFields,
  } = params;

  const mergeFields = patchInputToMergeFields(patch);
  let mergedPayload = baseCvVersion.parsed_payload;
  if (Object.keys(mergeFields).length > 0) {
    mergedPayload = mergeProfileIntoParsedPayload(
      baseCvVersion.parsed_payload,
      mergeFields,
    );
  }

  const nextVersionNum = await getNextCvVersionNumber(db, campaignAppliedId);

  const nextVersion = await createCvDetailVersion(db, {
    campaignAppliedId,
    versionNumber: nextVersionNum,
    sourceEvent: "manual_edit",
    cvStoragePath: baseCvVersion.cv_storage_path,
    originalFilename: baseCvVersion.original_filename,
    mimeType: baseCvVersion.mime_type,
    cvFileSha256: baseCvVersion.cv_file_sha256,
    cvContentSha256: baseCvVersion.cv_content_sha256,
    parsingStatus: baseCvVersion.parsing_status,
    parsingError: baseCvVersion.parsing_error,
    parsedPayload: mergedPayload,
    skills: patch.skills !== undefined ? patch.skills : baseCvVersion.skills,
    role: patch.role !== undefined ? patch.role : baseCvVersion.role,
    degree: patch.degree !== undefined ? patch.degree : baseCvVersion.degree,
    education: patch.school !== undefined ? patch.school : baseCvVersion.education,
    experienceYears:
      patch.experience_years !== undefined
        ? patch.experience_years
        : baseCvVersion.experience_years
          ? parseFloat(baseCvVersion.experience_years)
          : null,
    gpa: baseCvVersion.gpa,
    englishLevel: baseCvVersion.english_level,
    dateOfBirth: dbDateToIso(baseCvVersion.date_of_birth),
    studentYears: baseCvVersion.student_years,
    matchedOn: baseCvVersion.matched_on,
    changeSummary: patch.change_summary ?? null,
    createdBy,
  });

  await updateCampaignApplied(db, campaignAppliedId, {
    activeCvVersionId: nextVersion.id,
    source: nextSource,
    sourceOther: nextSource === "Other" ? nextSourceOther : null,
    ...(patch.expected_salary !== undefined
      ? { expectedSalary: patch.expected_salary }
      : {}),
  });

  const candidatePatch: Parameters<typeof updateCandidate>[2] = {};
  if (patch.name !== undefined) candidatePatch.name = patch.name;
  if (!skipContactFields) {
    if (patch.email !== undefined) candidatePatch.email = patch.email;
    if (patch.phone !== undefined) candidatePatch.phone = patch.phone;
  }

  if (Object.keys(candidatePatch).length > 0) {
    await updateCandidate(db, candidateId, candidatePatch);
  }

  return { cvVersionId: nextVersion.id };
}
