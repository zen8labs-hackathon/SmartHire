import { getCampaignAppliedById, updateCampaignApplied } from "@/lib/db/campaign-applied";
import { syncCandidateAggregateFields } from "@/lib/db/candidates";
import type { QueryExecutor } from "@/lib/db/config/client";
import {
  createCvDetailVersion,
  getCvDetailVersionById,
  getNextCvVersionNumber,
  listCvDetailVersionsByCampaignApplied,
  type CvDetailVersionRow,
} from "@/lib/db/cv-detail-versions";
import { dbDateToIso, isUniqueViolation } from "@/lib/db/query-helpers";

export type ReassignCvVersionResult =
  | { ok: true; newCvVersionId: string; sourceActiveCvVersionId: string | null }
  | { ok: false; error: string; status: number };

export type ReassignCvVersionParams = {
  sourceCampaignAppliedId: string;
  /** Defaults to the source application's current active version -- the
   * normal case is undoing a merge that *just* happened, so the row that
   * needs fixing is whatever is active right now. */
  cvVersionId?: string;
  targetCampaignAppliedId: string;
  changeSummary: string | null;
  createdBy: string;
};

/**
 * Recovery tool for a CV that got attached to the wrong application --
 * typically because AI parsing extracted a wrong-but-real email/phone that
 * happened to match an existing person, so the CV-upload dedupe auto-merged
 * it there instead of onto the actual applicant (see the "misattributed
 * merge" discussion). This does *not* prevent that from happening; it's a
 * post-incident fix once HR has spotted it.
 *
 * `cv_detail_versions` rows are immutable by design (see the type doc on
 * `CvDetailVersionRow`) -- this never `UPDATE`s the existing row's
 * `campaign_applied_id`/`version_number` (that would also require rewriting
 * `source_event`/`matched_on` to keep them meaningful, defeating the point of
 * "immutable"). Instead, exactly like `restore-version`, it *copies* the
 * misattributed version onto the target application as a new
 * `file_replaced` row, then rolls the source application's active pointer
 * back to whatever was active before the bad merge. The original
 * (misattributed) row is left in place on the source application's own
 * history, purely as an audit trail of what happened and when it was fixed.
 *
 * Requires `targetCampaignAppliedId` to be for the *same job* as the source
 * -- this tool exists for the "right job, wrong candidate" case, not general
 * cross-job reassignment.
 */
export async function reassignCvVersionToApplication(
  db: QueryExecutor,
  params: ReassignCvVersionParams,
): Promise<ReassignCvVersionResult> {
  const { sourceCampaignAppliedId, targetCampaignAppliedId, changeSummary, createdBy } = params;

  if (sourceCampaignAppliedId === targetCampaignAppliedId) {
    return { ok: false, error: "Source and target are the same application.", status: 400 };
  }

  // Lock both applications up front, in a fixed (sorted) order regardless of
  // which is source/target -- guarantees two concurrent reassigns touching
  // the same pair can't deadlock each other (same convention as
  // resolveProfileConflict's candidate lock).
  const lockIds = [sourceCampaignAppliedId, targetCampaignAppliedId].sort();
  for (const id of lockIds) {
    await db.query(`SELECT id FROM campaign_applied WHERE id = $1 FOR UPDATE`, [id]);
  }

  const sourceApp = await getCampaignAppliedById(db, sourceCampaignAppliedId);
  if (!sourceApp) {
    return { ok: false, error: "Source application not found.", status: 404 };
  }
  const targetApp = await getCampaignAppliedById(db, targetCampaignAppliedId);
  if (!targetApp) {
    return { ok: false, error: "Target application not found.", status: 404 };
  }
  if (targetApp.job_id !== sourceApp.job_id) {
    return {
      ok: false,
      error: "Target application must be for the same job as the source application.",
      status: 400,
    };
  }

  const cvVersionId = params.cvVersionId ?? sourceApp.active_cv_version_id;
  if (!cvVersionId) {
    return { ok: false, error: "Source application has no CV file on record.", status: 404 };
  }
  const cvVersion = await getCvDetailVersionById(db, cvVersionId);
  if (!cvVersion) {
    return { ok: false, error: "CV version not found.", status: 404 };
  }
  if (cvVersion.campaign_applied_id !== sourceCampaignAppliedId) {
    return {
      ok: false,
      error: "This CV version does not belong to the source application.",
      status: 400,
    };
  }

  // Resolve every precondition -- including whether a source rollback is
  // even possible -- *before* any write below. `withTransaction` only rolls
  // back on a thrown error, not on an `{ ok: false }` return, so returning
  // an error after already writing (e.g. the new version on target) would
  // silently commit that partial write instead of aborting cleanly.
  const movingSourcesActiveVersion = sourceApp.active_cv_version_id === cvVersionId;
  let previousSourceVersion: CvDetailVersionRow | null = null;
  if (movingSourcesActiveVersion) {
    const remaining = await listCvDetailVersionsByCampaignApplied(db, sourceCampaignAppliedId);
    previousSourceVersion = remaining.find((v) => v.id !== cvVersionId) ?? null;
    if (!previousSourceVersion) {
      return {
        ok: false,
        error:
          "This is the only CV version on the source application -- reassigning it would leave the application without a CV. Delete the source application instead if it was created entirely by mistake.",
        status: 400,
      };
    }
  }

  const nextVersionNum = await getNextCvVersionNumber(db, targetCampaignAppliedId);
  const newVersion = await createCvDetailVersion(db, {
    campaignAppliedId: targetCampaignAppliedId,
    versionNumber: nextVersionNum,
    sourceEvent: "file_replaced",
    cvStoragePath: cvVersion.cv_storage_path,
    originalFilename: cvVersion.original_filename,
    mimeType: cvVersion.mime_type,
    cvFileSha256: cvVersion.cv_file_sha256,
    cvContentSha256: cvVersion.cv_content_sha256,
    parsingStatus: cvVersion.parsing_status,
    parsingError: cvVersion.parsing_error,
    parsedPayload: cvVersion.parsed_payload,
    skills: cvVersion.skills,
    role: cvVersion.role,
    degree: cvVersion.degree,
    education: cvVersion.education,
    experienceYears: cvVersion.experience_years ? parseFloat(cvVersion.experience_years) : null,
    gpa: cvVersion.gpa,
    englishLevel: cvVersion.english_level,
    dateOfBirth: dbDateToIso(cvVersion.date_of_birth),
    studentYears: cvVersion.student_years,
    matchedOn: cvVersion.matched_on,
    changeSummary:
      changeSummary ?? "Reassigned from a misattributed application (admin correction).",
    createdBy,
  });

  // Point target at the newly-arrived version. Since target is on the *same
  // job* as source (checked above) and this is the exact same file, not a
  // different one, a JD-match score already computed for it is still valid
  // against target -- carry it forward instead of forcing a redundant
  // re-score, same rationale as mergeDuplicateApplicationIntoExisting. That's
  // only true when we're moving the version source has *currently*
  // active/scored, though -- an older, non-active version's own score (if
  // any) lives on the version row itself, not on `sourceApp`'s cache, which
  // reflects a *different* (the current) version.
  await updateCampaignApplied(db, targetCampaignAppliedId, {
    activeCvVersionId: newVersion.id,
    ...(movingSourcesActiveVersion
      ? {
          jdMatchStatus: sourceApp.jd_match_status,
          jdMatchScore: sourceApp.jd_match_score,
          jdMatchError: sourceApp.jd_match_error,
          jdMatchRationale: sourceApp.jd_match_rationale,
        }
      : {
          jdMatchStatus: "pending",
          jdMatchScore: null,
          jdMatchError: null,
          jdMatchRationale: null,
        }),
  });

  let sourceActiveCvVersionId: string | null = sourceApp.active_cv_version_id;
  if (previousSourceVersion) {
    // The misattributed version was the source's currently active one --
    // roll back to whichever version was active before it. The row itself
    // was never touched above (only copied), so it's still right here in
    // source's own history.
    await updateCampaignApplied(db, sourceCampaignAppliedId, {
      activeCvVersionId: previousSourceVersion.id,
      // The departing version's score no longer applies here -- restore
      // whatever score (or lack of one) belongs to the version actually
      // becoming active again, from that version row's own jd_match columns.
      // `jd_match_status` is NOT NULL on campaign_applied (defaults to
      // "pending"), unlike the per-version column it's read from here, which
      // is null whenever that version was never scored.
      jdMatchStatus: previousSourceVersion.jd_match_status ?? "pending",
      jdMatchScore: previousSourceVersion.jd_match_score,
      jdMatchError: previousSourceVersion.jd_match_error,
      jdMatchRationale: previousSourceVersion.jd_match_rationale,
    });
    sourceActiveCvVersionId = previousSourceVersion.id;
  }

  // Cross-candidate aggregate sync -- source and target belong to different
  // candidates, whose identity fields could collide with each other (same
  // savepoint pattern as mergeDuplicateApplicationIntoExisting /
  // resolveProfileConflict).
  for (const candidateId of [sourceApp.candidate_id, targetApp.candidate_id]) {
    await db.query("SAVEPOINT sync_reassign");
    try {
      await syncCandidateAggregateFields(db, candidateId);
      await db.query("RELEASE SAVEPOINT sync_reassign");
    } catch (syncErr) {
      if (!isUniqueViolation(syncErr)) throw syncErr;
      await db.query("ROLLBACK TO SAVEPOINT sync_reassign");
    }
  }

  return { ok: true, newCvVersionId: newVersion.id, sourceActiveCvVersionId };
}
