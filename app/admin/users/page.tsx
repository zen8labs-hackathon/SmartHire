import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";

import { AddUserForm } from "@/components/admin/add-user-form";
import {
  queryOrgUsersList,
  USERS_LIST_DEFAULT_LIMIT,
  type UsersListResult,
} from "@/lib/admin/users-list-query";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@heroui/react";
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
  counts: { total: 0, hr: 0, recruiter: 0, dashboardOnly: 0 },
};

async function TeamAccountsSection({ chapters }: { chapters: any[] }) {
  let result = EMPTY_USERS_RESULT;
  try {
    result = await queryOrgUsersList({ limit: USERS_LIST_DEFAULT_LIMIT, offset: 0 });
  } catch {
    result = EMPTY_USERS_RESULT;
  }

  return (
    <UsersTableWrapper
      initialUsers={result.users}
      initialPagination={result.pagination}
      initialCounts={result.counts}
      chapters={chapters}
    />
  );
}

export default async function AdminUsersPage() {
  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/users");
  if (!access?.isHr) redirect("/admin/jd");

  const supabase = await createClient();
  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, name")
    .order("name", { ascending: true });

  return (
    <div className="flex flex-col gap-4 font-sans">
      <PageHeader
        title="Users & Access"
        description="Manage member logins, access permissions, and roles."
      />

      <Suspense fallback={<DataTableSkeleton columnsCount={2} rowsCount={4} />}>
        <TeamAccountsSection chapters={chapters ?? []} />
      </Suspense>
    </div>
  );
}
