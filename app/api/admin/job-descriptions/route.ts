import {
  assertChapterIdsExist,
  parseViewerChapterIds,
  parseViewerEmailInput,
  replaceJobDescriptionViewerChapters,
  replaceJobDescriptionViewers,
  resolveViewerEmailsToUserIds,
} from "@/lib/admin/jd-viewer-sync";
import { MAX_CANDIDATE_EVAL_TEMPLATE_TEXT_LEN } from "@/lib/admin/candidate-evaluation-template-constants";
import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requireCanCreateJobs } from "@/lib/authz/require-permission";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { createJob, hardDeleteJob, updateJob, type CreateJobInput } from "@/lib/db/jobs";
import {
  getEvaluateTemplateById,
  getEvaluateTemplateByIdForRead,
  upsertJobEvaluateTemplate,
} from "@/lib/db/job-permissions";
import { syncJobRequirementsQuietly } from "@/lib/jd/sync-job-requirements";
import {
  listPipelineStages,
  reconcileJobStageMappings,
} from "@/lib/db/pipeline-stages";
import { buildFinalJdStoragePath } from "@/lib/jd/upload-constants";
import {
  optionalDateToDb,
  optionalToDb,
  requiredLine,
  utcDateStringToday,
} from "@/lib/jd/normalize-text";
import { queryJobDescriptionsWithEnrichment } from "@/lib/jd/list-with-enrichment";
import {
  isJdStatus,
  type JdStatus,
  type JobDescriptionFormData,
} from "@/lib/jd/types";
import { deleteObject, moveObject } from "@/lib/storage/s3";

type CreateBody = Partial<JobDescriptionFormData> & {
  /** S3 key from a prior POST /api/admin/job-openings/sign-upload + direct PUT to the returned signedUrl. */
  jdStoragePath?: string | null;
  jdOriginalFilename?: string | null;
  jdMimeType?: string | null;
  /** Recruiter accounts that may open this JD (must already exist). */
  viewerEmails?: string[] | string | null;
  /** Chapter ids: chapter *heads* of these chapters may open this JD (members need a profile grant). */
  viewerChapterIds?: string[] | null;
  pipelineStages?: string[] | null;
  /**
   * Id of a library evaluation template (`job_evaluate_templates`, `job_id`
   * NULL -- see `listEvaluateTemplatesCreatedBy`) to attach to this job. Must
   * belong to the caller. The new job's row points at the same file/text as
   * the library entry, not a copy -- editing or removing the library entry
   * later affects every job it was attached to this way. Mutually exclusive
   * with `evaluationTemplateText`.
   */
  reuseEvaluationTemplateId?: string | null;
  /**
   * Plain-text evaluation criteria to save as this job's own template.
   * File upload isn't offered at create time (there's no job id yet to key
   * the storage path on) -- build a file-based template in your library on
   * /admin/evaluation-template first, then reuse it here. Mutually exclusive
   * with `reuseEvaluationTemplateId`.
   */
  evaluationTemplateText?: string | null;
};

function sanitizeCreate(body: Partial<JobDescriptionFormData>): CreateJobInput {
  const status =
    body.status !== undefined && isJdStatus(String(body.status))
      ? (body.status as JdStatus)
      : "Pending";
  const endDate =
    status === "Done" || status === "Closed" ? utcDateStringToday() : null;
  return {
    position: requiredLine(body.position, 50),
    department: optionalToDb(body.department, 50),
    employmentStatus: optionalToDb(body.employment_status, 50),
    status,
    updateNote: optionalToDb(body.update_note, 50),
    workLocation: optionalToDb(body.work_location, 255),
    reporting: optionalToDb(body.reporting, 255),
    roleOverview: optionalToDb(body.role_overview, 255),
    dutiesAndResponsibilities: optionalToDb(body.duties_and_responsibilities),
    experienceRequirementsMustHave: optionalToDb(
      body.experience_requirements_must_have,
    ),
    experienceRequirementsNiceToHave: optionalToDb(
      body.experience_requirements_nice_to_have,
    ),
    whatWeOffer: optionalToDb(body.what_we_offer),
    startDate: optionalDateToDb(body.start_date),
    endDate,
    hiringDeadline: optionalDateToDb(body.hiring_deadline),
  };
}

const JD_LIST_MAX_LIMIT = 100;

export async function GET(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q");
  const startFrom = url.searchParams.get("startFrom");
  const startTo = url.searchParams.get("startTo");

  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");
  const limit =
    limitRaw != null
      ? Math.min(Math.max(1, Number(limitRaw) || 0), JD_LIST_MAX_LIMIT)
      : undefined;
  const offset =
    offsetRaw != null ? Math.max(0, Number(offsetRaw) || 0) : undefined;

  try {
    const { jobDescriptions, pagination, statusCounts } =
      await queryJobDescriptionsWithEnrichment(getPool(), {
        status,
        q,
        startFrom,
        startTo,
        limit,
        offset,
        visibleToUserId: auth.access.isHr ? undefined : auth.userId,
      });
    return Response.json({ jobDescriptions, pagination, statusCounts });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load job descriptions.";
    return Response.json({ error: message }, { status: 500 });
  }
}

const DEFAULT_PIPELINE_STAGE_CODES = ["cv_scan", "interview", "offer"];

export async function POST(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const createAccess = requireCanCreateJobs(auth.access);
  if (!createAccess.ok) return createAccess.response;

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const {
    jdStoragePath: jdStoragePathRaw,
    jdOriginalFilename,
    jdMimeType,
    viewerEmails: viewerEmailsRaw,
    viewerChapterIds: viewerChapterIdsRaw,
    pipelineStages: pipelineStagesRaw,
    reuseEvaluationTemplateId,
    evaluationTemplateText: evaluationTemplateTextRaw,
    ...formFields
  } = body;

  const jdStoragePath =
    typeof jdStoragePathRaw === "string" && jdStoragePathRaw.length > 0
      ? jdStoragePathRaw
      : null;
  if (!jdStoragePath) {
    return Response.json(
      { error: "Attaching a JD document is required to create a new definition." },
      { status: 400 },
    );
  }

  const db = getPool();

  const viewerEmails = parseViewerEmailInput(viewerEmailsRaw);
  // Chapter heads always retain access via their headed chapters.
  const viewerChapterIds = [
    ...new Set([
      ...parseViewerChapterIds(viewerChapterIdsRaw ?? undefined),
      ...auth.access.headedChapterIds,
    ]),
  ];

  let viewerUserIds: string[] = [];
  if (viewerEmails.length > 0) {
    const { idByEmail, notFound } = await resolveViewerEmailsToUserIds(
      db,
      viewerEmails,
    );
    if (notFound.length > 0) {
      return Response.json(
        {
          error: `Unknown account email(s): ${notFound.join(", ")}. Create the user first.`,
        },
        { status: 400 },
      );
    }
    viewerUserIds = viewerEmails.map((e) => idByEmail.get(e)!);
  }

  if (viewerChapterIds.length > 0) {
    const chapterCheck = await assertChapterIdsExist(db, viewerChapterIds);
    if (!chapterCheck.ok) {
      return Response.json(
        {
          error: `Unknown chapter id(s): ${chapterCheck.unknownIds.join(", ")}.`,
        },
        { status: 400 },
      );
    }
  }

  const newEvaluationTemplateText =
    typeof evaluationTemplateTextRaw === "string"
      ? evaluationTemplateTextRaw.trim()
      : "";
  if (
    reuseEvaluationTemplateId &&
    typeof reuseEvaluationTemplateId === "string" &&
    newEvaluationTemplateText
  ) {
    return Response.json(
      {
        error:
          "Choose either an existing evaluation template or write new criteria, not both.",
      },
      { status: 400 },
    );
  }
  if (newEvaluationTemplateText.length > MAX_CANDIDATE_EVAL_TEMPLATE_TEXT_LEN) {
    return Response.json(
      {
        error: `Evaluation criteria must be at most ${MAX_CANDIDATE_EVAL_TEMPLATE_TEXT_LEN} characters.`,
      },
      { status: 400 },
    );
  }

  // Validated up front (before the job even exists) rather than inside the
  // transaction below, so a bad id fails fast instead of after a job row is
  // already written. The picker shows an HR/admin caller every library entry
  // (see /api/admin/job-descriptions/evaluation-templates), so an HR/admin
  // reuse is looked up without an ownership check too; a chapter head's stays
  // scoped to their own entries via `getEvaluateTemplateById`. Either way
  // `job_id IS NULL` keeps this from reaching a job-scoped row, and a
  // mismatched id just reads as "not found" here.
  let reusedTemplate: Awaited<ReturnType<typeof getEvaluateTemplateById>> = null;
  if (typeof reuseEvaluationTemplateId === "string" && reuseEvaluationTemplateId) {
    reusedTemplate = auth.access.isHr
      ? await getEvaluateTemplateByIdForRead(db, reuseEvaluationTemplateId)
      : await getEvaluateTemplateById(db, reuseEvaluationTemplateId, auth.userId);
    if (!reusedTemplate || (!reusedTemplate.storage_path && !reusedTemplate.content_text)) {
      return Response.json(
        { error: "Evaluation template not found." },
        { status: 400 },
      );
    }
  }

  const input = sanitizeCreate(formFields as Partial<JobDescriptionFormData>);
  if (!input.position) {
    return Response.json({ error: "position is required." }, { status: 400 });
  }
  if (input.status !== "Pending") {
    if (!input.startDate) {
      return Response.json({ error: "Start date is required." }, { status: 400 });
    }
    if (!input.hiringDeadline) {
      return Response.json({ error: "Hiring deadline is required." }, { status: 400 });
    }
  }
  if (
    input.startDate &&
    input.hiringDeadline &&
    input.hiringDeadline < input.startDate
  ) {
    return Response.json(
      { error: "Hiring deadline must be on or after the start date." },
      { status: 400 },
    );
  }
  input.jdStoragePath = jdStoragePath;
  input.jdOriginalFilename =
    typeof jdOriginalFilename === "string" ? jdOriginalFilename : null;
  input.jdMimeType = typeof jdMimeType === "string" ? jdMimeType : null;
  input.createdBy = auth.userId;

  try {
    const job = await withTransaction(async (client) => {
      const created = await createJob(client, input);

      let resolvedStages = pipelineStagesRaw ?? undefined;
      if (!resolvedStages || resolvedStages.length === 0) {
        const allStages = await listPipelineStages(client);
        resolvedStages = DEFAULT_PIPELINE_STAGE_CODES.map(
          (code) => allStages.find((s) => s.code === code)?.id,
        ).filter((id): id is string => Boolean(id));
      }
      if (resolvedStages.length > 0) {
        await reconcileJobStageMappings(client, created.id, resolvedStages);
      }

      if (viewerUserIds.length > 0) {
        await replaceJobDescriptionViewers(client, {
          jobId: created.id,
          userIds: viewerUserIds,
          grantedBy: auth.userId,
        });
      }
      if (viewerChapterIds.length > 0) {
        await replaceJobDescriptionViewerChapters(client, {
          jobId: created.id,
          chapterIds: viewerChapterIds,
          grantedBy: auth.userId,
        });
      }

      // Reuse points the new job's row at the same storage_path/content_text
      // as the source -- not a copy. Editing or removing the source template
      // later will affect this job too (see job-descriptions/route.ts POST docs).
      if (reusedTemplate) {
        await upsertJobEvaluateTemplate(client, {
          jobId: created.id,
          storagePath: reusedTemplate.storage_path,
          originalFilename: reusedTemplate.original_filename,
          mimeType: reusedTemplate.mime_type,
          contentText: reusedTemplate.content_text,
          createdBy: auth.userId,
          updatedBy: auth.userId,
        });
      } else if (newEvaluationTemplateText) {
        // Freshly written criteria, not reused from another job. File upload
        // isn't offered here -- evaluation-template/sign-upload needs a job
        // id, which doesn't exist yet at this point in the request.
        await upsertJobEvaluateTemplate(client, {
          jobId: created.id,
          contentText: newEvaluationTemplateText,
          createdBy: auth.userId,
          updatedBy: auth.userId,
        });
      }

      return created;
    });

    // The job id only exists after insert, so the JD file is uploaded to a
    // temp `jd/` key up front (see job-openings/sign-upload) and moved to its
    // final `job_descriptions/{jobId}/` key here, now that the id is known.
    const finalJdStoragePath = buildFinalJdStoragePath(
      job.id,
      jdStoragePath,
      input.jdOriginalFilename,
    );

    try {
      await moveObject(jdStoragePath, finalJdStoragePath);
      const updated = await updateJob(db, job.id, { jdStoragePath: finalJdStoragePath });
      if (updated) Object.assign(job, updated);
    } catch (e) {
      // Never leave a persisted job pointing at the temp `jd/` key: a job
      // stuck there indefinitely would be indistinguishable from a genuinely
      // abandoned upload to any future age-based cleanup job for that
      // prefix, which could then delete a file still in use. Roll the job
      // back instead and make the caller retry -- a just-created job has no
      // campaign_applied rows yet, so this is safe to hard-delete.
      await hardDeleteJob(db, job.id).catch(() => {});
      await deleteObject(finalJdStoragePath).catch(() => {});
      console.error("Failed to move JD file to its final storage path:", e);
      return Response.json(
        {
          error:
            "Job description was not created: the JD file failed to finalize. Please retry.",
        },
        { status: 500 },
      );
    }

    // Only once the JD file is at its final key, so the extractor (which reads
    // the file back through `resolveJobDescriptionText`) sees the moved object.
    // Non-fatal: the job row is already committed, so a failed extraction
    // leaves the checklist empty rather than failing the create.
    await syncJobRequirementsQuietly(job.id);

    return Response.json({ jobDescription: job }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create job description.";
    return Response.json({ error: message }, { status: 500 });
  }
}
