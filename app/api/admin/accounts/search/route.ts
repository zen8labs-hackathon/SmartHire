import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requireCanCreateJobs } from "@/lib/authz/require-permission";
import { getPool } from "@/lib/db/config/client";
import { searchUsersByEmail } from "@/lib/db/users";

const MAX_RESULTS = 25;

/**
 * Search existing users by email substring (autocomplete for JD viewers).
 */
export async function GET(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const createAccess = requireCanCreateJobs(auth.access);
  if (!createAccess.ok) return createAccess.response;

  const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (q.length < 2) {
    return Response.json({ accounts: [] as { email: string }[] });
  }

  try {
    const users = await searchUsersByEmail(getPool(), q, MAX_RESULTS);
    return Response.json({
      accounts: users.map((u) => ({ email: u.email })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Account search failed.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
