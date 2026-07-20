import { isValidEmail, normalizeEmail } from "@/lib/auth/email";
import type { QueryExecutor } from "@/lib/db/config/client";
import { findExistingChapterIds } from "@/lib/db/chapters";
import {
  listAllowedChaptersForJob,
  listAllowedProfilesForJob,
  replaceAllowedChaptersForJob,
  replaceAllowedProfilesForJob,
} from "@/lib/db/job-permissions";
import { getUsersByEmails, getUsersByIds } from "@/lib/db/users";

// NOTE for whoever wires these into app/api/admin/job-descriptions/** next:
// - The write paths (replaceJobDescriptionViewers, syncJobDescriptionViewersFromEmails,
//   replaceJobDescriptionViewerChapters) each compose a delete + insert -- call them
//   through withTransaction (lib/db/client.ts), not with the bare pool.
// - The read paths (fetchViewerEmailsForJobDescription / fetchViewerChapterIdsForJobDescription)
//   take one jobId at a time. Calling them per-row inside a JD *list* loop is an N+1 --
//   batch instead (e.g. one job_allowed_profiles/chapters query with `job_id = ANY($1)`
//   across all listed job ids, like list-with-enrichment.ts already does for
//   applicant counts) rather than adding a bulk variant here speculatively.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Parse comma/newline/semicolon-separated emails or string arrays from forms / JSON.
 */
export function parseViewerEmailInput(
  input: string | string[] | null | undefined,
): string[] {
  if (input == null) return [];
  const rawParts: string[] = [];
  if (Array.isArray(input)) {
    for (const s of input) {
      if (typeof s !== "string") continue;
      rawParts.push(...s.split(/[\s,;]+/));
    }
  } else {
    rawParts.push(...input.split(/[\s,;]+/));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of rawParts) {
    const e = normalizeEmail(part);
    if (!isValidEmail(e)) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

/** Resolve emails to user ids. Emails with no matching user are reported in `notFound`. */
export async function resolveViewerEmailsToUserIds(
  db: QueryExecutor,
  emails: string[],
): Promise<{ idByEmail: Map<string, string>; notFound: string[] }> {
  if (emails.length === 0) {
    return { idByEmail: new Map(), notFound: [] };
  }
  const users = await getUsersByEmails(db, emails);
  const idByEmail = new Map<string, string>();
  for (const u of users) {
    idByEmail.set(normalizeEmail(u.email), u.id);
  }
  const notFound = emails.filter((e) => !idByEmail.has(e));
  return { idByEmail, notFound };
}

export async function fetchViewerEmailsForJobDescription(
  db: QueryExecutor,
  jobId: string,
): Promise<string[]> {
  const grants = await listAllowedProfilesForJob(db, jobId);
  if (grants.length === 0) return [];

  const users = await getUsersByIds(
    db,
    grants.map((g) => g.profile_id),
  );
  const emails = users.map((u) => normalizeEmail(u.email));
  emails.sort();
  return emails;
}

/**
 * Replaces all viewer rows for this job with the given user ids. Delegates
 * to `replaceAllowedProfilesForJob` (delete-then-insert) -- callers must run
 * this through `withTransaction` and pass the transaction client as `db`.
 */
export async function replaceJobDescriptionViewers(
  db: QueryExecutor,
  params: {
    jobId: string;
    userIds: string[];
    grantedBy: string;
  },
): Promise<void> {
  await replaceAllowedProfilesForJob(
    db,
    params.jobId,
    params.userIds,
    params.grantedBy,
  );
}

/**
 * Validates emails exist, then replaces viewer rows. Returns unknown emails
 * without mutating. Issues a read followed by a delete-then-insert -- callers
 * must run this through `withTransaction` and pass the transaction client as
 * `db`, same requirement as `replaceJobDescriptionViewers`.
 */
export async function syncJobDescriptionViewersFromEmails(
  db: QueryExecutor,
  params: {
    jobId: string;
    emails: string[];
    grantedBy: string;
  },
): Promise<{ notFound: string[] }> {
  if (params.emails.length === 0) {
    await replaceJobDescriptionViewers(db, {
      jobId: params.jobId,
      userIds: [],
      grantedBy: params.grantedBy,
    });
    return { notFound: [] };
  }

  const { idByEmail, notFound } = await resolveViewerEmailsToUserIds(
    db,
    params.emails,
  );
  if (notFound.length > 0) {
    return { notFound };
  }
  const userIds = params.emails.map((e) => idByEmail.get(e)!);
  await replaceJobDescriptionViewers(db, {
    jobId: params.jobId,
    userIds,
    grantedBy: params.grantedBy,
  });
  return { notFound: [] };
}

/**
 * Normalizes viewer chapter id list from API / form (UUIDs only).
 */
export function parseViewerChapterIds(
  raw: string[] | string | null | undefined,
): string[] {
  if (raw == null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    if (typeof x !== "string") continue;
    const s = x.trim();
    if (!UUID_RE.test(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export async function fetchViewerChapterIdsForJobDescription(
  db: QueryExecutor,
  jobId: string,
): Promise<string[]> {
  const grants = await listAllowedChaptersForJob(db, jobId);
  const ids = grants.map((g) => g.chapter_id);
  ids.sort();
  return ids;
}

export async function assertChapterIdsExist(
  db: QueryExecutor,
  chapterIds: string[],
): Promise<{ ok: true } | { ok: false; unknownIds: string[] }> {
  if (chapterIds.length === 0) return { ok: true };
  const found = new Set(await findExistingChapterIds(db, chapterIds));
  const unknownIds = chapterIds.filter((id) => !found.has(id));
  if (unknownIds.length > 0) return { ok: false, unknownIds };
  return { ok: true };
}

/**
 * Replaces JD <-> chapter viewer grants (all members of those chapters may
 * open the job). Delegates to `replaceAllowedChaptersForJob`
 * (delete-then-insert) -- callers must run this through `withTransaction`
 * and pass the transaction client as `db`.
 */
export async function replaceJobDescriptionViewerChapters(
  db: QueryExecutor,
  params: {
    jobId: string;
    chapterIds: string[];
    grantedBy: string;
  },
): Promise<void> {
  await replaceAllowedChaptersForJob(
    db,
    params.jobId,
    params.chapterIds,
    params.grantedBy,
  );
}
