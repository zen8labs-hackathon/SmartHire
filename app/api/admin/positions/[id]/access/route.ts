import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { getPool } from "@/lib/db/config/client";
import { listChapters } from "@/lib/db/chapters";
import { getJobById } from "@/lib/db/jobs";
import {
  grantJobToChapter,
  grantJobToProfile,
  listAllowedChaptersForJob,
  listAllowedProfilesForJob,
  type JobProfileRole,
  revokeJobFromChapter,
  revokeJobFromProfile,
} from "@/lib/db/job-permissions";
import { getUsersByIds, listPublicUsers } from "@/lib/db/users";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AccessGrantDto = {
  kind: "chapter" | "person";
  id: string;
  name: string;
  email?: string;
  role?: JobProfileRole;
  grantedBy: string | null;
  grantedAt: string;
};
export type AccessDirectoryPerson = { id: string; name: string; email: string };
export type PositionAccess = {
  grants: AccessGrantDto[];
  directory: AccessDirectoryPerson[];
  chapters: { id: string; name: string }[];
};

async function guard(request: Request, ctx: Ctx) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return { response: auth.response } as const;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id) || !(await getJobById(getPool(), id))) {
    return {
      response: Response.json({ error: "Position not found." }, { status: 404 }),
    } as const;
  }
  const perm = await requirePermissionOnJob(auth.access, "job.manage", id);
  if (!perm.ok) return { response: perm.response } as const;
  return { id, userId: auth.userId } as const;
}

async function load(jobId: string): Promise<PositionAccess> {
  const db = getPool();
  const [profiles, chapterGrants, allChapters, users] = await Promise.all([
    listAllowedProfilesForJob(db, jobId),
    listAllowedChaptersForJob(db, jobId),
    listChapters(db),
    listPublicUsers(db),
  ]);
  const chapterName = new Map(allChapters.map((c) => [c.id, c.name]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const granterIds = [
    ...new Set(
      [...profiles, ...chapterGrants]
        .map((g) => g.granted_by)
        .filter((v): v is string => !!v),
    ),
  ];
  const granters = new Map(
    (await getUsersByIds(db, granterIds)).map((u) => [u.id, u.username]),
  );
  const grants: AccessGrantDto[] = [
    ...chapterGrants.map((g) => ({
      kind: "chapter" as const,
      id: g.chapter_id,
      name: chapterName.get(g.chapter_id) ?? "Unknown chapter",
      grantedBy: g.granted_by ? (granters.get(g.granted_by) ?? null) : null,
      grantedAt: g.created_at.toISOString(),
    })),
    ...profiles.map((g) => {
      const u = userById.get(g.profile_id);
      return {
        kind: "person" as const,
        id: g.profile_id,
        name: u?.username ?? "Unknown user",
        email: u?.email,
        role: g.role,
        grantedBy: g.granted_by ? (granters.get(g.granted_by) ?? null) : null,
        grantedAt: g.created_at.toISOString(),
      };
    }),
  ];
  const granted = new Set(profiles.map((p) => p.profile_id));
  return {
    grants,
    directory: users
      .filter((u) => !granted.has(u.id))
      .map((u) => ({ id: u.id, name: u.username, email: u.email })),
    chapters: allChapters
      .filter((c) => !chapterGrants.some((g) => g.chapter_id === c.id))
      .map((c) => ({ id: c.id, name: c.name })),
  };
}

export async function GET(request: Request, ctx: Ctx) {
  const g = await guard(request, ctx);
  if ("response" in g) return g.response;
  return Response.json(await load(g.id));
}

type Body = { kind?: unknown; targetId?: unknown; role?: unknown };

function parseBody(raw: Body) {
  if (
    (raw.kind !== "chapter" && raw.kind !== "person") ||
    typeof raw.targetId !== "string" ||
    !UUID_RE.test(raw.targetId)
  ) {
    return null;
  }
  const role: JobProfileRole | null =
    raw.role === undefined || raw.role === "recruiter"
      ? "recruiter"
      : raw.role === "interviewer"
        ? "interviewer"
        : null;
  if (!role) return null;
  return { kind: raw.kind, targetId: raw.targetId, role };
}

export async function POST(request: Request, ctx: Ctx) {
  const g = await guard(request, ctx);
  if ("response" in g) return g.response;
  const body = parseBody((await request.json().catch(() => ({}))) as Body);
  if (!body) {
    return Response.json({ error: "Invalid grant target." }, { status: 400 });
  }
  const db = getPool();
  try {
    if (body.kind === "chapter") {
      await grantJobToChapter(db, g.id, body.targetId, g.userId);
    } else {
      await grantJobToProfile(db, g.id, body.targetId, g.userId, body.role);
    }
  } catch (e) {
    // 23503 = foreign-key violation: the user/chapter doesn't exist.
    if ((e as { code?: string }).code !== "23503") {
      console.error("Position access grant failed:", e);
      return Response.json({ error: "Could not update access." }, { status: 500 });
    }
    return Response.json({ error: "Target not found." }, { status: 404 });
  }
  return Response.json(await load(g.id), { status: 201 });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const g = await guard(request, ctx);
  if ("response" in g) return g.response;
  const body = parseBody((await request.json().catch(() => ({}))) as Body);
  if (!body) {
    return Response.json({ error: "Invalid grant target." }, { status: 400 });
  }
  const db = getPool();
  if (body.kind === "chapter") {
    const remaining = await listAllowedChaptersForJob(db, g.id);
    if (remaining.length <= 1 && remaining.some((c) => c.chapter_id === body.targetId)) {
      return Response.json(
        { error: "A position must keep at least one chapter." },
        { status: 409 },
      );
    }
    await revokeJobFromChapter(db, g.id, body.targetId);
  } else {
    await revokeJobFromProfile(db, g.id, body.targetId);
  }
  return Response.json(await load(g.id));
}
