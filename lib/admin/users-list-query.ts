import { listOrgUsersForAdminPage, type OrgUserRow } from "./list-org-users";

export const USERS_LIST_DEFAULT_LIMIT = 10;
export const USERS_LIST_MAX_LIMIT = 100;

export type UsersRoleFilter = "all" | "hr" | "chapter" | "dashboard";

export type UsersListQuery = {
  q?: string;
  role?: UsersRoleFilter;
  limit?: number;
  offset?: number;
};

export type UsersListCounts = {
  total: number;
  hr: number;
  recruiter: number;
  dashboardOnly: number;
};

export type UsersListResult = {
  users: OrgUserRow[];
  pagination: { total: number; limit: number; offset: number };
  counts: UsersListCounts;
};

function matchesRole(accessSummary: string, role: UsersRoleFilter): boolean {
  if (role === "all") return true;
  const upper = accessSummary.toUpperCase();
  if (role === "hr") return upper.includes("HR");
  if (role === "chapter") return upper.includes("CHAPTER");
  return !upper.includes("HR") && !upper.includes("CHAPTER");
}

/**
 * The Supabase Auth Admin API has no server-side search, so this always
 * lists every user first, then applies search/role filtering and pagination
 * in-process. `counts` are always computed over the full unfiltered set so
 * the stats cards stay accurate independent of the current search/role
 * filter or page.
 */
export async function queryOrgUsersList(
  options: UsersListQuery = {},
): Promise<UsersListResult> {
  const {
    q,
    role = "all",
    limit = USERS_LIST_DEFAULT_LIMIT,
    offset = 0,
  } = options;
  const allUsers = await listOrgUsersForAdminPage();

  const hr = allUsers.filter((u) =>
    u.accessSummary.toUpperCase().includes("HR"),
  ).length;
  const recruiter = allUsers.filter((u) =>
    u.accessSummary.toUpperCase().includes("CHAPTER"),
  ).length;
  const counts: UsersListCounts = {
    total: allUsers.length,
    hr,
    recruiter,
    dashboardOnly: allUsers.length - hr - recruiter,
  };

  const trimmedQ = q?.trim().toLowerCase();
  const filtered = allUsers.filter((u) => {
    if (trimmedQ) {
      const email = u.email.toLowerCase();
      const summary = u.accessSummary.toLowerCase();
      if (!email.includes(trimmedQ) && !summary.includes(trimmedQ)) {
        return false;
      }
    }
    return matchesRole(u.accessSummary, role);
  });

  const total = filtered.length;
  const users = filtered.slice(offset, offset + limit);

  return { users, pagination: { total, limit, offset }, counts };
}
