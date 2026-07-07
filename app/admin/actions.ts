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

  const chapterIdSet = new Set<string>();
  for (const x of formData.getAll("chapter_ids")) {
    const s = String(x).trim();
    if (UUID_RE.test(s)) chapterIdSet.add(s);
  }
  const chapterIds = [...chapterIdSet];

  const chapterHeadIdSet = new Set<string>();
  for (const x of formData.getAll("chapter_head_ids")) {
    const s = String(x).trim();
    if (UUID_RE.test(s)) chapterHeadIdSet.add(s);
  }

  let workChapter: string | null = null;
  if (recruitingAccess === "hr") {
    workChapter = HR_WORK_CHAPTER;
  } else if (recruitingAccess === "chapter") {
    if (chapterIds.length === 0) {
      return {
        error: "Select at least one chapter for a chapter recruiter.",
      };
    }
  } else if (recruitingAccess !== "none") {
    return { error: "Invalid recruiting access selection." };
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

  const { error: delPcErr } = await admin
    .from("profile_chapters")
    .delete()
    .eq("profile_id", newId);

  if (delPcErr) {
    return {
      error: `Account was created but chapter membership could not be reset: ${delPcErr.message}`,
    };
  }

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ work_chapter: workChapter })
    .eq("id", newId);

  if (profileErr) {
    return {
      error: `Account was created but recruiting access could not be saved: ${profileErr.message}`,
    };
  }

  if (recruitingAccess === "chapter" && chapterIds.length > 0) {
    const { error: insPcErr } = await admin.from("profile_chapters").insert(
      chapterIds.map((chapter_id) => ({
        profile_id: newId,
        chapter_id,
        role: chapterHeadIdSet.has(chapter_id) ? "head" : "member",
      })),
    );
    if (insPcErr) {
      return {
        error: `Account was created but chapter membership could not be saved: ${insPcErr.message}`,
      };
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/chapters");
  const accessHint =
    workChapter == null && chapterIds.length === 0
      ? "Dashboard only."
      : workChapter === HR_WORK_CHAPTER
        ? "Full HR recruiting access."
        : `Chapter recruiter (${chapterIds.length} chapter${chapterIds.length === 1 ? "" : "s"}, ${chapterHeadIdSet.size} as head).`;
  return {
    message: `Created account for ${email}. ${accessHint} They can sign in with this email and password.`,
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

  let workChapter: string | null = null;
  if (recruitingAccess === "hr") {
    workChapter = HR_WORK_CHAPTER;
  } else if (recruitingAccess === "chapter") {
    if (chapterIds.length === 0) {
      return {
        error: "Select at least one chapter for a chapter recruiter.",
      };
    }
  } else if (recruitingAccess !== "none") {
    return { error: "Invalid recruiting access selection." };
  }

  const admin = createAdminClient();

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
    .eq("profile_id", userId);

  if (delPcErr) {
    return {
      error: `Could not reset chapter membership: ${delPcErr.message}`,
    };
  }

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ work_chapter: workChapter })
    .eq("id", userId);

  if (profileErr) {
    return {
      error: `Could not save recruiting access: ${profileErr.message}`,
    };
  }

  if (recruitingAccess === "chapter" && chapterIds.length > 0) {
    const headSet = new Set(chapterHeadIds);
    const { error: insPcErr } = await admin.from("profile_chapters").insert(
      chapterIds.map((chapter_id) => ({
        profile_id: userId,
        chapter_id,
        role: headSet.has(chapter_id) ? "head" : "member",
      })),
    );
    if (insPcErr) {
      return {
        error: `Could not save chapter membership: ${insPcErr.message}`,
      };
    }
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

  const admin = createAdminClient();
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

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  return { message: "User account deleted successfully." };
}
