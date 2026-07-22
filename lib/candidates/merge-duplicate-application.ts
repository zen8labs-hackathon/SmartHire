import {
  createCvDetailVersion,
  getCvDetailVersionById,
  getNextCvVersionNumber,
  type CvMatchedOn,
} from "@/lib/db/cv-detail-versions";
import { getCampaignAppliedById, updateCampaignApplied } from "@/lib/db/campaign-applied";
import { syncCandidateAggregateFields } from "@/lib/db/candidates";
import { getPool, withTransaction, type QueryExecutor } from "@/lib/db/config/client";
import { dbDateToIso } from "@/lib/db/query-helpers";

export type MergeDuplicateApplicationResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * Deletes a `candidates` row only if it has no other `campaign_applied` rows
 * left pointing at it. `campaign_applied.candidate_id` is `ON DELETE CASCADE`,
 * so blindly deleting a candidate that still has other live applications
 * would silently wipe all of them out too. The merge/link/discard helpers
 * below are documented as safe because `temp-upload/confirm` always creates a
 * brand-new, single-application candidate per upload -- but that's an
 * *assumed* invariant, not one anything actually enforces, and it can be
 * violated by leftover inconsistent state (e.g. a candidate that already
 * ended up with 2+ applications from an earlier failed/partial merge). This
 * check turns the assumption into a real guard: if the invariant doesn't
 * hold, the merge still leaves the (now-orphaned) `campaign_applied` row
 * pointed at whatever candidate it was, rather than cascading a deletion
 * through every application that candidate has, in this job or any other.
 */
export async function deleteCandidateIfNoOtherApplications(
  tx: QueryExecutor,
  candidateId: string,
): Promise<void> {
  // A separate SELECT-then-DELETE would leave a gap where a new
  // campaign_applied row could be inserted and committed against this
  // candidate between the check and the delete, which would then get
  // silently cascade-deleted along with it. Doing the check as part of the
  // DELETE's own WHERE clause makes it atomic -- Postgres evaluates
  // NOT EXISTS against the same MVCC snapshot the DELETE itself acts on.
  await tx.query(
    `DELETE FROM candidates
     WHERE id = $1
       AND NOT EXISTS (SELECT 1 FROM campaign_applied WHERE candidate_id = $1)`,
    [candidateId],
  );
}

/**
 * Merges a throwaway "duplicate upload" application into an existing one:
 * copies the duplicate's active CV file into a new `file_replaced` version on
 * the existing application, then deletes the duplicate's `campaign_applied`
 * row and (if nothing else references it) its `candidates` row. Usually
 * safe because `POST .../temp-upload/confirm` always creates a brand new,
 * single-application `candidates` row per upload (see
 * app/api/admin/candidates/temp-upload/confirm/route.ts) -- but see
 * {@link deleteCandidateIfNoOtherApplications} for why that's checked rather
 * than assumed.
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

  await withTransaction(async (tx) => {
    // Lock the target application before computing the next version number.
    // Without this, two duplicate CVs from the same upload batch that both
    // match this same application (now common -- the upload modal
    // auto-resolves every duplicate concurrently, with no manual per-row
    // gating) can both read the same MAX(version_number) and then both try
    // to insert it, tripping `cv_detail_versions_campaign_version_unique`.
    // The route layer can't tell that apart from a real email/phone
    // conflict (both are Postgres error code 23505), so the race surfaced
    // as the misleading "already belongs to another candidate profile"
    // message. Locking here serializes concurrent merges onto the same
    // application so each one sees the other's committed version number.
    await tx.query(`SELECT id FROM campaign_applied WHERE id = $1 FOR UPDATE`, [
      existingCampaignAppliedId,
    ]);
    const nextVersionNum = await getNextCvVersionNumber(tx, existingCampaignAppliedId);

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
      dateOfBirth: dbDateToIso(duplicateCvVersion.date_of_birth),
      studentYears: duplicateCvVersion.student_years,
      matchedOn,
      createdBy,
    });

    // 2. Point the existing application's active CV at the new version.
    // Also clear the cached JD-match result: it was computed against the
    // *previous* CV, and leaving `jd_match_status: "completed"` in place
    // would both show a stale score for the new CV and make
    // `runJdMatchForCandidate`'s "already_scored" guard silently skip any
    // future re-score attempt. JD-match itself stays opt-in (not re-run
    // here) -- HR re-triggers it explicitly via "Run AI JD Match", same as
    // for a brand-new upload.
    await updateCampaignApplied(tx, existingCampaignAppliedId, {
      activeCvVersionId: mergedCvVersion.id,
      jdMatchStatus: duplicateCampaign.jd_match_status,
      jdMatchScore: duplicateCampaign.jd_match_score,
      jdMatchError: duplicateCampaign.jd_match_error,
      jdMatchRationale: duplicateCampaign.jd_match_rationale,
    });

    // 3. Delete the throwaway duplicate application, then its person row --
    // but only if nothing else references that candidate (see
    // deleteCandidateIfNoOtherApplications).
    await tx.query("DELETE FROM campaign_applied WHERE id = $1", [duplicateCampaignAppliedId]);
    await deleteCandidateIfNoOtherApplications(tx, duplicateCampaign.candidate_id);

    // 4. Refresh the existing person's pool-search aggregate fields
    await syncCandidateAggregateFields(tx, existingCampaign.candidate_id);
  });

  return { ok: true };
}

/**
 * Repoints a freshly-uploaded, already-parsed application onto an existing
 * person instead of the blank `candidates` row `temp-upload/confirm` created
 * for it -- used when a CV upload turns out to be a duplicate of someone who already
 * applied to a *different* job. Unlike {@link mergeDuplicateApplicationIntoExisting},
 * the new application is kept (it's a legitimate new job application), only
 * its person identity changes; the throwaway blank candidate row is deleted
 * once nothing references it anymore.
 */
export async function linkApplicationToExistingCandidate(
  newCampaignAppliedId: string,
  existingCandidateId: string,
): Promise<MergeDuplicateApplicationResult> {
  const db = getPool();

  const application = await getCampaignAppliedById(db, newCampaignAppliedId);
  if (!application) {
    return { ok: false, error: "Application not found.", status: 404 };
  }
  if (application.candidate_id === existingCandidateId) {
    return { ok: true };
  }

  const orphanCandidateId = application.candidate_id;

  await withTransaction(async (tx) => {
    await tx.query(
      `UPDATE campaign_applied SET candidate_id = $2, updated_at = now() WHERE id = $1`,
      [newCampaignAppliedId, existingCandidateId],
    );
    // The application above no longer points at `orphanCandidateId` -- but
    // only delete that candidate row if this was truly its last application
    // (see deleteCandidateIfNoOtherApplications).
    await deleteCandidateIfNoOtherApplications(tx, orphanCandidateId);
    await syncCandidateAggregateFields(tx, existingCandidateId);
  });

  return { ok: true };
}

/**
 * Hard-deletes a throwaway duplicate-upload application and its blank
 * `candidates` row together -- used only when discarding a CV upload that
 * the duplicate-candidate modal flagged (a fresh, single-application
 * candidate created by `temp-upload/confirm`, same invariant as the merge/link
 * helpers above). Distinct from `softDeleteCampaignApplied`, which is the
 * general-purpose "remove an application" action and must never touch the
 * person row (a real candidate may have other live applications).
 */
export async function discardDuplicateApplication(
  campaignAppliedId: string,
): Promise<MergeDuplicateApplicationResult> {
  const db = getPool();

  const application = await getCampaignAppliedById(db, campaignAppliedId);
  if (!application) {
    return { ok: false, error: "Application not found.", status: 404 };
  }

  await withTransaction(async (tx) => {
    await tx.query("DELETE FROM campaign_applied WHERE id = $1", [campaignAppliedId]);
    await deleteCandidateIfNoOtherApplications(tx, application.candidate_id);
  });

  return { ok: true };
}
