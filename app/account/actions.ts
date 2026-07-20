"use server";

import { getRequestAuth } from "@/lib/admin/request-auth";
import { hashPassword } from "@/lib/auth/password";
import { getPool } from "@/lib/db/config/client";
import { listChapters } from "@/lib/db/chapters";
import { listMembershipsForUser } from "@/lib/db/profile-chapters";
import { revokeAllRefreshTokensForUser } from "@/lib/db/refresh-tokens";
import { getPublicUserById, updateUser, usernameExists } from "@/lib/db/users";

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export type MyProfileFormState = { error?: string; message?: string } | null;

export type MyProfileDetails = {
  username: string;
  role: string;
  chapterNames: string[];
};

/** For the "My Account" modal -- the signed-in user's own profile summary. */
export async function getMyProfileDetails(): Promise<MyProfileDetails | null> {
  const { user, access } = await getRequestAuth();
  if (!user || !access) return null;

  const db = getPool();
  const [current, memberships, chapters] = await Promise.all([
    getPublicUserById(db, user.id),
    listMembershipsForUser(db, user.id),
    listChapters(db),
  ]);

  const chapterNameById = new Map(chapters.map((c) => [c.id, c.name]));
  const chapterNames = memberships
    .map((m) => chapterNameById.get(m.chapterId))
    .filter((name): name is string => typeof name === "string");

  return {
    username: current?.username ?? "",
    role: access.role,
    chapterNames,
  };
}

export async function updateMyUsername(
  username: string,
): Promise<MyProfileFormState> {
  const { user } = await getRequestAuth();
  if (!user) return { error: "Not authenticated." };

  const normalized = username.trim().toLowerCase();
  if (!USERNAME_RE.test(normalized)) {
    return {
      error:
        "Username must be 3-30 characters: lowercase letters, numbers, or underscores.",
    };
  }

  const db = getPool();
  const current = await getPublicUserById(db, user.id);
  if (
    normalized !== current?.username &&
    (await usernameExists(db, normalized))
  ) {
    return { error: "That username is already taken." };
  }

  await updateUser(db, user.id, { username: normalized });
  return { message: "Profile updated successfully!" };
}

/**
 * Self-service password change. Revokes every outstanding refresh token
 * (other-device sessions won't survive their next refresh); the caller's
 * *own* access token, if any, still rides out its own short TTL like any
 * other revoke -- see `ACCESS_TOKEN_TTL_SECONDS`.
 */
export async function updateMyPassword(
  newPassword: string,
): Promise<MyProfileFormState> {
  const { user } = await getRequestAuth();
  if (!user) return { error: "Not authenticated." };

  if (newPassword.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const passwordHash = await hashPassword(newPassword);
  const db = getPool();
  await updateUser(db, user.id, { passwordHash });
  await revokeAllRefreshTokensForUser(db, user.id);

  return { message: "Password changed successfully!" };
}
