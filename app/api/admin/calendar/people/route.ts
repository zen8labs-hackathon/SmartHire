import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { displayName } from "@/lib/calendar/server";
import { getPool } from "@/lib/db/config/client";
import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import { listAllowedProfilesForJob } from "@/lib/db/job-permissions";
import { listMembershipsForUsers } from "@/lib/db/profile-chapters";
import { listPublicUsers } from "@/lib/db/users";
import { logApiError } from "@/lib/logger";
import { NextRequest } from "next/server";

const MAX_RESULTS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Staff people picker for the Calendar (compare lanes, interviewer pick).
 * People sharing a chapter with the viewer come first.
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  // Assigning people to a position can target any account, even role "none".
  const includeAll = searchParams.get("all") === "1";
  const caId = searchParams.get("campaignAppliedId");
  const db = getPool();

  try {
    // People added to the position (recruiter/interviewer) are pickable even
    // when their account role is "none".
    let onJob = new Set<string>();
    let jobId = searchParams.get("jobId");
    if (!jobId && caId && UUID_RE.test(caId)) {
      jobId = (await getCampaignAppliedById(db, caId))?.job_id ?? null;
    }
    if (jobId && UUID_RE.test(jobId)) {
      onJob = new Set((await listAllowedProfilesForJob(db, jobId)).map((g) => g.profile_id));
    }
    const users = (await listPublicUsers(db)).filter(
      (u) =>
        (includeAll || u.role !== "none" || onJob.has(u.id)) &&
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
    ranked.sort(
      (a, b) =>
        Number(onJob.has(b.user.id)) - Number(onJob.has(a.user.id)) ||
        Number(b.sameChapter) - Number(a.sameChapter),
    );

    return Response.json({
      people: ranked.slice(0, MAX_RESULTS).map((r) => ({
        id: r.user.id,
        name: displayName(r.user),
        email: r.user.email,
        role: r.user.role,
        chapterIds: r.chapterIds,
        sameChapter: r.sameChapter,
        onPosition: onJob.has(r.user.id),
      })),
    });
  } catch (e) {
    logApiError("Calendar people: query failed", e, { userId: auth.userId });
    return Response.json({ error: "Could not load people." }, { status: 500 });
  }
}
