"use server";

import { getRequestAuth } from "@/lib/admin/request-auth";
import { getPool } from "@/lib/db/config/client";
import { listChapters } from "@/lib/db/chapters";
import { listMembershipsForUser } from "@/lib/db/profile-chapters";
import { getPublicUserById, updateUser } from "@/lib/db/users";

export type MyProfileFormState = { error?: string; message?: string } | null;

export type MyProfileDetails = {
  username: string;
  displayName: string | null;
  phone: string | null;
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
    displayName: current?.display_name ?? null,
    phone: current?.phone ?? null,
    role: access.role,
    chapterNames,
  };
}

/** Self-service edit of the account's display name (used for the `user_name` email placeholder) and phone (`user_phone`). */
export async function updateMyProfile(
  displayName: string,
  phone: string,
): Promise<MyProfileFormState> {
  const { user } = await getRequestAuth();
  if (!user) return { error: "Not authenticated." };

  const trimmedName = displayName.trim();
  if (!trimmedName) {
    return { error: "Name cannot be empty" };
  }

  const db = getPool();
  await updateUser(db, user.id, {
    displayName: trimmedName,
    phone: phone.trim() || null,
  });
  return { message: "Profile updated successfully!" };
}
