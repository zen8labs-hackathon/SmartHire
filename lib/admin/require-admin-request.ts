import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { resolveAccessClaims } from "@/lib/admin/resolve-access-claims";
import { getPool } from "@/lib/db/config/client";

export type AdminRequestAuthResult =
  | {
      ok: true;
      userId: string;
      /** Authenticated user email when present (e.g. CV upload attribution). */
      userEmail: string | null;
    }
  | { ok: false; response: Response };

/**
 * HR-level auth (full product management): `role === 'admin' | 'hr'`.
 * Prefers `Authorization: Bearer` and falls back to the access-token cookie.
 */
export async function requireAdminForRequest(
  request: Request,
): Promise<AdminRequestAuthResult> {
  const claims = await resolveAccessClaims(request);
  if (!claims) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const access = await getStaffProfileAccess(getPool(), claims.sub);
  if (!access?.isHr) {
    return {
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, userId: claims.sub, userEmail: access.email };
}
