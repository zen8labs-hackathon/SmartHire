import { normalizeEmail } from "@/lib/auth/email";
import type { QueryExecutor } from "@/lib/db/config/client";
import { listAllowedChaptersForJob } from "@/lib/db/job-permissions";
import { listHeadEmailsForChapters } from "@/lib/db/profile-chapters";
import { listUsersByRoles } from "@/lib/db/users";
import { fetchViewerEmailsForJobDescription } from "@/lib/admin/jd-viewer-sync";

/**
 * Default "who should be invited" suggestions for a new interview schedule:
 * everyone already granted access to the job (`job_allowed_profiles`), every
 * head of a chapter granted access to the job (`job_allowed_chapters` ->
 * `profile_chapters.role = 'head'`), and all admin/hr staff. Deduped,
 * case-insensitive, sorted.
 */
export async function getDefaultInterviewParticipantEmails(
  db: QueryExecutor,
  jobId: string | null,
): Promise<string[]> {
  const headEmailsPromise = jobId
    ? listAllowedChaptersForJob(db, jobId).then((rows) => {
        const chapterIds = rows.map((r) => r.chapter_id);
        return chapterIds.length ? listHeadEmailsForChapters(db, chapterIds) : [];
      })
    : Promise.resolve([]);

  const [profileEmails, headEmails, staffUsers] = await Promise.all([
    jobId ? fetchViewerEmailsForJobDescription(db, jobId) : Promise.resolve([]),
    headEmailsPromise,
    listUsersByRoles(db, ["admin", "hr"]),
  ]);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...profileEmails, ...headEmails, ...staffUsers.map((u) => u.email)]) {
    const email = normalizeEmail(raw);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  out.sort();
  return out;
}
