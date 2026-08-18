import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { canViewSalary } from "@/lib/authz/can";
import { redactAdminRowSalaryForAccess } from "@/lib/authz/redact-salary";
import { requirePermissionForApplication } from "@/lib/authz/require-permission";

import { getCampaignAppliedAdminRowById, listApplicationsForCandidate } from "@/lib/db/campaign-applied-list";
import { getCampaignAppliedById, updateCampaignApplied } from "@/lib/db/campaign-applied";
import { getCvDetailVersionById } from "@/lib/db/cv-detail-versions";
import { getCandidateById, syncCandidateAggregateFields } from "@/lib/db/candidates";
import { findCandidatesByDedupeSignals } from "@/lib/db/candidates-dedupe";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { isUniqueViolation } from "@/lib/db/query-helpers";
import { applyManualProfileEdit } from "@/lib/candidates/apply-manual-profile-edit";
import { resolveApplicationStages } from "@/lib/candidates/resolve-application-stage";
import {
  candidateProfilePatchSchema,
  validateSourceOther,
  type ProfileEditConflict,
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

  if (patch.expected_salary !== undefined) {
    const allowed = await canViewSalary(
      db,
      auth.access,
      campaignApplied.job_id,
    );
    if (!allowed) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const salaryOnly =
    patch.expected_salary !== undefined &&
    Object.entries(patch).every(
      ([key, value]) =>
        value === undefined ||
        key === "expected_salary" ||
        key === "change_summary",
    );

  // Salary lives on campaign_applied — skip CV versioning for salary-only edits.
  if (salaryOnly) {
    await updateCampaignApplied(db, campaignAppliedId, {
      expectedSalary: patch.expected_salary,
    });
    const enriched = await getCampaignAppliedAdminRowById(db, campaignAppliedId);
    if (!enriched) {
      return Response.json(
        { error: "Could not load updated candidate." },
        { status: 500 },
      );
    }
    return Response.json({
      candidate: await redactAdminRowSalaryForAccess(db, auth.access, enriched),
    });
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

  // Only validate when this patch actually touches source/source_other --
  // otherwise an unrelated edit (e.g. skills-only) on a row with pre-existing
  // "Other" + no description would be spuriously blocked by data it never
  // asked to change.
  if (patch.source !== undefined || patch.source_other !== undefined) {
    const sourceOtherError = validateSourceOther(nextSource, nextSourceOther);
    if (sourceOtherError) {
      return Response.json({ error: sourceOtherError }, { status: 400 });
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
      let matchedFields: Array<"email" | "phone"> = [];
      let onlyMatch: (typeof otherPersonMatches)[number] | null = null;
      for (const m of otherPersonMatches) {
        if (seen.has(m.candidate_id)) continue;
        seen.add(m.candidate_id);
        onlyMatch = m;
        const emailHit =
          !!normalizedEmail && m.candidate_email?.toLowerCase() === normalizedEmail;
        const phoneHit =
          phoneVariants.length > 0 &&
          !!m.candidate_phone &&
          phoneVariants.includes(m.candidate_phone);
        matchedFields = [
          ...(emailHit ? (["email"] as const) : []),
          ...(phoneHit ? (["phone"] as const) : []),
        ];
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

      // Only offer a merge action when the conflict is unambiguous (exactly
      // one other candidate matched) -- with 2+ distinct candidates, there's
      // no single sensible merge target, so fall back to the plain-text
      // error only, same as before this feature existed.
      let conflict: ProfileEditConflict | undefined;
      if (seen.size === 1 && onlyMatch) {
        const applications = await listApplicationsForCandidate(db, onlyMatch.candidate_id);
        // `listApplicationsForCandidate`'s stage/sub-stage columns are raw
        // (possibly-NULL) `current_job_stage_mapping_id`/`current_sub_state_id`
        // joins -- a brand-new, never-manually-moved application has both
        // NULL even though it obviously already has a CV on file. Resolve
        // through the same helper the candidate-detail page's application
        // list and dashboard drawer use, so a fresh application shows its
        // real initial stage (e.g. "CV Scan · New") instead of misleadingly
        // reading as if nothing had been submitted yet.
        const resolvedByRow = await resolveApplicationStages(db, applications);
        conflict = {
          candidateId: onlyMatch.candidate_id,
          candidateName: onlyMatch.candidate_name,
          matchedFields,
          applications: applications.map((a) => ({
            id: a.id,
            jobId: a.job_id,
            jobTitle: a.job_position,
            appliedAt: a.created_at.toISOString(),
            ...resolvedByRow.get(a)!,
          })),
        };
      }

      return Response.json(
        {
          error: `Cannot save -- this would match an existing candidate's contact info: ${conflicts.join(", ")}. Use different contact info, or resolve the duplicate from the candidate list before editing.`,
          ...(conflict ? { conflict } : {}),
        },
        { status: 409 },
      );
    }
  }

  try {
    await withTransaction(async (tx) => {
      await applyManualProfileEdit(tx, {
        campaignAppliedId,
        candidateId: campaignApplied.candidate_id,
        baseCvVersion: cvVersion,
        nextSource,
        nextSourceOther,
        patch,
        createdBy: auth.userId,
      });
      await syncCandidateAggregateFields(tx, campaignApplied.candidate_id);
    });

    const enriched = await getCampaignAppliedAdminRowById(db, campaignAppliedId);
    if (!enriched) {
      return Response.json(
        { error: "Could not load updated candidate." },
        { status: 500 },
      );
    }

    return Response.json({
      candidate: await redactAdminRowSalaryForAccess(db, auth.access, enriched),
    });
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
