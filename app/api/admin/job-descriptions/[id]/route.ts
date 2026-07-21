import {
  assertChapterIdsExist,
  fetchViewerChapterIdsForJobDescription,
  fetchViewerEmailsForJobDescription,
  parseViewerChapterIds,
  parseViewerEmailInput,
  replaceJobDescriptionViewerChapters,
  syncJobDescriptionViewersFromEmails,
} from "@/lib/admin/jd-viewer-sync";
import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requireJobViewAccess } from "@/lib/authz/require-job-view";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { getJobById, softDeleteJob, updateJob, type UpdateJobInput } from "@/lib/db/jobs";
import {
  listJobStageMappings,
  reconcileJobStageMappings,
} from "@/lib/db/pipeline-stages";
import {
  optionalDateToDb,
  optionalToDb,
  requiredLine,
  utcDateStringToday,
} from "@/lib/jd/normalize-text";
import {
  coerceJdStatus,
  isJdStatus,
  type JobDescriptionFormData,
  type JdEditFormData,
  type JdStatus,
} from "@/lib/jd/types";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseId(raw: string): string | null {
  return UUID_RE.test(raw) ? raw : null;
}

/** Standard (non-intake) edit: the JD workflow fields, e.g. status transitions from the list view. */
function sanitizeStandard(body: Partial<JobDescriptionFormData>): UpdateJobInput {
  const result: UpdateJobInput = {
    dutiesAndResponsibilities: optionalToDb(body.duties_and_responsibilities),
    experienceRequirementsMustHave: optionalToDb(
      body.experience_requirements_must_have,
    ),
    experienceRequirementsNiceToHave: optionalToDb(
      body.experience_requirements_nice_to_have,
    ),
    whatWeOffer: optionalToDb(body.what_we_offer),
  };

  if (body.position !== undefined) result.position = requiredLine(body.position, 50);
  if (body.department !== undefined)
    result.department = optionalToDb(body.department, 50);
  if (body.employment_status !== undefined)
    result.employmentStatus = optionalToDb(body.employment_status, 50);
  if (body.update_note !== undefined)
    result.updateNote = optionalToDb(body.update_note, 50);
  if (body.work_location !== undefined)
    result.workLocation = optionalToDb(body.work_location, 255);
  if (body.reporting !== undefined)
    result.reporting = optionalToDb(body.reporting, 255);
  if (body.role_overview !== undefined)
    result.roleOverview = optionalToDb(body.role_overview, 255);
  if (body.start_date !== undefined) {
    result.startDate = optionalDateToDb(body.start_date);
  }
  if (body.status !== undefined && isJdStatus(String(body.status))) {
    result.status = body.status;
  }

  return result;
}

/** Detailed intake edit (Edit Intake modal). */
function sanitizeEditPayload(body: Partial<JdEditFormData>): UpdateJobInput {
  const result: UpdateJobInput = {};

  if (body.position !== undefined) result.position = requiredLine(body.position, 50);
  if (body.level !== undefined) result.level = optionalToDb(body.level, 100);
  if (body.headcount !== undefined) {
    const n = body.headcount === "" ? null : Number(body.headcount);
    result.headcount = n !== null && !Number.isNaN(n) && n > 0 ? n : null;
  }
  if (body.hire_type !== undefined)
    result.hireType = optionalToDb(body.hire_type, 50);
  if (body.reporting !== undefined)
    result.reporting = optionalToDb(body.reporting, 255);
  if (body.project_info !== undefined)
    result.projectInfo = optionalToDb(body.project_info);
  if (body.duties_and_responsibilities !== undefined)
    result.dutiesAndResponsibilities = optionalToDb(
      body.duties_and_responsibilities,
    );
  if (body.team_size !== undefined)
    result.teamSize = optionalToDb(body.team_size);
  if (body.experience_requirements_must_have !== undefined)
    result.experienceRequirementsMustHave = optionalToDb(
      body.experience_requirements_must_have,
    );
  if (body.experience_requirements_nice_to_have !== undefined)
    result.experienceRequirementsNiceToHave = optionalToDb(
      body.experience_requirements_nice_to_have,
    );
  if (body.language_requirements !== undefined)
    result.languageRequirements = optionalToDb(body.language_requirements);
  if (body.career_development !== undefined)
    result.careerDevelopment = optionalToDb(body.career_development);
  if (body.other_requirements !== undefined)
    result.otherRequirements = optionalToDb(body.other_requirements);
  if (body.salary_range !== undefined)
    result.salaryRange = optionalToDb(body.salary_range, 255);
  if (body.project_allowances !== undefined)
    result.projectAllowances = optionalToDb(body.project_allowances);
  if (body.interview_process !== undefined)
    result.interviewProcess = optionalToDb(body.interview_process);
  if (body.hiring_deadline !== undefined)
    result.hiringDeadline = optionalDateToDb(body.hiring_deadline);

  return result;
}

function endDateForStatusTransition(
  prevStatus: string,
  next: JdStatus,
): string | null | undefined {
  const prev = coerceJdStatus(prevStatus);
  const prevTerminal = prev === "Done" || prev === "Closed";
  const nextTerminal = next === "Done" || next === "Closed";
  if (nextTerminal && !prevTerminal) return utcDateStringToday();
  if (!nextTerminal && prevTerminal) return null;
  return undefined;
}

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const jobId = parseId(id);
  if (!jobId) return Response.json({ error: "Invalid id." }, { status: 400 });

  const jobAccess = await requireJobViewAccess(auth.access, jobId);
  if (!jobAccess.ok) return jobAccess.response;

  const db = getPool();
  const job = await getJobById(db, jobId);
  if (!job) return Response.json({ error: "Not found." }, { status: 404 });

  let viewerEmails: string[] = [];
  let viewerChapterIds: string[] = [];
  let pipelineStages: string[] = [];
  try {
    viewerEmails = await fetchViewerEmailsForJobDescription(db, jobId);
    viewerChapterIds = await fetchViewerChapterIdsForJobDescription(db, jobId);
    const mappings = await listJobStageMappings(db, jobId);
    pipelineStages = mappings.map((m) => m.pipeline_stage_id);
  } catch (err) {
    console.error("Failed to fetch pipeline stages or viewers:", err);
  }

  return Response.json({
    jobDescription: job,
    viewerEmails,
    viewerChapterIds,
    pipelineStages,
  });
}

export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const jobId = parseId(id);
  if (!jobId) return Response.json({ error: "Invalid id." }, { status: 400 });

  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const hasViewerKey = Object.prototype.hasOwnProperty.call(
    raw,
    "viewerEmails",
  );
  const viewerEmailsRaw = raw.viewerEmails;
  delete raw.viewerEmails;

  const hasViewerChapterKey = Object.prototype.hasOwnProperty.call(
    raw,
    "viewerChapterIds",
  );
  const viewerChapterIdsRaw = raw.viewerChapterIds;
  delete raw.viewerChapterIds;

  const hasPipelineStages = Object.prototype.hasOwnProperty.call(
    raw,
    "pipelineStages",
  );
  const pipelineStagesRaw = raw.pipelineStages;
  delete raw.pipelineStages;

  const hasJdUpdate = Object.keys(raw).length > 0;
  if (
    !hasJdUpdate &&
    !hasViewerKey &&
    !hasViewerChapterKey &&
    !hasPipelineStages
  ) {
    return Response.json({ error: "No updates provided." }, { status: 400 });
  }

  const db = getPool();
  const existing = await getJobById(db, jobId);
  if (!existing) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  if (hasJdUpdate) {
    const body = raw as Partial<JobDescriptionFormData> &
      Partial<JdEditFormData> & { _editMode?: boolean };

    let patch: UpdateJobInput;

    if (body._editMode) {
      const { _editMode: _, ...editBody } = body;
      patch = sanitizeEditPayload(editBody as Partial<JdEditFormData>);
      if (editBody.position !== undefined && !patch.position) {
        return Response.json(
          { error: "position is required." },
          { status: 400 },
        );
      }
    } else {
      patch = sanitizeStandard(body as Partial<JobDescriptionFormData>);
      if (body.position !== undefined && !patch.position) {
        return Response.json(
          { error: "position is required." },
          { status: 400 },
        );
      }
      if (body.status !== undefined && isJdStatus(String(body.status))) {
        const endDelta = endDateForStatusTransition(
          existing.status,
          body.status as JdStatus,
        );
        if (endDelta !== undefined) {
          patch.endDate = endDelta;
        }
      }
    }

    patch.updatedBy = auth.userId;
    await updateJob(db, jobId, patch);
  }

  if (hasPipelineStages) {
    const pipelineStages = pipelineStagesRaw as string[] | null | undefined;
    try {
      await withTransaction((client) =>
        reconcileJobStageMappings(client, jobId, pipelineStages),
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? `Failed to reconcile stage mappings: ${err.message}`
          : "Failed to reconcile stage mappings.";
      return Response.json({ error: message }, { status: 500 });
    }
  }

  if (hasViewerKey || hasViewerChapterKey) {
    if (hasViewerKey) {
      const emails = parseViewerEmailInput(
        viewerEmailsRaw as string | string[] | null | undefined,
      );
      const { notFound } = await withTransaction((client) =>
        syncJobDescriptionViewersFromEmails(client, {
          jobId,
          emails,
          grantedBy: auth.userId,
        }),
      );
      if (notFound.length > 0) {
        return Response.json(
          {
            error: `Unknown account email(s): ${notFound.join(", ")}. Create the user first.`,
          },
          { status: 400 },
        );
      }
    }
    if (hasViewerChapterKey) {
      const chapterIds = parseViewerChapterIds(
        viewerChapterIdsRaw as string[] | string | null | undefined,
      );
      const chapterCheck = await assertChapterIdsExist(db, chapterIds);
      if (!chapterCheck.ok) {
        return Response.json(
          {
            error: `Unknown chapter id(s): ${chapterCheck.unknownIds.join(", ")}.`,
          },
          { status: 400 },
        );
      }
      await withTransaction((client) =>
        replaceJobDescriptionViewerChapters(client, {
          jobId,
          chapterIds,
          grantedBy: auth.userId,
        }),
      );
    }
  }

  const jdRow = await getJobById(db, jobId);
  if (!jdRow) return Response.json({ error: "Not found." }, { status: 404 });

  let viewerEmails: string[] = [];
  let viewerChapterIds: string[] = [];
  try {
    viewerEmails = await fetchViewerEmailsForJobDescription(db, jobId);
    viewerChapterIds = await fetchViewerChapterIdsForJobDescription(db, jobId);
  } catch {
    // optional
  }

  return Response.json({
    jobDescription: jdRow,
    viewerEmails,
    viewerChapterIds,
  });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const jobId = parseId(id);
  if (!jobId) return Response.json({ error: "Invalid id." }, { status: 400 });

  const deleted = await softDeleteJob(getPool(), jobId);
  if (!deleted) return Response.json({ error: "Not found." }, { status: 404 });

  return new Response(null, { status: 204 });
}
