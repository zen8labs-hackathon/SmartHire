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
  email: string;
  phone: string | null;
  role: string;
  chapterNames: string[];
};

/** For the "My Account" modal -- the signed-in user's own profile summary,
 * including chapter memberships. Don't reuse this for lighter call sites
 * that only need name/email/phone (e.g. email-compose prefill) -- the
 * `listMembershipsForUser` + `listChapters` (full-table) queries here are
 * pure overhead for those. Use {@link getMySenderIdentity} instead. */
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
    email: current?.email ?? access.email,
    phone: current?.phone ?? null,
    role: access.role,
    chapterNames,
  };
}

export type MySenderIdentity = {
  displayName: string | null;
  email: string;
  phone: string | null;
};

/** Signed-in user's name/email/phone only -- a single `users` lookup, no
 * chapter data. Used by the email compose modal to prefill the
 * `user_name`/`user_email`/`user_phone`/`hr_name` placeholders as soon as a
 * template is picked, since a server action is callable directly from a
 * Client Component without needing a dedicated API route. */
export async function getMySenderIdentity(): Promise<MySenderIdentity | null> {
  const { user, access } = await getRequestAuth();
  if (!user || !access) return null;

  const current = await getPublicUserById(getPool(), user.id);
  return {
    displayName: current?.display_name ?? null,
    email: current?.email ?? access.email,
    phone: current?.phone ?? null,
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
