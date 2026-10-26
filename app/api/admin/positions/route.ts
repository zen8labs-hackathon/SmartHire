import { after } from "next/server";
import { assertChapterIdsExist } from "@/lib/admin/jd-viewer-sync";
import { requireCanCreateJobs } from "@/lib/authz/require-permission";
import {
  CreatePositionError,
  canCreateInChapter,
  createDraftPosition,
  isTempJdKey,
} from "@/lib/position/create-position";
import { processPositionJd } from "@/lib/position/process-jd";
import { isHireType, validateHeadcount } from "@/lib/position/position-rules";
import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import type { JobProfileRole } from "@/lib/db/job-permissions";
import { getUsersByIds } from "@/lib/db/users";
import { isPipelineUsable } from "@/lib/db/pipelines";
import {
  isPositionStatus,
  isPositionType,
  queryPositionsWithEnrichment,
} from "@/lib/position/list-with-enrichment";

const POSITION_LIST_MAX_LIMIT = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const statusRaw = url.searchParams.get("status");
  const typeRaw = url.searchParams.get("type");
  if (statusRaw && !isPositionStatus(statusRaw)) {
    return Response.json({ error: "Invalid status." }, { status: 400 });
  }
  if (typeRaw && !isPositionType(typeRaw)) {
    return Response.json({ error: "Invalid type." }, { status: 400 });
  }

  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");
  const limit =
    limitRaw != null
      ? Math.min(Math.max(1, Number(limitRaw) || 0), POSITION_LIST_MAX_LIMIT)
      : undefined;
  const offset =
    offsetRaw != null ? Math.max(0, Number(offsetRaw) || 0) : undefined;

  const chapterId = url.searchParams.get("chapterId");
  if (
    chapterId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chapterId)
  ) {
    return Response.json({ error: "Invalid chapterId." }, { status: 400 });
  }

  try {
    const result = await queryPositionsWithEnrichment(getPool(), {
      status: statusRaw && isPositionStatus(statusRaw) ? statusRaw : null,
      q: url.searchParams.get("q"),
      type: typeRaw && isPositionType(typeRaw) ? typeRaw : null,
      chapterId,
      limit,
      offset,
      visibleToUserId: auth.access.isHr ? undefined : auth.userId,
      includePool: auth.access.isHr,
    });
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load positions.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const perm = requireCanCreateJobs(auth.access);
  if (!perm.ok) return perm.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const chapterId = typeof body.chapterId === "string" ? body.chapterId : "";
  if (!chapterId) {
    return Response.json({ error: "chapterId is required." }, { status: 400 });
  }
  const pipelineId = typeof body.pipelineId === "string" ? body.pipelineId : "";
  if (!pipelineId) {
    return Response.json({ error: "pipelineId is required." }, { status: 400 });
  }
  if (!isHireType(body.type)) {
    return Response.json({ error: "Invalid type." }, { status: 400 });
  }
  const headcount = validateHeadcount(
    typeof body.headcount === "number" || typeof body.headcount === "string"
      ? body.headcount
      : "",
  );
  if (headcount.error || headcount.value == null) {
    return Response.json(
      { error: headcount.error ?? "Invalid headcount." },
      { status: 400 },
    );
  }

  const people: { profileId: string; role: JobProfileRole }[] = [];
  if (body.people != null) {
    if (!Array.isArray(body.people) || body.people.length > 100) {
      return Response.json({ error: "Invalid people." }, { status: 400 });
    }
    const seen = new Set<string>();
    for (const raw of body.people as unknown[]) {
      const r = raw as { profileId?: unknown; role?: unknown } | null;
      if (
        !r ||
        typeof r.profileId !== "string" ||
        !UUID_RE.test(r.profileId) ||
        (r.role !== "recruiter" && r.role !== "interviewer")
      ) {
        return Response.json({ error: "Invalid people." }, { status: 400 });
      }
      if (seen.has(r.profileId)) continue;
      seen.add(r.profileId);
      people.push({ profileId: r.profileId, role: r.role });
    }
  }

  const blank = body.blank === true;
  const path = body.jdStoragePath;
  if (blank === (path != null)) {
    return Response.json(
      { error: "Provide either a JD file or blank: true." },
      { status: 400 },
    );
  }
  let jd: { storagePath: string; filename: string; mimeType: string } | null =
    null;
  if (!blank) {
    if (!isTempJdKey(path)) {
      return Response.json({ error: "Invalid jdStoragePath." }, { status: 400 });
    }
    const filename =
      typeof body.jdOriginalFilename === "string" ? body.jdOriginalFilename : "";
    if (!filename) {
      return Response.json(
        { error: "jdOriginalFilename is required." },
        { status: 400 },
      );
    }
    jd = {
      storagePath: path,
      filename,
      mimeType:
        typeof body.jdMimeType === "string"
          ? body.jdMimeType
          : "application/octet-stream",
    };
  }

  if (!canCreateInChapter(auth.access, chapterId)) {
    return Response.json(
      { error: "You can only create positions in your own chapter." },
      { status: 403 },
    );
  }
  const db = getPool();
  const exists = await assertChapterIdsExist(db, [chapterId]);
  if (!exists.ok) {
    return Response.json({ error: "Unknown chapter." }, { status: 400 });
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pipelineId) ||
    !(await isPipelineUsable(db, pipelineId))
  ) {
    return Response.json({ error: "Unknown pipeline." }, { status: 400 });
  }

  if (people.length) {
    const known = new Set((await getUsersByIds(db, people.map((p) => p.profileId))).map((u) => u.id));
    if (people.some((p) => !known.has(p.profileId))) {
      return Response.json({ error: "Unknown user in people." }, { status: 400 });
    }
  }

  try {
    const job = await createDraftPosition({
      people,
      chapterId,
      type: body.type,
      headcount: headcount.value,
      pipelineId,
      createdBy: auth.userId,
      jd,
    });
    if (jd) after(() => processPositionJd(job.id));
    const { positions } = await queryPositionsWithEnrichment(db, {
      q: job.id,
      limit: 1,
    });
    const position = positions.find((p) => p.id === job.id) ?? null;
    return Response.json({ position, id: job.id }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create position.";
    const status = e instanceof CreatePositionError ? 502 : 500;
    return Response.json({ error: message }, { status });
  }
}
