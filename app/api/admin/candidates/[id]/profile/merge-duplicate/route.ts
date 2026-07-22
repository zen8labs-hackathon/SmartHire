import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionForApplication } from "@/lib/authz/require-permission";

import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import { getCvDetailVersionById, getNextCvVersionNumber, createCvDetailVersion } from "@/lib/db/cv-detail-versions";
import { getCandidateById, updateCandidate, syncCandidateAggregateFields } from "@/lib/db/candidates";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { dbDateToIso, isUniqueViolation } from "@/lib/db/query-helpers";
import {
  candidateProfilePatchSchema,
  mergeProfileIntoParsedPayload,
  patchInputToMergeFields,
} from "@/lib/candidates/candidate-profile-patch";
import { deleteCandidateIfNoOtherApplications } from "@/lib/candidates/merge-duplicate-application";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    patch: candidateProfilePatchSchema,
    existingCandidateId: z.string().regex(UUID_RE),
  })
  .strict();

/**
 * Confirms a duplicate flagged by `PATCH .../profile`'s pre-write check:
 * applies the edited fields onto the *existing* candidate instead of the
 * current one, repoints this application at that identity, and drops the
 * now-orphaned candidate row (mirrors `linkApplicationToExistingCandidate`,
 * but also carries the just-edited fields over instead of leaving them
 * unapplied).
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const manageAccess = await requirePermissionForApplication(
    auth.access,
    "candidate.manage",
    campaignAppliedId,
  );
  if (!manageAccess.ok) return manageAccess.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  const { patch, existingCandidateId } = parsed.data;
  const db = getPool();

  const campaignApplied = await getCampaignAppliedById(db, campaignAppliedId);
  if (!campaignApplied) {
    return Response.json({ error: "Application not found." }, { status: 404 });
  }

  if (!campaignApplied.active_cv_version_id) {
    return Response.json({ error: "No CV file on record." }, { status: 404 });
  }

  const cvVersion = await getCvDetailVersionById(db, campaignApplied.active_cv_version_id);
  if (!cvVersion) {
    return Response.json({ error: "Active CV version not found." }, { status: 404 });
  }

  const candidate = await getCandidateById(db, campaignApplied.candidate_id);
  if (!candidate) {
    return Response.json({ error: "Candidate not found." }, { status: 404 });
  }

  if (existingCandidateId === candidate.id) {
    return Response.json(
      { error: "existingCandidateId must differ from the current candidate." },
      { status: 400 },
    );
  }

  const existingCandidate = await getCandidateById(db, existingCandidateId);
  if (!existingCandidate) {
    return Response.json({ error: "Existing candidate not found." }, { status: 404 });
  }

  const nextSource = patch.source !== undefined ? patch.source : campaignApplied.source;
  const nextSourceOther = patch.source_other !== undefined ? patch.source_other : campaignApplied.source_other;

  if (nextSource === "Other") {
    const detail = typeof nextSourceOther === "string" ? nextSourceOther.trim() : "";
    if (!detail) {
      return Response.json(
        {
          error:
            "When source is Other, source_other must be a non-empty description (or set source to a fixed channel).",
        },
        { status: 400 },
      );
    }
  }

  const mergeFields = patchInputToMergeFields(patch);
  let mergedPayload = cvVersion.parsed_payload;
  if (Object.keys(mergeFields).length > 0) {
    mergedPayload = mergeProfileIntoParsedPayload(
      cvVersion.parsed_payload,
      mergeFields,
    );
  }

  try {
    const nextVersionNum = await getNextCvVersionNumber(db, campaignAppliedId);
    const oldCandidateId = candidate.id;

    await withTransaction(async (tx) => {
      // 1. Create a new version representing the profile edit
      const nextVersion = await createCvDetailVersion(tx, {
        campaignAppliedId,
        versionNumber: nextVersionNum,
        sourceEvent: "manual_edit",
        cvStoragePath: cvVersion.cv_storage_path,
        originalFilename: cvVersion.original_filename,
        mimeType: cvVersion.mime_type,
        cvFileSha256: cvVersion.cv_file_sha256,
        cvContentSha256: cvVersion.cv_content_sha256,
        parsingStatus: cvVersion.parsing_status,
        parsingError: cvVersion.parsing_error,
        parsedPayload: mergedPayload,
        skills: patch.skills !== undefined ? patch.skills : cvVersion.skills,
        role: patch.role !== undefined ? patch.role : cvVersion.role,
        degree: patch.degree !== undefined ? patch.degree : cvVersion.degree,
        education: patch.school !== undefined ? patch.school : cvVersion.education,
        experienceYears: patch.experience_years !== undefined ? patch.experience_years : (cvVersion.experience_years ? parseFloat(cvVersion.experience_years) : null),
        gpa: cvVersion.gpa,
        englishLevel: cvVersion.english_level,
        dateOfBirth: dbDateToIso(cvVersion.date_of_birth),
        studentYears: cvVersion.student_years,
        matchedOn: cvVersion.matched_on,
        changeSummary: patch.change_summary ?? null,
        createdBy: auth.userId,
      });

      // 2. Update campaign_applied active CV version, source fields, and
      // repoint it at the existing candidate's identity. `candidate_id`
      // isn't part of `updateCampaignApplied`'s whitelist, so it needs its
      // own statement here (same as `linkApplicationToExistingCandidate`).
      await tx.query(
        `UPDATE campaign_applied
         SET active_cv_version_id = $2, source = $3, source_other = $4,
             candidate_id = $5, updated_at = now()
         WHERE id = $1 AND deleted_at IS NULL`,
        [
          campaignAppliedId,
          nextVersion.id,
          nextSource,
          nextSource === "Other" ? nextSourceOther : null,
          existingCandidateId,
        ],
      );

      // 3. Apply the edited name/email/phone (etc.) onto the existing
      // candidate -- that's the identity this application now belongs to.
      const candidatePatch: Parameters<typeof updateCandidate>[2] = {};
      if (patch.name !== undefined) candidatePatch.name = patch.name;
      if (patch.email !== undefined) candidatePatch.email = patch.email;
      if (patch.phone !== undefined) candidatePatch.phone = patch.phone;

      if (Object.keys(candidatePatch).length > 0) {
        await updateCandidate(tx, existingCandidateId, candidatePatch);
      }

      // 4. Drop the old candidate row, but only if this was its last
      // application (it may have others from different jobs).
      await deleteCandidateIfNoOtherApplications(tx, oldCandidateId);

      // 5. Sync aggregate fields on the surviving candidate
      await syncCandidateAggregateFields(tx, existingCandidateId);
    });

    const enriched = await getCampaignAppliedAdminRowById(db, campaignAppliedId);
    if (!enriched) {
      return Response.json(
        { error: "Could not load updated candidate." },
        { status: 500 },
      );
    }

    return Response.json({ candidate: enriched });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return Response.json(
        {
          error:
            "Another candidate already uses this email or phone number. Refresh and check for duplicates before retrying.",
        },
        { status: 409 },
      );
    }
    const msg = err instanceof Error ? err.message : "Failed to merge candidate profile.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
