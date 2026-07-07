import { createAdminClient } from "@/lib/supabase/admin";

export type ChapterMembership = {
  chapterId: string;
  chapterName: string;
  role: "head" | "member";
};

export type OrgUserRow = {
  id: string;
  email: string;
  isAdmin: boolean;
  workChapter: string | null;
  chapterMemberships: ChapterMembership[];
  accessSummary: string;
};

const MAX_LIST_PAGES = 50;

/**
 * Lists auth users with recruiting access summary (service role; HR admin page only).
 */
export async function listOrgUsersForAdminPage(): Promise<OrgUserRow[]> {
  const admin = createAdminClient();
  const users: { id: string; email: string }[] = [];

  let page = 1;
  const perPage = 100;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message);
    }
    for (const u of data.users) {
      users.push({
        id: u.id,
        email: (u.email ?? "").trim() || "—",
      });
    }
    if (data.users.length < perPage) break;
    page += 1;
    if (page > MAX_LIST_PAGES) break;
  }

  if (users.length === 0) return [];

  const ids = users.map((u) => u.id);

  const [profsRes, pcRowsRes, chapterRowsRes] = await Promise.all([
    admin
      .from("profiles")
      .select("id, is_admin, work_chapter")
      .in("id", ids),
    admin
      .from("profile_chapters")
      .select("profile_id, chapter_id, role")
      .in("profile_id", ids),
    admin.from("chapters").select("id, name"),
  ]);

  const profById = new Map(
    (profsRes.data ?? []).map((p) => [p.id as string, p]),
  );

  const pcRows = pcRowsRes.data;
  const chapterRows = chapterRowsRes.data;
  const chapterNameById = new Map(
    (chapterRows ?? []).map((c) => [c.id as string, String(c.name)]),
  );

  const chaptersByProfile = new Map<string, ChapterMembership[]>();
  for (const r of pcRows ?? []) {
    const pid = r.profile_id as string;
    const cid = r.chapter_id as string;
    const name = chapterNameById.get(cid);
    if (!name) continue;
    const role = r.role === "head" ? "head" : "member";
    const arr = chaptersByProfile.get(pid) ?? [];
    arr.push({ chapterId: cid, chapterName: name, role });
    chaptersByProfile.set(pid, arr);
  }

  const rows: OrgUserRow[] = users.map((u) => {
    const p = profById.get(u.id);
    const isAdmin = p?.is_admin === true;
    const wc = typeof p?.work_chapter === "string" ? p.work_chapter.trim() : "";
    const workChapter = wc.length > 0 ? wc : null;
    const chapterMemberships = (chaptersByProfile.get(u.id) ?? []).sort((a, b) =>
      a.chapterName.localeCompare(b.chapterName),
    );

    const parts: string[] = [];
    if (isAdmin) parts.push("Admin");
    if (workChapter === "HR") parts.push("HR");
    if (chapterMemberships.length > 0) {
      parts.push(
        `Chapters: ${chapterMemberships
          .map((c) => `${c.chapterName} (${c.role})`)
          .join(", ")}`,
      );
    }
    if (parts.length === 0) {
      parts.push("Dashboard only");
    }

    return {
      id: u.id,
      email: u.email,
      isAdmin,
      workChapter,
      chapterMemberships,
      accessSummary: parts.join(" · "),
    };
  });

  rows.sort((a, b) => a.email.localeCompare(b.email, undefined, { sensitivity: "base" }));
  return rows;
}
