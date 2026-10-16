import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import {
  requireCanCreateJobs,
  requirePermissionOnJob,
} from "@/lib/authz/require-permission";
import { getPool } from "@/lib/db/config/client";
import { getJobById, updateJob } from "@/lib/db/jobs";
import { isPipelineUsable } from "@/lib/db/pipelines";
import { listAllowedChaptersForJob } from "@/lib/db/job-permissions";
import {
  CreatePositionError,
  canCreateInChapter,
  createDraftPosition,
} from "@/lib/position/create-position";
import { draftNote } from "@/lib/position/jd-state";
import { queryPositionsWithEnrichment } from "@/lib/position/list-with-enrichment";
import { isHireType } from "@/lib/positions/create-position";

type Ctx = { params: Promise<{ id: string }> };

const TITLE_MAX = 50;
const COPY_SUFFIX = " (copy)";

function copyTitle(title: string): string {
  const base = title.slice(0, TITLE_MAX - COPY_SUFFIX.length).trimEnd();
  return base + COPY_SUFFIX;
}

/**
 * Duplicate a position into a new Draft: same chapter, type, headcount and
 * written content; no JD file, deadlines, candidates or access grants.
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const create = requireCanCreateJobs(auth.access);
  if (!create.ok) return create.response;
  const { id } = await ctx.params;
  const db = getPool();

  const source = await getJobById(db, id);
  if (!source) {
    return Response.json({ error: "Position not found." }, { status: 404 });
  }
  const perm = await requirePermissionOnJob(auth.access, "job.manage", id);
  if (!perm.ok) return perm.response;

  const chapters = await listAllowedChaptersForJob(db, id);
  const chapterId = chapters
    .map((c) => c.chapter_id)
    .find((cid) => canCreateInChapter(auth.access, cid));
  if (!chapterId) {
    return Response.json(
      { error: "You can only duplicate positions into your own chapter." },
      { status: 403 },
    );
  }

  const type = isHireType(source.hire_type)
    ? source.hire_type
    : /intern/i.test(source.employment_status ?? "")
      ? "Internship"
      : "Full-time";

  // A copy keeps the source's pipeline. Legacy sources have none, so the caller must pick one.
  let pipelineId = source.pipeline_id ?? null;
  if (!pipelineId) {
    const body = (await request.json().catch(() => ({}))) as { pipelineId?: unknown };
    pipelineId = typeof body.pipelineId === "string" ? body.pipelineId : null;
  }
  if (!pipelineId || !(await isPipelineUsable(db, pipelineId))) {
    return Response.json(
      { error: "Select a pipeline for the duplicated position." },
      { status: 400 },
    );
  }

  try {
    const draft = await createDraftPosition({
      chapterId,
      type,
      headcount: source.headcount ?? 1,
      pipelineId,
      createdBy: auth.userId,
      jd: null,
    });
    await updateJob(db, draft.id, {
      position: copyTitle(source.position),
      level: source.level,
      department: source.department,
      workLocation: source.work_location,
      reporting: source.reporting,
      roleOverview: source.role_overview,
      dutiesAndResponsibilities: source.duties_and_responsibilities,
      experienceRequirementsMustHave: source.experience_requirements_must_have,
      experienceRequirementsNiceToHave:
        source.experience_requirements_nice_to_have,
      whatWeOffer: source.what_we_offer,
      projectInfo: source.project_info,
      teamSize: source.team_size,
      languageRequirements: source.language_requirements,
      careerDevelopment: source.career_development,
      otherRequirements: source.other_requirements,
      salaryRange: source.salary_range,
      projectAllowances: source.project_allowances,
      interviewProcess: source.interview_process,
      updateNote: draftNote("Duplicated from " + source.position.slice(0, 30)),
    });
    const { positions } = await queryPositionsWithEnrichment(db, {
      q: draft.id,
      limit: 1,
    });
    return Response.json(
      {
        id: draft.id,
        position: positions.find((p) => p.id === draft.id) ?? null,
      },
      { status: 201 },
    );
  } catch (e) {
    const status = e instanceof CreatePositionError ? 400 : 500;
    const message = e instanceof Error ? e.message : "Failed to duplicate position.";
    return Response.json({ error: message }, { status });
  }
}
