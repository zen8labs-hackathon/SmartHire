import {
  assertChapterIdsExist,
  parseViewerChapterIds,
  parseViewerEmailInput,
  replaceJobDescriptionViewerChapters,
  replaceJobDescriptionViewers,
  resolveViewerEmailsToUserIds,
} from "@/lib/admin/jd-viewer-sync";
import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { createJob, type CreateJobInput } from "@/lib/db/jobs";
import {
  listPipelineStages,
  reconcileJobStageMappings,
} from "@/lib/db/pipeline-stages";
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

type CreateBody = Partial<JobDescriptionFormData> & {
  /** S3 key from a prior POST /api/admin/job-openings/sign-upload + direct PUT to the returned signedUrl. */
  jdStoragePath?: string | null;
  jdOriginalFilename?: string | null;
  jdMimeType?: string | null;
  /** Recruiter accounts that may open this JD (must already exist). */
  viewerEmails?: string[] | string | null;
  /** Chapter ids: all members of these chapters may open this JD. */
  viewerChapterIds?: string[] | null;
  pipelineStages?: string[] | null;
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
    criteria: optionalToDb(body.criteria),
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
      });
    return Response.json({ jobDescriptions, pagination, statusCounts });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load job descriptions.";
    return Response.json({ error: message }, { status: 500 });
  }
}

const DEFAULT_PIPELINE_STAGE_CODES = ["cv_scan", "interview", "offer"];

export async function POST(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

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
  const viewerChapterIds = parseViewerChapterIds(
    viewerChapterIdsRaw ?? undefined,
  );

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

      return created;
    });

    return Response.json({ jobDescription: job }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create job description.";
    return Response.json({ error: message }, { status: 500 });
  }
}
