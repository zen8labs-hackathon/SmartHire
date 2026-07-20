import { listOrgUsersForAdminPage, type OrgUserRow } from "./list-org-users";

export const USERS_LIST_DEFAULT_LIMIT = 10;
export const USERS_LIST_MAX_LIMIT = 100;

export type UsersRoleFilter = "all" | "admin" | "hr" | "chapter" | "dashboard";

export type UsersListQuery = {
  q?: string;
  role?: UsersRoleFilter;
  limit?: number;
  offset?: number;
};

export type UsersListCounts = {
  total: number;
  admin: number;
  hr: number;
  recruiter: number;
  dashboardOnly: number;
};

export type UsersListResult = {
  users: OrgUserRow[];
  pagination: { total: number; limit: number; offset: number };
  counts: UsersListCounts;
};

function matchesRole(user: OrgUserRow, role: UsersRoleFilter): boolean {
  if (role === "all") return true;
  if (role === "admin") return user.role === "admin";
  if (role === "hr") return user.role === "hr";
  if (role === "chapter") return user.role === "recruiter";
  return user.role === "none";
}

/**
 * Lists every user first, then applies search/role filtering and pagination
 * in-process. `counts` are always computed over the full unfiltered set so
 * the stats cards stay accurate independent of the current search/role
 * filter or page. `q` matches against email and username only.
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

  const counts: UsersListCounts = {
    total: allUsers.length,
    admin: allUsers.filter((u) => u.role === "admin").length,
    hr: allUsers.filter((u) => u.role === "hr").length,
    recruiter: allUsers.filter((u) => u.role === "recruiter").length,
    dashboardOnly: allUsers.filter((u) => u.role === "none").length,
  };

  const trimmedQ = q?.trim().toLowerCase();
  const filtered = allUsers.filter((u) => {
    if (trimmedQ) {
      const email = u.email.toLowerCase();
      const username = u.username.toLowerCase();
      if (!email.includes(trimmedQ) && !username.includes(trimmedQ)) {
        return false;
      }
    }
    return matchesRole(u, role);
  });

  const total = filtered.length;
  const users = filtered.slice(offset, offset + limit);

  return { users, pagination: { total, limit, offset }, counts };
}
