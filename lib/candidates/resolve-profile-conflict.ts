import { withTransaction } from "@/lib/db/config/client";
import { isUniqueViolation } from "@/lib/db/query-helpers";
import {
  getCampaignAppliedById,
  getCampaignAppliedByCandidateAndJob,
} from "@/lib/db/campaign-applied";
import { getCvDetailVersionById, type CvMatchedOn } from "@/lib/db/cv-detail-versions";
import {
  getCandidateById,
  syncCandidateAggregateFields,
  type CandidateRow,
} from "@/lib/db/candidates";
import { findCandidatesByDedupeSignals } from "@/lib/db/candidates-dedupe";
import {
  mergeDuplicateApplicationIntoExisting,
  linkApplicationToExistingCandidate,
} from "@/lib/candidates/merge-duplicate-application";
import { applyManualProfileEdit } from "@/lib/candidates/apply-manual-profile-edit";
import {
  normalizeEmailFromPayload,
  normalizePhoneFromPayload,
} from "@/lib/candidates/duplicate-detection";
import {
  validateSourceOther,
  type CandidateProfilePatchInput,
} from "@/lib/candidates/candidate-profile-patch";

/**
 * Fills in name/role/degree/school/experience_years/skills from the
 * *target* candidate's own current values whenever the patch leaves them
 * untouched. Without this, `applyManualProfileEdit`'s base CV version for a
 * merge is the *source* application's own CV (its own `parsed_payload`,
 * copied byte-for-byte in Path B, or simply its existing one in Path C) --
 * any field HR didn't explicitly edit in this patch would otherwise carry
 * the source's original resume content straight through into the target's
 * aggregate `candidates` row via `syncCandidateAggregateFields` (e.g. an
 * edit that only touches email/phone would silently rename the target
 * candidate to the source's name). `skipContactFields` already prevents
 * this for email/phone directly on `candidates`, but email/phone written
 * into the *CV version's* `parsed_payload` still need the patch to carry
 * the target's own value through explicitly, same as every other field
 * here.
 */
function withTargetIdentityDefaults(
  patch: CandidateProfilePatchInput,
  targetCandidate: CandidateRow,
): CandidateProfilePatchInput {
  return {
    ...patch,
    name: patch.name !== undefined ? patch.name : targetCandidate.name,
    role: patch.role !== undefined ? patch.role : targetCandidate.role,
    degree: patch.degree !== undefined ? patch.degree : targetCandidate.degree,
    school: patch.school !== undefined ? patch.school : targetCandidate.education,
    experience_years:
      patch.experience_years !== undefined
        ? patch.experience_years
        : targetCandidate.experience_years != null
          ? parseFloat(targetCandidate.experience_years)
          : undefined,
    skills: patch.skills !== undefined ? patch.skills : targetCandidate.skills,
    email: patch.email !== undefined ? patch.email : targetCandidate.email,
    phone: patch.phone !== undefined ? patch.phone : targetCandidate.phone,
  };
}

export type ResolveProfileConflictResult =
  | { ok: true; survivingCampaignAppliedId: string }
  | { ok: false; error: string; status: number };

/**
 * Confirms an HR-flagged "this email/phone conflict is actually the same
 * person" call from the profile-edit flow: moves the *one* application
 * currently being edited onto `targetCandidateId` (reusing the same
 * merge/link primitives the CV-upload dedupe flow uses) and applies the
 * rest of the pending patch to whichever application survives -- all in one
 * transaction. Deliberately narrow in scope: any *other* applications
 * belonging to the edited candidate are left untouched (see the "scope hẹp"
 * decision in the merge-from-edit plan) -- HR only confirmed this one CV
 * belongs to the matched person, not that every application under the
 * edited candidate does.
 */
export async function resolveProfileConflict(params: {
  editedCampaignAppliedId: string;
  targetCandidateId: string;
  patch: CandidateProfilePatchInput;
  createdBy: string;
}): Promise<ResolveProfileConflictResult> {
  const { editedCampaignAppliedId, targetCandidateId, patch, createdBy } = params;

  try {
    return await withTransaction(async (tx) => {
      const editedAppPre = await getCampaignAppliedById(tx, editedCampaignAppliedId);
      if (!editedAppPre) {
        return { ok: false, error: "Application not found.", status: 404 };
      }
      if (editedAppPre.candidate_id === targetCandidateId) {
        return { ok: false, error: "Cannot merge a candidate with themselves.", status: 400 };
      }

      // Lock both candidates in a fixed (sorted) order, regardless of which
      // is "source"/"target" -- guarantees two concurrent merges touching
      // the same pair of candidates in either direction always acquire row
      // locks in the same global order, so they can't deadlock each other.
      const lockIds = [editedAppPre.candidate_id, targetCandidateId].sort();
      const { rows: lockedCandidates } = await tx.query<{ id: string }>(
        `SELECT id FROM candidates WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE`,
        [lockIds],
      );
      if (lockedCandidates.length < 2) {
        return { ok: false, error: "One of the candidates no longer exists.", status: 409 };
      }
      // Also lock the application being edited, to serialize a double-submit
      // of the same merge (e.g. a doubled-up click).
      await tx.query(`SELECT id FROM campaign_applied WHERE id = $1 FOR UPDATE`, [
        editedCampaignAppliedId,
      ]);

      const editedApp = await getCampaignAppliedById(tx, editedCampaignAppliedId);
      if (!editedApp) {
        return { ok: false, error: "Application not found.", status: 404 };
      }
      const sourceCandidate = await getCandidateById(tx, editedApp.candidate_id);
      if (!sourceCandidate) {
        return { ok: false, error: "Candidate not found.", status: 404 };
      }
      const targetCandidate = await getCandidateById(tx, targetCandidateId);
      if (!targetCandidate) {
        return {
          ok: false,
          error: "The matched candidate no longer exists. Refresh and try again.",
          status: 409,
        };
      }
      if (!editedApp.active_cv_version_id) {
        return { ok: false, error: "No CV file on record.", status: 404 };
      }
      const editedCvVersion = await getCvDetailVersionById(tx, editedApp.active_cv_version_id);
      if (!editedCvVersion) {
        return { ok: false, error: "Active CV version not found.", status: 404 };
      }

      // Re-validate the conflict still holds -- closes the race between the
      // 409 response that offered this merge and the click that confirmed
      // it (someone else may have edited either candidate in between).
      const nextEmail = patch.email !== undefined ? patch.email : sourceCandidate.email;
      const nextPhone = patch.phone !== undefined ? patch.phone : sourceCandidate.phone;
      const normalizedEmail = normalizeEmailFromPayload(nextEmail);
      const { variants: phoneVariants } = normalizePhoneFromPayload(nextPhone);

      if (!normalizedEmail && phoneVariants.length === 0) {
        return {
          ok: false,
          error: "This no longer conflicts with another candidate. Refresh and save normally.",
          status: 409,
        };
      }

      const dedupeMatches = await findCandidatesByDedupeSignals(
        tx,
        {
          email: normalizedEmail,
          phoneVariants: phoneVariants.length > 0 ? phoneVariants : undefined,
        },
        editedCampaignAppliedId,
      );
      const otherCandidateIds = new Set(
        dedupeMatches
          .filter((m) => m.candidate_id !== sourceCandidate.id)
          .map((m) => m.candidate_id),
      );
      if (otherCandidateIds.size === 0) {
        return {
          ok: false,
          error: "This no longer conflicts with another candidate. Refresh and save normally.",
          status: 409,
        };
      }
      if (otherCandidateIds.size > 1 || !otherCandidateIds.has(targetCandidateId)) {
        return {
          ok: false,
          error:
            "The conflicting candidate has changed since you loaded this page. Refresh and try again.",
          status: 409,
        };
      }

      const targetMatch = dedupeMatches.find((m) => m.candidate_id === targetCandidateId);
      const emailHit =
        !!normalizedEmail && targetMatch?.candidate_email?.toLowerCase() === normalizedEmail;
      const phoneHit =
        phoneVariants.length > 0 &&
        !!targetMatch?.candidate_phone &&
        phoneVariants.includes(targetMatch.candidate_phone);
      const matchedOn: CvMatchedOn | null =
        emailHit && phoneHit ? "email_or_phone" : emailHit ? "email" : phoneHit ? "phone" : null;

      // See withTargetIdentityDefaults's docstring -- must be used as the
      // patch for every applyManualProfileEdit call below, not the raw
      // `patch` param, or fields HR didn't touch leak the source's own
      // resume content onto the target candidate.
      const effectivePatch = withTargetIdentityDefaults(patch, targetCandidate);

      // Determine path: does the target candidate already have a live
      // application for the same job as the one being edited?
      const collidingApp = editedApp.job_id
        ? await getCampaignAppliedByCandidateAndJob(tx, targetCandidateId, editedApp.job_id)
        : null;

      let survivingCampaignAppliedId: string;

      if (collidingApp) {
        // Path B: fold the edited application's CV into the existing
        // colliding application as a new version, then discard the edited
        // application. `nextSource`/`nextSourceOther` fall back to the
        // *surviving* application's own current values, not the discarded
        // one's -- it's the surviving row's metadata that's authoritative.
        const nextSource = patch.source !== undefined ? patch.source : collidingApp.source;
        const nextSourceOther =
          patch.source_other !== undefined ? patch.source_other : collidingApp.source_other;
        // Only validate when this patch actually touches source/source_other
        // -- the survivor is a *different* application than the one HR is
        // looking at (Path B folds the edited app into it), so its
        // pre-existing, unedited source state must never block an edit that
        // never asked to change it (e.g. just fixing a colliding email).
        if (patch.source !== undefined || patch.source_other !== undefined) {
          const sourceOtherError = validateSourceOther(nextSource, nextSourceOther);
          if (sourceOtherError) {
            return { ok: false, error: sourceOtherError, status: 400 };
          }
        }

        const mergeResult = await mergeDuplicateApplicationIntoExisting(
          tx,
          collidingApp.id,
          editedCampaignAppliedId,
          matchedOn,
          createdBy,
        );
        if (!mergeResult.ok) return mergeResult;

        survivingCampaignAppliedId = collidingApp.id;

        const mergedCvVersion = await getCvDetailVersionById(tx, mergeResult.mergedCvVersionId);
        if (!mergedCvVersion) {
          // Unreachable in practice -- mergeDuplicateApplicationIntoExisting
          // just created this row in this same transaction. Throwing (not
          // returning ok:false) so withTransaction rolls back the merge
          // instead of silently committing a half-applied edit.
          throw new Error("Merged CV version not found immediately after merge.");
        }

        await applyManualProfileEdit(tx, {
          campaignAppliedId: survivingCampaignAppliedId,
          candidateId: targetCandidateId,
          baseCvVersion: mergedCvVersion,
          nextSource,
          nextSourceOther,
          patch: effectivePatch,
          createdBy,
          skipContactFields: true,
        });
      } else {
        // Path C: no job collision -- just re-parent the edited application
        // onto the target candidate, keeping its own id.
        const nextSource = patch.source !== undefined ? patch.source : editedApp.source;
        const nextSourceOther =
          patch.source_other !== undefined ? patch.source_other : editedApp.source_other;
        if (patch.source !== undefined || patch.source_other !== undefined) {
          const sourceOtherError = validateSourceOther(nextSource, nextSourceOther);
          if (sourceOtherError) {
            return { ok: false, error: sourceOtherError, status: 400 };
          }
        }

        const linkResult = await linkApplicationToExistingCandidate(
          tx,
          editedCampaignAppliedId,
          targetCandidateId,
        );
        if (!linkResult.ok) return linkResult;

        survivingCampaignAppliedId = editedCampaignAppliedId;

        await applyManualProfileEdit(tx, {
          campaignAppliedId: survivingCampaignAppliedId,
          candidateId: targetCandidateId,
          baseCvVersion: editedCvVersion,
          nextSource,
          nextSourceOther,
          patch: effectivePatch,
          createdBy,
          skipContactFields: true,
        });
      }

      // Final aggregate sync -- the merge/link call above already synced
      // once, but applyManualProfileEdit may have changed skills/role/degree
      // afterwards, so sync again to reflect the patched version. The CV
      // version it just created only overlays fields the patch actually
      // touched (patchInputToMergeFields) -- any identity field the patch
      // *didn't* touch (e.g. editing email but not phone) still carries the
      // *source's* original value forward from the copied CV. If the source
      // candidate is still alive (it had other applications, so it wasn't
      // deleted), syncing that leftover value onto the target would collide
      // with the source's own still-live row. Target's own contact fields
      // are already correct (that's what made it the merge target in the
      // first place), so skipping this sync on a collision is safe -- see
      // the identical savepoint in mergeDuplicateApplicationIntoExisting.
      await tx.query("SAVEPOINT sync_aggregate_final");
      try {
        await syncCandidateAggregateFields(tx, targetCandidateId);
        await tx.query("RELEASE SAVEPOINT sync_aggregate_final");
      } catch (syncErr) {
        if (!isUniqueViolation(syncErr)) throw syncErr;
        await tx.query("ROLLBACK TO SAVEPOINT sync_aggregate_final");
      }

      return { ok: true, survivingCampaignAppliedId };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        ok: false,
        error: "Another candidate already uses this email or phone number. Use different contact info.",
        status: 409,
      };
    }
    throw err;
  }
}
