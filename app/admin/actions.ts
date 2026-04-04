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
  const rawChapter = String(formData.get("work_chapter") ?? "").trim();

  let workChapter: string | null = null;
  if (recruitingAccess === "hr") {
    workChapter = HR_WORK_CHAPTER;
  } else if (recruitingAccess === "chapter") {
    if (!rawChapter) {
      return {
        error:
          "Enter a chapter name (must match candidate chapter labels, e.g. Engineering).",
      };
    }
    workChapter = rawChapter.slice(0, 50);
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

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ work_chapter: workChapter })
    .eq("id", newId);

  if (profileErr) {
    return {
      error: `Account was created but recruiting access could not be saved: ${profileErr.message}`,
    };
  }

  revalidatePath("/admin");
  const accessHint =
    workChapter == null
      ? "Dashboard only."
      : workChapter === HR_WORK_CHAPTER
        ? "Full HR recruiting access."
        : `Chapter recruiter (${workChapter}).`;
  return {
    message: `Created account for ${email}. ${accessHint} They can sign in with this email and password.`,
  };
}
