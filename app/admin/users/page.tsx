import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";

import {
  queryOrgUsersList,
  USERS_LIST_DEFAULT_LIMIT,
  type UsersListResult,
} from "@/lib/admin/users-list-query";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { getPool } from "@/lib/db/config/client";
import { listChapters } from "@/lib/db/chapters";
import { UsersTableWrapper } from "@/components/admin/users-table-wrapper";
import { DataTableSkeleton } from "@/components/admin/shell/table-system";
import { PageHeader } from "@/components/admin/shell/page-header";

export const metadata: Metadata = {
  title: "Users | Smart Hire Admin",
  description: "View team accounts and invite new users.",
};

const EMPTY_USERS_RESULT: UsersListResult = {
  users: [],
  pagination: { total: 0, limit: USERS_LIST_DEFAULT_LIMIT, offset: 0 },
  counts: { total: 0, admin: 0, hr: 0, recruiter: 0, dashboardOnly: 0 },
};

// Runs inside the Suspense boundary so the page shell renders immediately
// after the auth check. Both queries run in parallel.
async function TeamAccountsSection({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const [result, chapters] = await Promise.all([
    queryOrgUsersList({ limit: USERS_LIST_DEFAULT_LIMIT, offset: 0 }).catch(
      () => EMPTY_USERS_RESULT,
    ),
    listChapters(getPool()),
  ]);

  return (
    <UsersTableWrapper
      initialUsers={result.users}
      initialPagination={result.pagination}
      initialCounts={result.counts}
      chapters={chapters}
      currentUserId={currentUserId}
    />
  );
}

export default async function AdminUsersPage() {
  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/users");
  if (!access?.isHr) redirect("/admin/jd");

  return (
    <div className="flex flex-col gap-4 font-sans">
      <PageHeader
        title="Users & Access"
        description="Manage member logins, access permissions, and roles."
      />

      <Suspense fallback={<DataTableSkeleton columnsCount={2} rowsCount={4} />}>
        <TeamAccountsSection currentUserId={user.id} />
      </Suspense>
    </div>
  );
}
