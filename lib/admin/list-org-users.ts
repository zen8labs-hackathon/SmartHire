import { getPool } from "@/lib/db/config/client";
import { listChapters } from "@/lib/db/chapters";
import {
  listMembersOfChapter,
  listMembershipsForUsers,
  type ChapterMemberRole,
} from "@/lib/db/profile-chapters";
import { listPublicUsers, type ProfileRole } from "@/lib/db/users";

export type ChapterMembership = {
  chapterId: string;
  chapterName: string;
  role: ChapterMemberRole;
};

export type OrgUserRow = {
  id: string;
  email: string;
  role: ProfileRole;
  chapterMemberships: ChapterMembership[];
  accessSummary: string;
};

function accessSummaryFor(
  role: ProfileRole,
  chapterMemberships: ChapterMembership[],
): string {
  if (role === "admin") return "Admin";
  if (role === "hr") return "HR";
  if (chapterMemberships.length > 0) {
    return `Chapters: ${chapterMemberships
      .map((c) => `${c.chapterName} (${c.role})`)
      .join(", ")}`;
  }
  return "Dashboard only";
}

/**
 * Lists every user with their recruiting access summary (HR admin page only).
 */
export async function listOrgUsersForAdminPage(): Promise<OrgUserRow[]> {
  const db = getPool();
  const [users, chapters] = await Promise.all([
    listPublicUsers(db),
    listChapters(db),
  ]);
  if (users.length === 0) return [];

  const chapterNameById = new Map(chapters.map((c) => [c.id, c.name]));
  const membershipsByUser = await listMembershipsForUsers(
    db,
    users.map((u) => u.id),
  );

  const rows: OrgUserRow[] = users.map((u) => {
    const chapterMemberships = (membershipsByUser.get(u.id) ?? [])
      .map((m) => ({
        chapterId: m.chapterId,
        chapterName: chapterNameById.get(m.chapterId) ?? "",
        role: m.role,
      }))
      .filter((m) => m.chapterName.length > 0)
      .sort((a, b) => a.chapterName.localeCompare(b.chapterName));

    return {
      id: u.id,
      email: u.email,
      role: u.role,
      chapterMemberships,
      accessSummary: accessSummaryFor(u.role, chapterMemberships),
    };
  });

  rows.sort((a, b) =>
    a.email.localeCompare(b.email, undefined, { sensitivity: "base" }),
  );
  return rows;
}

export type ChapterMemberRow = {
  profileId: string;
  email: string;
  role: ChapterMemberRole;
};

/**
 * Lists the members of a single chapter (HR admin page only).
 */
export async function listChapterMembers(
  chapterId: string,
): Promise<ChapterMemberRow[]> {
  const db = getPool();
  const [members, users] = await Promise.all([
    listMembersOfChapter(db, chapterId),
    listPublicUsers(db),
  ]);
  if (members.length === 0) return [];

  const emailById = new Map(users.map((u) => [u.id, u.email]));

  return members
    .map(
      (m): ChapterMemberRow => ({
        profileId: m.profileId,
        email: emailById.get(m.profileId) ?? "—",
        role: m.role,
      }),
    )
    .sort((a, b) =>
      a.email.localeCompare(b.email, undefined, { sensitivity: "base" }),
    );
}
