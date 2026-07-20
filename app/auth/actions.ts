"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { isValidEmail, normalizeEmail } from "@/lib/auth/email";
import { safeNextPath } from "@/lib/auth/next-path";
import { getRequestMeta } from "@/lib/auth/request-meta";
import {
  buildAccessTokenCookie,
  buildClearedCookies,
  buildRefreshTokenCookie,
  login,
  logout,
  REFRESH_TOKEN_COOKIE,
} from "@/lib/auth/session";
import { getPool } from "@/lib/db/config/client";

export type AuthFormState = { error?: string; message?: string } | null;

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const nextRaw = String(formData.get("next") ?? "/dashboard");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (!isValidEmail(email)) {
    return { error: "Enter a valid email address." };
  }

  const meta = await getRequestMeta();
  const result = await login(getPool(), email, password, meta);

  if (!result.ok) {
    return { error: "Invalid email or password." };
  }

  const cookieStore = await cookies();
  cookieStore.set(buildAccessTokenCookie(result.session.accessToken));
  cookieStore.set(buildRefreshTokenCookie(result.session.refreshToken));

  redirect(safeNextPath(nextRaw));
}

export async function signOut() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  await logout(getPool(), refreshToken);

  for (const cookie of buildClearedCookies()) {
    cookieStore.set(cookie);
  }

  revalidatePath("/", "layout");
  redirect("/");
}
