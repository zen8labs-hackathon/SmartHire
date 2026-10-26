import { guardLegacyJob } from "@/lib/migration/legacy-flow-guard";
import { requireStaffForRequest, requireUserForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { getPool } from "@/lib/db/config/client";
import { getJobById, updateJob, type UpdateJobInput } from "@/lib/db/jobs";
import { optionalDateToDb } from "@/lib/jd/normalize-text";
import { getPositionDescription, POSITION_DETAIL_COLUMNS } from "@/lib/position/get-position-description";
import { queryPositionsWithEnrichment } from "@/lib/position/list-with-enrichment";
import { isHireType, validateHeadcount } from "@/lib/position/position-rules";

type Ctx = { params: Promise<{ id: string }> };

/** Description & criteria data (details + chapters) for the new position UI. */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireUserForRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const perm = await requirePermissionOnJob(auth.access, "job.view", id);
  if (!perm.ok) return perm.response;
  const description = await getPositionDescription(getPool(), id);
  if (!description) {
    return Response.json({ error: "Position not found." }, { status: 404 });
  }
  return Response.json({ description });
}

/** Edit position fields (title, level, type, headcount, dates, JD detail text). Status is untouched. */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = getPool();

  const job = await getJobById(db, id);
  if (!job || job.deleted_at) {
    return Response.json({ error: "Position not found." }, { status: 404 });
  }
  const perm = await requirePermissionOnJob(auth.access, "job.manage", id);
  if (!perm.ok) return perm.response;
  const legacy = await guardLegacyJob(id);
  if (legacy) return legacy;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const patch: UpdateJobInput = { updatedBy: auth.userId };

  if (body.title !== undefined) {
    const t = typeof body.title === "string" ? body.title.trim() : "";
    if (!t || t.length > 50) {
      return Response.json(
        { error: "Title is required (max 50 characters)." },
        { status: 400 },
      );
    }
    patch.position = t;
  }
  if (body.level !== undefined) {
    if (body.level !== null && typeof body.level !== "string") {
      return Response.json({ error: "Invalid level." }, { status: 400 });
    }
    patch.level = body.level?.trim().slice(0, 100) || null;
  }
  if (body.type !== undefined) {
    if (!isHireType(body.type)) {
      return Response.json({ error: "Invalid type." }, { status: 400 });
    }
    patch.hireType = body.type;
    patch.employmentStatus = body.type;
  }
  if (body.headcount !== undefined) {
    const hc = validateHeadcount(
      typeof body.headcount === "number" || typeof body.headcount === "string"
        ? body.headcount
        : "",
    );
    if (hc.error || hc.value == null) {
      return Response.json(
        { error: hc.error ?? "Invalid headcount." },
        { status: 400 },
      );
    }
    patch.headcount = hc.value;
  }
  for (const [key, field] of [
    ["deadline", "hiringDeadline"],
    ["startDate", "startDate"],
  ] as const) {
    if (body[key] === undefined) continue;
    const v = body[key] === null ? null : optionalDateToDb(body[key]);
    if (body[key] !== null && v === null) {
      return Response.json({ error: `Invalid ${key}.` }, { status: 400 });
    }
    patch[field] = v;
  }

  const DETAIL_FIELDS = {
    department: "department",
    reporting: "reporting",
    roleOverview: "roleOverview",
    duties: "dutiesAndResponsibilities",
    workLocation: "workLocation",
    mustHave: "experienceRequirementsMustHave",
    niceToHave: "experienceRequirementsNiceToHave",
    benefits: "whatWeOffer",
    languages: "languageRequirements",
    project: "projectInfo",
    teamSize: "teamSize",
    salaryRange: "salaryRange",
  } as const satisfies Record<keyof typeof POSITION_DETAIL_COLUMNS, keyof UpdateJobInput>;
  for (const [key, field] of Object.entries(DETAIL_FIELDS)) {
    const v = body[key];
    if (v === undefined) continue;
    if (v !== null && typeof v !== "string") {
      return Response.json({ error: `Invalid ${key}.` }, { status: 400 });
    }
    (patch as Record<string, unknown>)[field] = v?.trim() || null;
  }

  try {
    await updateJob(db, id, patch);
    const { positions } = await queryPositionsWithEnrichment(db, {
      q: id,
      limit: 1,
    });
    return Response.json({ position: positions.find((p) => p.id === id) ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update position.";
    return Response.json({ error: message }, { status: 500 });
  }
}
