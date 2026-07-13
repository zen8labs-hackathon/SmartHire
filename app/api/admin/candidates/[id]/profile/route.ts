import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import { getCampaignAppliedById, updateCampaignApplied } from "@/lib/db/campaign-applied";
import { getCvDetailVersionById, getNextCvVersionNumber, createCvDetailVersion } from "@/lib/db/cv-detail-versions";
import { getCandidateById, updateCandidate, syncCandidateAggregateFields } from "@/lib/db/candidates";
import { getPool, withTransaction } from "@/lib/db/config/client";
import {
  candidateProfilePatchSchema,
  mergeProfileIntoParsedPayload,
  patchInputToMergeFields,
} from "@/lib/candidates/candidate-profile-patch";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = candidateProfilePatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  const patch = parsed.data;
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
        dateOfBirth: cvVersion.date_of_birth ? cvVersion.date_of_birth.toISOString().split("T")[0] : null,
        studentYears: cvVersion.student_years,
        matchedOn: cvVersion.matched_on,
        changeSummary: patch.change_summary ?? null,
        createdBy: auth.userId,
      });

      // 2. Update campaign_applied active CV version and source fields
      await updateCampaignApplied(tx, campaignAppliedId, {
        activeCvVersionId: nextVersion.id,
        source: nextSource,
        sourceOther: nextSource === "Other" ? nextSourceOther : null,
      });

      // 3. Update candidate (person) fields (name, email, phone)
      const candidatePatch: Parameters<typeof updateCandidate>[2] = {};
      if (patch.name !== undefined) candidatePatch.name = patch.name;
      if (patch.email !== undefined) candidatePatch.email = patch.email;
      if (patch.phone !== undefined) candidatePatch.phone = patch.phone;

      if (Object.keys(candidatePatch).length > 0) {
        await updateCandidate(tx, campaignApplied.candidate_id, candidatePatch);
      }

      // 4. Sync aggregate fields
      await syncCandidateAggregateFields(tx, campaignApplied.candidate_id);
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
    const msg = err instanceof Error ? err.message : "Failed to update profile.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
