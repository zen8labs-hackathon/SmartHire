import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import {
  queryOrgUsersList,
  USERS_LIST_DEFAULT_LIMIT,
  USERS_LIST_MAX_LIMIT,
  type UsersRoleFilter,
} from "@/lib/admin/users-list-query";

function parseRole(raw: string | null): UsersRoleFilter {
  return raw === "hr" || raw === "chapter" || raw === "dashboard"
    ? raw
    : "all";
}

export async function GET(request: Request) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? undefined;
  const role = parseRole(url.searchParams.get("role"));

  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");
  const limit =
    limitRaw != null
      ? Math.min(Math.max(1, Number(limitRaw) || 0), USERS_LIST_MAX_LIMIT)
      : USERS_LIST_DEFAULT_LIMIT;
  const offset =
    offsetRaw != null ? Math.max(0, Number(offsetRaw) || 0) : 0;

  try {
    const result = await queryOrgUsersList({ q, role, limit, offset });
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to load users." },
      { status: 500 },
    );
  }
}
