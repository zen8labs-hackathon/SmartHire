"use server";

import { revalidatePath } from "next/cache";

import { getRequestAuth } from "@/lib/admin/request-auth";
import { isValidEmail, normalizeEmail } from "@/lib/auth/email";
import { hashPassword } from "@/lib/auth/password";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { findExistingChapterIds } from "@/lib/db/chapters";
import {
  listMembershipsForUser,
  replaceMembershipsForUser,
  type ChapterMemberRole,
} from "@/lib/db/profile-chapters";
import { revokeAllRefreshTokensForUser } from "@/lib/db/refresh-tokens";
import {
  createUser,
  getPublicUserByEmail,
  getPublicUserById,
  softDeleteUser,
  updateUser,
  usernameExists,
  type ProfileRole,
} from "@/lib/db/users";

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

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  );
}

/** `users.username` requires `^[a-z0-9_]{3,30}$` -- same email-local-part fallback the old Supabase `handle_new_user` trigger used. */
function deriveUsernameCandidate(email: string): string {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  const sanitized = local.replace(/[^a-z0-9_]/g, "");
  const base =
    sanitized.length >= 3 ? sanitized : (sanitized + "user").slice(0, 3);
  return base.slice(0, 30);
}

async function generateUniqueUsername(email: string): Promise<string> {
  const base = deriveUsernameCandidate(email);
  for (let suffix = 1; suffix <= 1000; suffix += 1) {
    const candidate =
      suffix === 1
        ? base
        : `${base.slice(0, Math.max(1, 30 - String(suffix).length))}${suffix}`;
    if (!(await usernameExists(getPool(), candidate))) {
      return candidate;
    }
  }
  throw new Error(
    "Could not generate a unique username -- too many collisions.",
  );
}

function accessHint(
  role: ProfileRole,
  chapterCount: number,
  headCount: number,
): string {
  if (role === "none") return "Dashboard only.";
  if (role === "hr" || role === "admin") return "Full HR recruiting access.";
  return `Chapter recruiter (${chapterCount} chapter${chapterCount === 1 ? "" : "s"}, ${headCount} as head).`;
}

/**
 * Validates the recruiting-access selection and (re)writes `users.role` +
 * `profile_chapters` (with per-chapter head/member role) for an existing user.
 * Shared by adminAddUser (after the user row is created) and adminUpdateUserAccess.
 * Never assigns `role = 'admin'` -- this form has no such option, same as before
 * (`is_admin` was never settable through this UI either).
 */
async function syncRecruitingAccess(
  userId: string,
  recruitingAccess: string,
  chapterIds: string[],
  chapterHeadIds: Set<string>,
): Promise<{ error: string } | { role: ProfileRole }> {
  let role: ProfileRole;
  if (recruitingAccess === "hr") {
    role = "hr";
  } else if (recruitingAccess === "chapter") {
    if (chapterIds.length === 0) {
      return { error: "Select at least one chapter for a chapter recruiter." };
    }
    role = "recruiter";
  } else if (recruitingAccess === "none") {
    role = "none";
  } else {
    return { error: "Invalid recruiting access selection." };
  }

  if (role === "recruiter") {
    const found = await findExistingChapterIds(getPool(), chapterIds);
    if (found.length !== chapterIds.length) {
      return { error: "One or more selected chapters are invalid." };
    }
  }

  const memberships =
    role === "recruiter"
      ? chapterIds.map((chapterId) => ({
          chapterId,
          role: (chapterHeadIds.has(chapterId)
            ? "head"
            : "member") as ChapterMemberRole,
        }))
      : [];

  await withTransaction(async (client) => {
    await updateUser(client, userId, { role });
    await replaceMembershipsForUser(client, userId, memberships);
  });

  return { role };
}

export async function adminAddUser(
  _prev: AdminUserFormState,
  formData: FormData,
): Promise<AdminUserFormState> {
  const { access } = await getRequestAuth();
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

  if (await getPublicUserByEmail(getPool(), email)) {
    return { error: "A user with this email already exists." };
  }

  const username = await generateUniqueUsername(email);
  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = await createUser(getPool(), { email, username, passwordHash });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "A user with this email already exists." };
    }
    throw err;
  }

  const result = await syncRecruitingAccess(
    user.id,
    recruitingAccess,
    chapterIds,
    chapterHeadIds,
  );
  if ("error" in result) {
    return {
      error: `Account was created but ${result.error.charAt(0).toLowerCase()}${result.error.slice(1)}`,
    };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/chapters");
  return {
    message: `Created account for ${email}. ${accessHint(result.role, chapterIds.length, chapterHeadIds.size)} They can sign in with this email and password.`,
  };
}

export async function adminGetUserDetails(userId: string) {
  const { access } = await getRequestAuth();
  if (!access?.isHr) {
    throw new Error("Not authorized.");
  }

  const user = await getPublicUserById(getPool(), userId);
  if (!user) {
    throw new Error("User not found.");
  }

  const memberships = await listMembershipsForUser(getPool(), userId);
  const chapterIds = memberships.map((m) => m.chapterId);
  const chapterHeadIds = memberships
    .filter((m) => m.role === "head")
    .map((m) => m.chapterId);

  let recruitingAccess: "none" | "hr" | "chapter" = "none";
  if (user.role === "hr" || user.role === "admin") {
    recruitingAccess = "hr";
  } else if (user.role === "recruiter") {
    recruitingAccess = "chapter";
  }

  return {
    id: userId,
    email: user.email,
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
  const { access } = await getRequestAuth();
  if (!access?.isHr) {
    return { error: "Not authorized." };
  }

  const result = await syncRecruitingAccess(
    userId,
    recruitingAccess,
    chapterIds,
    new Set(chapterHeadIds),
  );
  if ("error" in result) {
    return { error: result.error };
  }

  // Access just changed -- revoke outstanding refresh tokens so the user's
  // *next* token refresh picks up the new role rather than riding out their
  // old refresh token's full lifetime. Their current access token (if any)
  // still rides out its own short TTL regardless; see ACCESS_TOKEN_TTL_SECONDS.
  await revokeAllRefreshTokensForUser(getPool(), userId);

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  return { message: "User access updated successfully." };
}

export async function adminUpdateUserPassword(
  userId: string,
  newPassword: string,
) {
  const { access } = await getRequestAuth();
  if (!access?.isHr) {
    return { error: "Not authorized." };
  }

  if (newPassword.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const passwordHash = await hashPassword(newPassword);
  const updated = await updateUser(getPool(), userId, { passwordHash });
  if (!updated) {
    return { error: "User not found." };
  }

  await revokeAllRefreshTokensForUser(getPool(), userId);

  return { message: "Password updated successfully." };
}

export async function adminDeleteUser(userId: string) {
  const { user, access } = await getRequestAuth();
  if (user?.id === userId) {
    return { error: "You cannot delete your own account." };
  }
  if (!access?.isHr) {
    return { error: "Not authorized." };
  }

  const deleted = await softDeleteUser(getPool(), userId);
  if (!deleted) {
    return { error: "User not found." };
  }

  await revokeAllRefreshTokensForUser(getPool(), userId);

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  return { message: "User account deleted successfully." };
}
