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
        : `Chapter recruiter (${chapterIds.length} chapter${chapterIds.length === 1 ? "" : "s"}).`;
  return {
    message: `Created account for ${email}. ${accessHint} They can sign in with this email and password.`,
  };
}
