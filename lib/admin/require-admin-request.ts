import { requireHrForRequest } from "@/lib/admin/require-staff-request";

export type AdminRequestAuthResult =
  | {
      ok: true;
      userId: string;
      /** Authenticated user email when present (e.g. CV upload attribution). */
      userEmail: string | null;
    }
  | { ok: false; response: Response };

/**
 * @deprecated Prefer {@link requireHrForRequest}. This name historically meant
 * "HR-level" (`admin` | `hr`), not admin-only. True admin-only checks use
 * `requireAdminApi` / `access.isAdmin`.
 *
 * Kept as a thin adapter so existing HR-gated API routes keep working.
 */
export async function requireAdminForRequest(
  request: Request,
): Promise<AdminRequestAuthResult> {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth;
  return {
    ok: true,
    userId: auth.userId,
    userEmail: auth.access.email,
  };
}
