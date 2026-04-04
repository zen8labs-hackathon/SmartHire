import { createAdminClient } from "@/lib/supabase/admin";

export type OrgUserRow = {
  id: string;
  email: string;
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

  const { data: profs } = await admin
    .from("profiles")
    .select("id, is_admin, work_chapter")
    .in("id", ids);

  const profById = new Map(
    (profs ?? []).map((p) => [p.id as string, p]),
  );

  const { data: pcRows } = await admin
    .from("profile_chapters")
    .select("profile_id, chapter_id")
    .in("profile_id", ids);

  const { data: chapterRows } = await admin.from("chapters").select("id, name");
  const chapterNameById = new Map(
    (chapterRows ?? []).map((c) => [c.id as string, String(c.name)]),
  );

  const chaptersByProfile = new Map<string, string[]>();
  for (const r of pcRows ?? []) {
    const pid = r.profile_id as string;
    const cid = r.chapter_id as string;
    const name = chapterNameById.get(cid);
    if (!name) continue;
    const arr = chaptersByProfile.get(pid) ?? [];
    arr.push(name);
    chaptersByProfile.set(pid, arr);
  }

  const rows: OrgUserRow[] = users.map((u) => {
    const p = profById.get(u.id);
    const parts: string[] = [];
    if (p?.is_admin === true) parts.push("Admin");
    const wc =
      typeof p?.work_chapter === "string" ? p.work_chapter.trim() : "";
    if (wc === "HR") parts.push("HR");
    const ch = chaptersByProfile.get(u.id);
    if (ch?.length) {
      parts.push(`Chapters: ${[...new Set(ch)].sort().join(", ")}`);
    }
    if (parts.length === 0) {
      parts.push("Dashboard only");
    }
    return {
      id: u.id,
      email: u.email,
      accessSummary: parts.join(" · "),
    };
  });

  rows.sort((a, b) => a.email.localeCompare(b.email, undefined, { sensitivity: "base" }));
  return rows;
}
