import {
  getCampaignAppliedById,
  getCampaignAppliedByCandidateAndJob,
  getOrCreateCampaignApplied,
  softDeleteCampaignApplied,
  updateCampaignApplied,
} from "@/lib/db/campaign-applied";
import {
  getCandidateById,
  syncCandidateFieldsFromLatestCv,
  updateCandidate,
  type CandidateRow,
  type UpdateCandidateInput,
} from "@/lib/db/candidates";
import { withTransaction, type QueryExecutor } from "@/lib/db/config/client";
import {
  createCvDetailVersion,
  getCvDetailVersionById,
  getNextCvVersionNumber,
  listCvDetailVersionsByCampaignApplied,
  type CvDetailVersionRow,
} from "@/lib/db/cv-detail-versions";
import { dbDateToIso, isUniqueViolation } from "@/lib/db/query-helpers";

/** What happened to the source application after its chosen CV was merged out. */
export type SourceApplicationDisposition =
  /** The whole `campaign_applied` row was re-parented onto the canonical candidate (its schedules / notes / evaluations came with it). */
  | "moved"
  /** The chosen CV was its only version -- its schedules / notes / evaluations were re-parented and the row soft-deleted. */
  | "soft_deleted"
  /** It has other versions of its own, so it stays alive (active pointer rolled back only if the chosen CV was the active one). */
  | "kept";

export type MergeCvVersionResult =
  | {
      ok: true;
      canonicalCandidateId: string;
      /** The canonical candidate row after the merge (and the profile patch, if one was given). */
      canonicalCandidate: CandidateRow | null;
      duplicateCandidateId: string;
      /** The duplicate candidate row was soft-deleted (it had no live applications left). */
      duplicateCandidateDeleted: boolean;
      /** The canonical-side application the CV ended up on (equal to the source application when the whole row was moved). */
      targetCampaignAppliedId: string;
      /** The CV version now active on `targetCampaignAppliedId`. */
      mergedCvVersionId: string;
      sourceDisposition: SourceApplicationDisposition;
    }
  | { ok: false; error: string; status: number };

/**
 * Copies one immutable CV version onto another application as a fresh
 * `file_replaced` row -- `cv_detail_versions` rows are never re-parented in
 * place (same rule as `reassignCvVersionToApplication` /
 * `mergeDuplicateApplicationIntoExisting`), so a merge always makes a new row
 * with a target-local `version_number`.
 */
async function copyCvVersionOntoApplication(
  tx: QueryExecutor,
  source: CvDetailVersionRow,
  targetCampaignAppliedId: string,
  createdBy: string,
): Promise<CvDetailVersionRow> {
  // Lock the target before reading its next version number -- two merges
  // landing on the same application must not both grab the same number and
  // trip `cv_detail_versions_campaign_version_unique`.
  await tx.query(`SELECT id FROM campaign_applied WHERE id = $1 FOR UPDATE`, [
    targetCampaignAppliedId,
  ]);
  const versionNumber = await getNextCvVersionNumber(tx, targetCampaignAppliedId);
  return createCvDetailVersion(tx, {
    campaignAppliedId: targetCampaignAppliedId,
    versionNumber,
    sourceEvent: "file_replaced",
    cvStoragePath: source.cv_storage_path,
    originalFilename: source.original_filename,
    mimeType: source.mime_type,
    cvFileSha256: source.cv_file_sha256,
    cvContentSha256: source.cv_content_sha256,
    parsingStatus: source.parsing_status,
    parsingError: source.parsing_error,
    parsedPayload: source.parsed_payload,
    skills: source.skills,
    role: source.role,
    degree: source.degree,
    education: source.education,
    experienceYears: source.experience_years
      ? parseFloat(source.experience_years)
      : null,
    gpa: source.gpa,
    englishLevel: source.english_level,
    dateOfBirth: dbDateToIso(source.date_of_birth),
    studentYears: source.student_years,
    matchedOn: source.matched_on,
    changeSummary: "Merged from a duplicate candidate.",
    createdBy,
  });
}

/** Re-parent every child row that FKs `campaign_applied` (`ON DELETE CASCADE`) from one application to another, before the source row is soft-deleted. */
async function reparentApplicationChildren(
  tx: QueryExecutor,
  fromCampaignAppliedId: string,
  toCampaignAppliedId: string,
): Promise<void> {
  for (const table of [
    "candidate_schedules",
    "candidate_notes",
    "candidate_evaluation_reviews",
  ]) {
    await tx.query(
      `UPDATE ${table} SET campaign_applied_id = $2 WHERE campaign_applied_id = $1`,
      [fromCampaignAppliedId, toCampaignAppliedId],
    );
  }
}

/**
 * Merges one *chosen* CV version of a duplicate candidate into the canonical
 * (surviving) candidate. `cvVersionId` identifies the version -- it belongs
 * to some application `S` of the duplicate, for job X.
 *
 *  1. Is `cvVersionId` the *only* version on `S`?
 *  2. If it is the only version:
 *     - the canonical candidate has no application for job X -> move the whole
 *       `campaign_applied` row (its schedules / notes / evaluations ride along
 *       on the unchanged row id).
 *     - it already has one -> copy the CV onto it, re-parent `S`'s schedules /
 *       notes / evaluations, then soft-delete `S`.
 *  3. If it is *not* the only version -> copy the CV onto the canonical
 *     candidate's application for job X (created if missing); `S` stays alive,
 *     with its active pointer rolled back only if the chosen CV was `S`'s
 *     active one.
 *  4. Once the duplicate candidate has no live applications left, soft-delete
 *     the duplicate candidate row.
 *  5. Apply `patch` (profile-form edits) to the canonical candidate, if given.
 *
 * Runs in one transaction -- all of it applies, or none.
 */
export async function mergeCvVersionInto(params: {
  canonicalCandidateId: string;
  cvVersionId: string;
  createdBy: string;
  /**
   * Optional profile-form edits to apply to the canonical candidate, once
   * the merge has freed up the duplicate's email/phone. Applied last, in the
   * same transaction -- a unique-constraint clash surfaces as a 409, same as
   * a plain profile edit would.
   */
  patch?: UpdateCandidateInput;
}): Promise<MergeCvVersionResult> {
  const { canonicalCandidateId, cvVersionId, createdBy, patch } = params;

  try {
    return await withTransaction(async (tx) => {
      const chosenVersion = await getCvDetailVersionById(tx, cvVersionId);
      if (!chosenVersion) {
        return { ok: false, error: "CV version not found.", status: 404 };
      }

      const sourceApp = await getCampaignAppliedById(
        tx,
        chosenVersion.campaign_applied_id,
      );
      if (!sourceApp) {
        return { ok: false, error: "Source application not found.", status: 404 };
      }

      const duplicateId = sourceApp.candidate_id;
      const jobId = sourceApp.job_id;

      if (duplicateId === canonicalCandidateId) {
        return {
          ok: false,
          error: "Cannot merge a candidate into itself.",
          status: 400,
        };
      }

      // Lock both candidate rows in a fixed (sorted) order so two concurrent
      // merges touching the same pair -- in either direction -- can't
      // deadlock each other (same pattern as resolveProfileConflict).
      const lockIds = [canonicalCandidateId, duplicateId].sort();
      const { rows: locked } = await tx.query<{ id: string }>(
        `SELECT id FROM candidates
         WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
         ORDER BY id FOR UPDATE`,
        [lockIds],
      );
      if (locked.length < 2) {
        return {
          ok: false,
          error:
            "One of the candidates no longer exists. Refresh and try again.",
          status: 409,
        };
      }

      // Lock and re-read the source application now that the candidates are
      // pinned -- its active pointer may have moved since the first read.
      await tx.query(`SELECT id FROM campaign_applied WHERE id = $1 FOR UPDATE`, [
        sourceApp.id,
      ]);
      const source = await getCampaignAppliedById(tx, sourceApp.id);
      if (!source || source.deleted_at) {
        return {
          ok: false,
          error: "The source application no longer exists. Refresh and try again.",
          status: 409,
        };
      }

      const versions = await listCvDetailVersionsByCampaignApplied(
        tx,
        source.id,
      ); // DESC by version_number
      const isOnlyVersion =
        versions.length === 1 && versions[0]?.id === chosenVersion.id;

      // The canonical candidate's own live application for this job, if any.
      // A pool application (`job_id IS NULL`) never de-dupes, so it's always
      // treated as "the canonical candidate has none".
      const targetApp =
        jobId != null
          ? await getCampaignAppliedByCandidateAndJob(
              tx,
              canonicalCandidateId,
              jobId,
            )
          : null;

      let targetCampaignAppliedId: string;
      let mergedCvVersionId: string;
      let sourceDisposition: SourceApplicationDisposition;

      if (isOnlyVersion && !targetApp) {
        // Only version + no rival application -> move the whole row.
        await tx.query(
          `UPDATE campaign_applied SET candidate_id = $2, updated_at = now() WHERE id = $1`,
          [source.id, canonicalCandidateId],
        );
        targetCampaignAppliedId = source.id;
        mergedCvVersionId = chosenVersion.id;
        sourceDisposition = "moved";
      } else {
        const target =
          targetApp ??
          (
            await getOrCreateCampaignApplied(tx, {
              candidateId: canonicalCandidateId,
              jobId,
            })
          ).application;

        const newVersion = await copyCvVersionOntoApplication(
          tx,
          chosenVersion,
          target.id,
          createdBy,
        );

        // Point the target at the merged-in CV, carrying the version's own
        // JD-match result (same job, same file -> the score still holds).
        await updateCampaignApplied(tx, target.id, {
          activeCvVersionId: newVersion.id,
          jdMatchStatus: chosenVersion.jd_match_status ?? "pending",
          jdMatchScore: chosenVersion.jd_match_score,
          jdMatchError: chosenVersion.jd_match_error,
          jdMatchRationale: chosenVersion.jd_match_rationale,
        });

        targetCampaignAppliedId = target.id;
        mergedCvVersionId = newVersion.id;

        if (isOnlyVersion) {
          // The chosen CV was all the source had -- hand its schedules /
          // notes / evaluations to the surviving application, soft-delete it.
          await reparentApplicationChildren(tx, source.id, target.id);
          await softDeleteCampaignApplied(tx, source.id);
          sourceDisposition = "soft_deleted";
        } else {
          // The source keeps its other versions. Only roll its active pointer
          // back if the chosen CV was the one currently active.
          if (source.active_cv_version_id === chosenVersion.id) {
            const previousVersion = versions.find(
              (v) => v.id !== chosenVersion.id,
            )!;
            await updateCampaignApplied(tx, source.id, {
              activeCvVersionId: previousVersion.id,
              jdMatchStatus: previousVersion.jd_match_status ?? "pending",
              jdMatchScore: previousVersion.jd_match_score,
              jdMatchError: previousVersion.jd_match_error,
              jdMatchRationale: previousVersion.jd_match_rationale,
            });
          }
          sourceDisposition = "kept";
        }
      }

      // Soft-delete the duplicate candidate once it has no live application
      // left.
      const { rows: softDeleted } = await tx.query<{ id: string }>(
        `UPDATE candidates SET deleted_at = now(), updated_at = now()
         WHERE id = $1
           AND deleted_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM campaign_applied
             WHERE candidate_id = $1 AND deleted_at IS NULL
           )
         RETURNING id`,
        [duplicateId],
      );
      const duplicateCandidateDeleted = softDeleted.length > 0;

      // Refresh the pool-search snapshot from each side's now-latest active
      // CV. `syncCandidateFieldsFromLatestCv` (not `...AggregateFields`) on
      // purpose -- it never writes name/email/phone, so merging a duplicate
      // can't rename the survivor, and with no identity write there's no
      // unique-constraint clash to guard against.
      const candidateIdsToSync = duplicateCandidateDeleted
        ? [canonicalCandidateId]
        : [canonicalCandidateId, duplicateId];
      for (const id of candidateIdsToSync) {
        await syncCandidateFieldsFromLatestCv(tx, id);
      }

      // Apply the profile-form edits last -- the duplicate's email/phone are
      // free by now (it was soft-deleted above, or at worst still holds an
      // application whose CV history kept it alive, in which case a clashing
      // patch legitimately 409s via the outer isUniqueViolation catch).
      if (patch && Object.keys(patch).length > 0) {
        await updateCandidate(tx, canonicalCandidateId, patch);
      }

      const canonicalCandidate = await getCandidateById(
        tx,
        canonicalCandidateId,
      );

      return {
        ok: true,
        canonicalCandidateId,
        canonicalCandidate,
        duplicateCandidateId: duplicateId,
        duplicateCandidateDeleted,
        targetCampaignAppliedId,
        mergedCvVersionId,
        sourceDisposition,
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        ok: false,
        error: "Another candidate already uses this email or phone number.",
        status: 409,
      };
    }
    throw err;
  }
}
