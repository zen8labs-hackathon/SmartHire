"use server";

import { revalidatePath } from "next/cache";

import {
  getStaffProfileAccess,
  HR_WORK_CHAPTER,
} from "@/lib/admin/profile-access";
import { isValidEmail, normalizeEmail } from "@/lib/auth/email";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminUserFormState = { error?: string; message?: string } | null;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseIdList(formData: FormData, field: string): string[] {
  const set = new Set<string>();
  for (const x of formData.getAll(field)) {
    const s = String(x).trim();
    if (UUID_RE.test(s)) set.add(s);
  }
  return [...set];
}

/**
 * Validates the recruiting-access selection and (re)writes profiles.work_chapter +
 * profile_chapters (with per-chapter head/member role) for an existing profile.
 * Shared by adminAddUser (after the auth user is created) and adminUpdateUserAccess.
 */
async function syncRecruitingAccess(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  recruitingAccess: string,
  chapterIds: string[],
  chapterHeadIds: Set<string>,
): Promise<{ error: string } | { workChapter: string | null }> {
  let workChapter: string | null = null;
  if (recruitingAccess === "hr") {
    workChapter = HR_WORK_CHAPTER;
  } else if (recruitingAccess === "chapter") {
    if (chapterIds.length === 0) {
      return { error: "Select at least one chapter for a chapter recruiter." };
    }
  } else if (recruitingAccess !== "none") {
    return { error: "Invalid recruiting access selection." };
  }

  if (recruitingAccess === "chapter" && chapterIds.length > 0) {
    const { data: found, error: chErr } = await admin
      .from("chapters")
      .select("id")
      .in("id", chapterIds);
    if (chErr) {
      return { error: `Could not validate chapters: ${chErr.message}` };
    }
    if ((found?.length ?? 0) !== chapterIds.length) {
      return { error: "One or more selected chapters are invalid." };
    }
  }

  const { error: delPcErr } = await admin
    .from("profile_chapters")
    .delete()
    .eq("profile_id", profileId);
  if (delPcErr) {
    return { error: `Chapter membership could not be reset: ${delPcErr.message}` };
  }

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ work_chapter: workChapter })
    .eq("id", profileId);
  if (profileErr) {
    return { error: `Recruiting access could not be saved: ${profileErr.message}` };
  }

  if (recruitingAccess === "chapter" && chapterIds.length > 0) {
    const { error: insPcErr } = await admin.from("profile_chapters").insert(
      chapterIds.map((chapter_id) => ({
        profile_id: profileId,
        chapter_id,
        role: chapterHeadIds.has(chapter_id) ? "head" : "member",
      })),
    );
    if (insPcErr) {
      return { error: `Chapter membership could not be saved: ${insPcErr.message}` };
    }
  }

  return { workChapter };
}

function accessHint(
  workChapter: string | null,
  chapterCount: number,
  headCount: number,
): string {
  if (workChapter == null && chapterCount === 0) return "Dashboard only.";
  if (workChapter === HR_WORK_CHAPTER) return "Full HR recruiting access.";
  return `Chapter recruiter (${chapterCount} chapter${chapterCount === 1 ? "" : "s"}, ${headCount} as head).`;
}

export async function adminAddUser(
  _prev: AdminUserFormState,
  formData: FormData,
): Promise<AdminUserFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const access =
    user?.id != null ? await getStaffProfileAccess(supabase, user.id) : null;
  if (!access?.isHr) {
    return { error: "Not authorized." };
  }

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (!isValidEmail(email)) {
    return { error: "Enter a valid email address." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const recruitingAccess = String(
    formData.get("recruiting_access") ?? "none",
  ).trim();
  const chapterIds = parseIdList(formData, "chapter_ids");
  const chapterHeadIds = new Set(parseIdList(formData, "chapter_head_ids"));

  if (recruitingAccess === "chapter" && chapterIds.length === 0) {
    return { error: "Select at least one chapter for a chapter recruiter." };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return {
      error:
        "Server is missing SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY). Add it to create users from the admin panel.",
    };
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("already registered") ||
      msg.includes("already been registered")
    ) {
      return { error: "A user with this email already exists." };
    }
    return { error: error.message };
  }

  const newId = created.user?.id;
  if (!newId) {
    return {
      error: "User was created but no user id was returned. Check Supabase logs.",
    };
  }

  const result = await syncRecruitingAccess(
    admin,
    newId,
    recruitingAccess,
    chapterIds,
    chapterHeadIds,
  );
  if ("error" in result) {
    return { error: `Account was created but ${result.error.charAt(0).toLowerCase()}${result.error.slice(1)}` };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/chapters");
  return {
    message: `Created account for ${email}. ${accessHint(result.workChapter, chapterIds.length, chapterHeadIds.size)} They can sign in with this email and password.`,
  };
}

export async function adminGetUserDetails(userId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const access =
    user?.id != null ? await getStaffProfileAccess(supabase, user.id) : null;
  if (!access?.isHr) {
    throw new Error("Not authorized.");
  }

  const admin = createAdminClient();
  
  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
  if (authErr || !authUser?.user) {
    throw new Error("User not found in Auth.");
  }

  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("work_chapter")
    .eq("id", userId)
    .maybeSingle();

  if (profErr) {
    throw new Error(`Failed to fetch profile: ${profErr.message}`);
  }

  const { data: pChapters, error: pcErr } = await admin
    .from("profile_chapters")
    .select("chapter_id, role")
    .eq("profile_id", userId);

  if (pcErr) {
    throw new Error(`Failed to fetch chapters: ${pcErr.message}`);
  }

  const chapterIds = (pChapters ?? []).map((x) => x.chapter_id as string);
  const chapterHeadIds = (pChapters ?? [])
    .filter((x) => x.role === "head")
    .map((x) => x.chapter_id as string);

  let recruitingAccess: "none" | "hr" | "chapter" = "none";
  if (profile?.work_chapter === HR_WORK_CHAPTER) {
    recruitingAccess = "hr";
  } else if (chapterIds.length > 0) {
    recruitingAccess = "chapter";
  }

  return {
    id: userId,
    email: authUser.user.email ?? "",
    recruitingAccess,
    chapterIds,
    chapterHeadIds,
  };
}

export async function adminUpdateUserAccess(
  userId: string,
  recruitingAccess: "none" | "hr" | "chapter",
  chapterIds: string[],
  chapterHeadIds: string[],
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const access =
    user?.id != null ? await getStaffProfileAccess(supabase, user.id) : null;
  if (!access?.isHr) {
    return { error: "Not authorized." };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return {
      error:
        "Server is missing SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY). Add it to edit users from the admin panel.",
    };
  }

  const result = await syncRecruitingAccess(
    admin,
    userId,
    recruitingAccess,
    chapterIds,
    new Set(chapterHeadIds),
  );
  if ("error" in result) {
    return { error: result.error };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  return { message: "User access updated successfully." };
}

export async function adminUpdateUserPassword(userId: string, newPassword: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const access =
    user?.id != null ? await getStaffProfileAccess(supabase, user.id) : null;
  if (!access?.isHr) {
    return { error: "Not authorized." };
  }

  if (newPassword.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return {
      error:
        "Server is missing SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY). Add it to reset passwords from the admin panel.",
    };
  }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) {
    return { error: error.message };
  }

  return { message: "Password updated successfully." };
}

export async function adminDeleteUser(userId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.id === userId) {
    return { error: "You cannot delete your own account." };
  }

  const access =
    user?.id != null ? await getStaffProfileAccess(supabase, user.id) : null;
  if (!access?.isHr) {
    return { error: "Not authorized." };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return {
      error:
        "Server is missing SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY). Add it to delete users from the admin panel.",
    };
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  return { message: "User account deleted successfully." };
}
