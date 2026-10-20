import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { displayName } from "@/lib/calendar/server";
import { getPool } from "@/lib/db/config/client";
import { listMembershipsForUsers } from "@/lib/db/profile-chapters";
import { listPublicUsers } from "@/lib/db/users";
import { logApiError } from "@/lib/logger";
import { NextRequest } from "next/server";

const MAX_RESULTS = 50;

/**
 * Staff people picker for the Calendar (compare lanes, interviewer pick).
 * People sharing a chapter with the viewer come first.
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const db = getPool();

  try {
    const users = (await listPublicUsers(db)).filter(
      (u) =>
        u.role !== "none" &&
        (!q || u.email.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)),
    );
    const memberships = await listMembershipsForUsers(
      db,
      users.map((u) => u.id),
    );
    const mine = new Set(auth.access.chapterIds);
    const ranked = users.map((u) => {
      const chapters = memberships.get(u.id) ?? [];
      return {
        user: u,
        chapterIds: chapters.map((c) => c.chapterId),
        sameChapter: chapters.some((c) => mine.has(c.chapterId)),
      };
    });
    ranked.sort((a, b) => Number(b.sameChapter) - Number(a.sameChapter));

    return Response.json({
      people: ranked.slice(0, MAX_RESULTS).map((r) => ({
        id: r.user.id,
        name: displayName(r.user),
        email: r.user.email,
        role: r.user.role,
        chapterIds: r.chapterIds,
        sameChapter: r.sameChapter,
      })),
    });
  } catch (e) {
    logApiError("Calendar people: query failed", e, { userId: auth.userId });
    return Response.json({ error: "Could not load people." }, { status: 500 });
  }
}
