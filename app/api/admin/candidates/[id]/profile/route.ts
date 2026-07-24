import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionForApplication } from "@/lib/authz/require-permission";

import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import { getCampaignAppliedById, updateCampaignApplied } from "@/lib/db/campaign-applied";
import { getCvDetailVersionById, getNextCvVersionNumber, createCvDetailVersion } from "@/lib/db/cv-detail-versions";
import { getCandidateById, updateCandidate, syncCandidateAggregateFields } from "@/lib/db/candidates";
import { findCandidatesByDedupeSignals } from "@/lib/db/candidates-dedupe";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { dbDateToIso, isUniqueViolation } from "@/lib/db/query-helpers";
import {
  candidateProfilePatchSchema,
  mergeProfileIntoParsedPayload,
  patchInputToMergeFields,
} from "@/lib/candidates/candidate-profile-patch";
import {
  normalizeEmailFromPayload,
  normalizePhoneFromPayload,
} from "@/lib/candidates/duplicate-detection";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
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

  // Block the edit outright if it would give this candidate the same
  // email/phone as a *different* existing candidate -- checked before
  // writing anything so no throwaway `cv_detail_versions` row gets created
  // for an edit that's going to be rejected anyway. There's no merge path:
  // if the new contact info collides, the edit must use different contact
  // info, or the duplicate must be resolved from the candidate list first.
  const nextEmail = patch.email !== undefined ? patch.email : candidate.email;
  const nextPhone = patch.phone !== undefined ? patch.phone : candidate.phone;
  const normalizedEmail = normalizeEmailFromPayload(nextEmail);
  const { phone: normalizedPhone, variants: phoneVariants } =
    normalizePhoneFromPayload(nextPhone);
  if (normalizedEmail || normalizedPhone) {
    const dedupeMatches = await findCandidatesByDedupeSignals(
      db,
      {
        email: normalizedEmail,
        phoneVariants: phoneVariants.length > 0 ? phoneVariants : undefined,
      },
      campaignAppliedId,
    );
    const otherPersonMatches = dedupeMatches.filter(
      (m) => m.candidate_id !== candidate.id,
    );
    if (otherPersonMatches.length > 0) {
      const seen = new Set<string>();
      const conflicts: string[] = [];
      for (const m of otherPersonMatches) {
        if (seen.has(m.candidate_id)) continue;
        seen.add(m.candidate_id);
        const emailHit =
          !!normalizedEmail && m.candidate_email?.toLowerCase() === normalizedEmail;
        const phoneHit =
          phoneVariants.length > 0 &&
          !!m.candidate_phone &&
          phoneVariants.includes(m.candidate_phone);
        const field =
          emailHit && phoneHit
            ? "email and phone"
            : emailHit
              ? "email"
              : phoneHit
                ? "phone"
                : "email/phone";
        conflicts.push(`${m.candidate_name ?? "another candidate"} (${field})`);
      }
      return Response.json(
        {
          error: `Cannot save -- this would match an existing candidate's contact info: ${conflicts.join(", ")}. Use different contact info, or resolve the duplicate from the candidate list before editing.`,
        },
        { status: 409 },
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
        dateOfBirth: dbDateToIso(cvVersion.date_of_birth),
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
    if (isUniqueViolation(err)) {
      return Response.json(
        {
          error:
            "Another candidate already uses this email or phone number. Use different contact info.",
        },
        { status: 409 },
      );
    }
    const msg = err instanceof Error ? err.message : "Failed to update profile.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
