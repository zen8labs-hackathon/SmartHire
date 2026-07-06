import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";

import { AddUserForm } from "@/components/admin/add-user-form";
import { listOrgUsersForAdminPage } from "@/lib/admin/list-org-users";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@heroui/react";
import { UsersTableWrapper } from "@/components/admin/users-table-wrapper";
import { DataTableSkeleton } from "@/components/admin/shell/table-system";

export const metadata: Metadata = {
  title: "Users | Smart Hire Admin",
  description: "View team accounts and invite new users.",
};

async function TeamAccountsSection() {
  let orgUsers: Awaited<ReturnType<typeof listOrgUsersForAdminPage>> = [];
  try {
    orgUsers = await listOrgUsersForAdminPage();
  } catch {
    orgUsers = [];
  }

  const users = orgUsers.map((u) => ({
    id: u.id,
    email: u.email,
    accessSummary: u.accessSummary,
  }));

  return <UsersTableWrapper users={users} />;
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
    <div className="flex flex-col gap-8 font-sans">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Users & Access
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Manage member logins, access permissions, and roles.
        </p>
      </div>

      <Suspense fallback={<DataTableSkeleton columnsCount={2} rowsCount={4} />}>
        <TeamAccountsSection />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="border-divider lg:col-span-5 xl:col-span-4 rounded-2xl shadow-sm">
          <Card.Header className="border-b border-divider px-5 py-4">
            <Card.Title className="text-base font-semibold">Invite User</Card.Title>
            <Card.Description className="text-xs">
              Creates an Auth user and sets recruiting access on their profile.
            </Card.Description>
          </Card.Header>
          <Card.Content className="flex flex-col gap-4 p-5">
            <AddUserForm chapters={chapters ?? []} />
            <p className="text-center text-sm text-muted mt-2">
              <Link
                href="/dashboard"
                className="font-semibold text-accent hover:underline"
              >
                Back to dashboard
              </Link>
            </p>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
