import type { QueryExecutor } from "@/lib/db/config/client";

export type ChapterMemberRole = "head" | "member";

export type ProfileChapterRow = {
  profile_id: string;
  chapter_id: string;
  role: ChapterMemberRole;
  created_at: Date;
};

export type ChapterMembership = { chapterId: string; role: ChapterMemberRole };

export async function listChapterIdsForUser(
  db: QueryExecutor,
  userId: string,
): Promise<string[]> {
  const { rows } = await db.query<{ chapter_id: string }>(
    `SELECT chapter_id FROM profile_chapters WHERE profile_id = $1`,
    [userId],
  );
  return rows.map((r) => r.chapter_id);
}

export async function listMembershipsForUser(
  db: QueryExecutor,
  userId: string,
): Promise<ChapterMembership[]> {
  const { rows } = await db.query<{
    chapter_id: string;
    role: ChapterMemberRole;
  }>(`SELECT chapter_id, role FROM profile_chapters WHERE profile_id = $1`, [
    userId,
  ]);
  return rows.map((r) => ({ chapterId: r.chapter_id, role: r.role }));
}

/** Bulk variant for rendering an org-wide user list without N+1 queries. */
export async function listMembershipsForUsers(
  db: QueryExecutor,
  userIds: string[],
): Promise<Map<string, ChapterMembership[]>> {
  const byUser = new Map<string, ChapterMembership[]>();
  if (userIds.length === 0) return byUser;

  const { rows } = await db.query<{
    profile_id: string;
    chapter_id: string;
    role: ChapterMemberRole;
  }>(
    `SELECT profile_id, chapter_id, role FROM profile_chapters WHERE profile_id = ANY($1::uuid[])`,
    [userIds],
  );
  for (const r of rows) {
    const arr = byUser.get(r.profile_id) ?? [];
    arr.push({ chapterId: r.chapter_id, role: r.role });
    byUser.set(r.profile_id, arr);
  }
  return byUser;
}

export async function listMembersOfChapter(
  db: QueryExecutor,
  chapterId: string,
): Promise<{ profileId: string; role: ChapterMemberRole }[]> {
  const { rows } = await db.query<{
    profile_id: string;
    role: ChapterMemberRole;
  }>(`SELECT profile_id, role FROM profile_chapters WHERE chapter_id = $1`, [
    chapterId,
  ]);
  return rows.map((r) => ({ profileId: r.profile_id, role: r.role }));
}

/**
 * Replaces every chapter membership for a user in one shot (delete-then-insert).
 * Callers that need this atomic alongside a `users.role` write should run both
 * through `withTransaction` (see `lib/db/client.ts`) and pass the transaction
 * client here as `db`.
 */
export async function replaceMembershipsForUser(
  db: QueryExecutor,
  userId: string,
  memberships: ChapterMembership[],
): Promise<void> {
  await db.query(`DELETE FROM profile_chapters WHERE profile_id = $1`, [
    userId,
  ]);
  if (memberships.length === 0) return;

  const values: unknown[] = [userId];
  const rows = memberships.map((m) => {
    values.push(m.chapterId, m.role);
    return `($1, $${values.length - 1}, $${values.length})`;
  });
  await db.query(
    `INSERT INTO profile_chapters (profile_id, chapter_id, role) VALUES ${rows.join(", ")}`,
    values,
  );
}
