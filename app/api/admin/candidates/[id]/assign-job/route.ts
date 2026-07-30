import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import {
  requirePermissionForApplication,
  requirePermissionOnJob,
} from "@/lib/authz/require-permission";
import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import {
  assignJobToCampaignApplied,
  createApplicationWithInitialCv,
  getCampaignAppliedByCandidateAndJob,
} from "@/lib/db/campaign-applied";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { getCvDetailVersionById } from "@/lib/db/cv-detail-versions";
import { getJobById } from "@/lib/db/jobs";
import { isUniqueViolation } from "@/lib/db/query-helpers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

type Body = { jobId?: string };

/**
 * Assigns a job to a candidate, starting from a specific application
 * (`campaignAppliedId`):
 *
 * - Pool/unassigned application (CJ4X9M, `job_id IS NULL`) -- attaches the
 *   job in place on this same row (the only way a job-less application ever
 *   gets one). Deliberately does not move the pipeline stage or trigger
 *   JD-match scoring: a freshly-assigned application starts stage-less (same
 *   as the normal creation-time default) and JD-match stays a separate,
 *   explicit action.
 * - Application that already has a job -- this candidate is applying to an
 *   *additional* job, so a brand-new `campaign_applied` row is created for
 *   it instead of overwriting the existing one (which keeps its own stage/
 *   JD-match history untouched). Its CV is cloned from this application's
 *   active CV version (same `cv_storage_path`, not a re-upload) as a fresh
 *   version-1 -- mirrors how a cross-job duplicate CV upload already gets
 *   linked onto an existing person via `linkApplicationToExistingCandidate`.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
  if (!jobId || !UUID_RE.test(jobId)) {
    return Response.json({ error: "Select a job to assign." }, { status: 400 });
  }

  const db = getPool();

  const job = await getJobById(db, jobId);
  if (!job) {
    return Response.json({ error: "Job not found." }, { status: 400 });
  }

  const manageAccess = await requirePermissionOnJob(
    auth.access,
    "candidate.manage",
    jobId,
  );
  if (!manageAccess.ok) return manageAccess.response;

  // Also requires access to the *source* application's own job -- otherwise
  // someone with candidate.manage only on the target job could clone a CV
  // out of a job they can't otherwise see, just by knowing its id.
  const sourceAccess = await requirePermissionForApplication(
    auth.access,
    "candidate.manage",
    campaignAppliedId,
  );
  if (!sourceAccess.ok) return sourceAccess.response;
  const { application } = sourceAccess;

  if (!application.job_id) {
    let updated;
    try {
      updated = await assignJobToCampaignApplied(db, campaignAppliedId, jobId);
    } catch (e) {
      // Same candidate can have more than one pool application -- if another
      // one just got assigned this exact job first,
      // campaign_applied_candidate_job_unique_idx rejects this one too.
      if (isUniqueViolation(e)) {
        return Response.json(
          { error: "This candidate already has an application for that job." },
          { status: 409 },
        );
      }
      throw e;
    }
    if (!updated) {
      return Response.json(
        { error: "This candidate is already assigned to a job." },
        { status: 409 },
      );
    }
    const row = await getCampaignAppliedAdminRowById(db, campaignAppliedId);
    return Response.json({ candidate: row, created: false });
  }

  // Already applying somewhere -- add this job as a second, separate
  // application rather than overwriting the first. This existence check is
  // just a fast path for the common case and friendlier error message --
  // the actual race (two concurrent requests both passing this check for
  // the same candidate+job) is closed at the DB level by
  // campaign_applied_candidate_job_unique_idx (migration
  // 1785313169358_campaign-applied-candidate-job-unique.sql); the insert
  // below catches that constraint's violation and reports the same 409.
  if (jobId === application.job_id) {
    return Response.json(
      { error: "This candidate is already applying to that job." },
      { status: 409 },
    );
  }
  const existingForJob = await getCampaignAppliedByCandidateAndJob(
    db,
    application.candidate_id,
    jobId,
  );
  if (existingForJob) {
    return Response.json(
      { error: "This candidate already has an application for that job." },
      { status: 409 },
    );
  }

  if (!application.active_cv_version_id) {
    return Response.json(
      { error: "No CV on record to copy for the new application." },
      { status: 400 },
    );
  }
  const sourceCv = await getCvDetailVersionById(db, application.active_cv_version_id);
  if (!sourceCv || !sourceCv.cv_storage_path) {
    return Response.json(
      { error: "No CV on record to copy for the new application." },
      { status: 400 },
    );
  }
  const sourceCvStoragePath = sourceCv.cv_storage_path;

  let newApplicationId: string;
  try {
    const { application: newApplication } = await withTransaction((tx) =>
      createApplicationWithInitialCv(tx, {
        candidateId: application.candidate_id,
        jobId,
        source: application.source,
        sourceOther: application.source_other,
        expectedSalary: application.expected_salary,
        cv: {
          sourceEvent: "initial_upload",
          buildCvStoragePath: () => sourceCvStoragePath,
          originalFilename: sourceCv.original_filename,
          mimeType: sourceCv.mime_type,
          parsingStatus: sourceCv.parsing_status,
          parsingError: sourceCv.parsing_error,
          parsedPayload: sourceCv.parsed_payload,
          skills: sourceCv.skills,
          role: sourceCv.role,
          degree: sourceCv.degree,
          education: sourceCv.education,
          experienceYears: sourceCv.experience_years
            ? parseFloat(sourceCv.experience_years)
            : null,
          gpa: sourceCv.gpa,
          englishLevel: sourceCv.english_level,
          dateOfBirth: sourceCv.date_of_birth
            ? sourceCv.date_of_birth.toISOString().slice(0, 10)
            : null,
          studentYears: sourceCv.student_years,
          cvFileSha256: sourceCv.cv_file_sha256,
          cvContentSha256: sourceCv.cv_content_sha256,
          matchedOn: null,
          createdBy: auth.userId,
        },
      }),
    );
    newApplicationId = newApplication.id;
  } catch (e) {
    // Two concurrent requests can both pass the `existingForJob` check above
    // for the same candidate+job -- campaign_applied_candidate_job_unique_idx
    // is what actually closes that race, so a unique violation here means
    // someone else's request just won it.
    if (isUniqueViolation(e)) {
      return Response.json(
        { error: "This candidate already has an application for that job." },
        { status: 409 },
      );
    }
    throw e;
  }

  const row = await getCampaignAppliedAdminRowById(db, newApplicationId);
  return Response.json({ candidate: row, created: true });
}
