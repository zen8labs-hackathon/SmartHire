import {
  createCvDetailVersion,
  getCvDetailVersionById,
  getNextCvVersionNumber,
  type CvMatchedOn,
} from "@/lib/db/cv-detail-versions";
import { getCampaignAppliedById, updateCampaignApplied } from "@/lib/db/campaign-applied";
import { syncCandidateAggregateFields } from "@/lib/db/candidates";
import { getPool, withTransaction } from "@/lib/db/config/client";

export type MergeDuplicateApplicationResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * Merges a throwaway "duplicate upload" application into an existing one:
 * copies the duplicate's active CV file into a new `file_replaced` version on
 * the existing application, then deletes the duplicate's `campaign_applied`
 * and `candidates` rows. Safe because `sign-upload` always creates a brand
 * new, single-application `candidates` row per upload (see
 * app/api/admin/candidates/sign-upload/route.ts) -- the duplicate person row
 * being deleted here never has any other application to orphan.
 *
 * Shared by `POST /api/admin/candidates/[id]/replace` (HR intentionally
 * re-uploads a CV for a known candidate) and
 * `PUT /api/admin/candidates/[id]/update-with-history` (HR confirms a
 * system-detected duplicate should merge) -- both flows collapse to the same
 * operation under this schema.
 */
export async function mergeDuplicateApplicationIntoExisting(
  existingCampaignAppliedId: string,
  duplicateCampaignAppliedId: string,
  matchedOn: CvMatchedOn | null,
  createdBy: string,
): Promise<MergeDuplicateApplicationResult> {
  const db = getPool();

  const existingCampaign = await getCampaignAppliedById(db, existingCampaignAppliedId);
  if (!existingCampaign) {
    return { ok: false, error: "Existing application not found.", status: 404 };
  }

  const duplicateCampaign = await getCampaignAppliedById(db, duplicateCampaignAppliedId);
  if (!duplicateCampaign) {
    return { ok: false, error: "New application not found.", status: 404 };
  }

  if (!duplicateCampaign.active_cv_version_id) {
    return { ok: false, error: "New application has no active CV.", status: 400 };
  }

  const duplicateCvVersion = await getCvDetailVersionById(db, duplicateCampaign.active_cv_version_id);
  if (!duplicateCvVersion) {
    return { ok: false, error: "New CV version not found.", status: 404 };
  }

  const nextVersionNum = await getNextCvVersionNumber(db, existingCampaignAppliedId);

  await withTransaction(async (tx) => {
    // 1. Re-associate the duplicate's CV file with the existing application as a new version
    const mergedCvVersion = await createCvDetailVersion(tx, {
      campaignAppliedId: existingCampaignAppliedId,
      versionNumber: nextVersionNum,
      sourceEvent: "file_replaced",
      cvStoragePath: duplicateCvVersion.cv_storage_path,
      originalFilename: duplicateCvVersion.original_filename,
      mimeType: duplicateCvVersion.mime_type,
      cvFileSha256: duplicateCvVersion.cv_file_sha256,
      cvContentSha256: duplicateCvVersion.cv_content_sha256,
      parsingStatus: duplicateCvVersion.parsing_status,
      parsingError: duplicateCvVersion.parsing_error,
      parsedPayload: duplicateCvVersion.parsed_payload,
      skills: duplicateCvVersion.skills,
      role: duplicateCvVersion.role,
      degree: duplicateCvVersion.degree,
      education: duplicateCvVersion.education,
      experienceYears: duplicateCvVersion.experience_years
        ? parseFloat(duplicateCvVersion.experience_years)
        : null,
      gpa: duplicateCvVersion.gpa,
      englishLevel: duplicateCvVersion.english_level,
      dateOfBirth: duplicateCvVersion.date_of_birth
        ? duplicateCvVersion.date_of_birth.toISOString().split("T")[0]
        : null,
      studentYears: duplicateCvVersion.student_years,
      matchedOn,
      createdBy,
    });

    // 2. Point the existing application's active CV at the new version
    await updateCampaignApplied(tx, existingCampaignAppliedId, {
      activeCvVersionId: mergedCvVersion.id,
    });

    // 3. Delete the throwaway duplicate application + its person row
    await tx.query("DELETE FROM campaign_applied WHERE id = $1", [duplicateCampaignAppliedId]);
    await tx.query("DELETE FROM candidates WHERE id = $1", [duplicateCampaign.candidate_id]);

    // 4. Refresh the existing person's pool-search aggregate fields
    await syncCandidateAggregateFields(tx, existingCampaign.candidate_id);
  });

  return { ok: true };
}
