import { cookies } from "next/headers";

import { isProfileAdmin } from "@/lib/admin/config";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/session";
import { getPool } from "@/lib/db/config/client";

export type AdminAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

export async function requireAdminApi(): Promise<AdminAuthResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const claims = token ? verifyAccessToken(token) : null;

  if (!claims) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!(await isProfileAdmin(getPool(), claims.sub))) {
    return {
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, userId: claims.sub };
}
