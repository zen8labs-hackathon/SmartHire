import {
  getStaffProfileAccess,
  type StaffProfileAccess,
} from "@/lib/admin/profile-access";
import { resolveAccessClaims } from "@/lib/admin/resolve-access-claims";
import { getPool } from "@/lib/db/config/client";

export type StaffRequestAuthResult =
  | {
      ok: true;
      userId: string;
      access: StaffProfileAccess;
    }
  | { ok: false; response: Response };

/**
 * Authenticated user with recruiter access (HR, chapter memberships, or admin).
 */
export async function requireStaffForRequest(
  request: Request,
): Promise<StaffRequestAuthResult> {
  const claims = await resolveAccessClaims(request);
  if (!claims) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const access = await getStaffProfileAccess(getPool(), claims.sub);
  if (!access?.isStaff) {
    return {
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, userId: claims.sub, access };
}

/**
 * HR / admin only (full product management).
 */
export async function requireHrForRequest(
  request: Request,
): Promise<StaffRequestAuthResult> {
  const base = await requireStaffForRequest(request);
  if (!base.ok) return base;
  if (!base.access.isHr) {
    return {
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return base;
}
