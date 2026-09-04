import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { createApplicationWithInitialCv } from "@/lib/db/campaign-applied";
import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import { getCandidateById } from "@/lib/db/candidates";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { getLatestCvDetailVersionForCandidate } from "@/lib/db/cv-detail-versions";
import { getJobById } from "@/lib/db/jobs";
import { isUniqueViolation } from "@/lib/db/query-helpers";
import { fileUploadQueue } from "@/lib/queue/file-upload.queue";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ candidateId: string }> };

type Body = { jobId?: string };

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
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

  const candidate = await getCandidateById(db, candidateId);
  if (!candidate) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const job = await getJobById(db, jobId);
  if (!job) {
    return Response.json({ error: "Job not found." }, { status: 400 });
  }

  const latestCv = await getLatestCvDetailVersionForCandidate(db, candidateId);
  if (!latestCv || !latestCv.cv_storage_path) {
    return Response.json(
      { error: "No CV on record to copy for the new application." },
      { status: 400 },
    );
  }
  const sourceCvStoragePath = latestCv.cv_storage_path;

  let newApplicationId: string;
  try {
    const { application: newApplication, cvVersion: newCvVersion } =
      await withTransaction((tx) =>
        createApplicationWithInitialCv(tx, {
          candidateId,
          jobId,
          cv: {
            sourceEvent: "initial_upload",
            buildCvStoragePath: () => sourceCvStoragePath,
            originalFilename: latestCv.original_filename,
            mimeType: latestCv.mime_type,
            skills: latestCv.skills,
            role: latestCv.role,
            degree: latestCv.degree,
            education: latestCv.education,
            experienceYears: latestCv.experience_years
              ? parseFloat(latestCv.experience_years)
              : null,
            gpa: latestCv.gpa,
            englishLevel: latestCv.english_level,
            dateOfBirth: latestCv.date_of_birth
              ? latestCv.date_of_birth.toISOString().slice(0, 10)
              : null,
            studentYears: latestCv.student_years,
            cvFileSha256: latestCv.cv_file_sha256,
            cvContentSha256: latestCv.cv_content_sha256,
            matchedOn: null,
            createdBy: auth.userId,
          },
        }),
      );
    newApplicationId = newApplication.id;

    await fileUploadQueue.add(
      "rerun-ai-matching",
      { cvDetailVersionId: newCvVersion.id },
      {
        deduplication: { id: `rerun-ai-matching-${newApplication.id}` },
        priority: 2,
      },
    );
  } catch (e) {
    // Two concurrent requests can both target the same candidate+job --
    // campaign_applied_candidate_job_unique_idx is what actually closes that
    // race, so a unique violation here means someone else's request won it.
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
