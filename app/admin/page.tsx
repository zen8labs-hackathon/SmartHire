import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { UsersManager } from "@/components/admin/users-manager";
import { listOrgUsersForAdminPage } from "@/lib/admin/list-org-users";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Table } from "@heroui/react";

function TeamAccountsSkeleton() {
  return (
    <Card variant="secondary" className="border-divider animate-pulse">
      <Card.Header className="border-b border-divider px-5 py-4">
        <div className="h-5 w-32 bg-default-200 rounded" />
        <div className="mt-1.5 h-4 w-48 bg-default-100 rounded" />
      </Card.Header>
      <Card.Content className="p-0">
        <Table aria-label="Loading team user accounts">
          <Table.ScrollContainer>
            <Table.Content>
              <Table.Header>
                <Table.Column isRowHeader>Email</Table.Column>
                <Table.Column>Access</Table.Column>
                <Table.Column>Actions</Table.Column>
              </Table.Header>
              <Table.Body>
                <Table.Row id="users-loading-1">
                  <Table.Cell>
                    <div className="h-4 bg-default-200 rounded w-48 my-1" />
                  </Table.Cell>
                  <Table.Cell>
                    <div className="h-4 bg-default-100 rounded w-24 my-1" />
                  </Table.Cell>
                  <Table.Cell>
                    <div className="h-4 bg-default-100 rounded w-16 my-1" />
                  </Table.Cell>
                </Table.Row>
                <Table.Row id="users-loading-2">
                  <Table.Cell>
                    <div className="h-4 bg-default-200 rounded w-40 my-1" />
                  </Table.Cell>
                  <Table.Cell>
                    <div className="h-4 bg-default-100 rounded w-32 my-1" />
                  </Table.Cell>
                  <Table.Cell>
                    <div className="h-4 bg-default-100 rounded w-16 my-1" />
                  </Table.Cell>
                </Table.Row>
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </Card.Content>
    </Card>
  );
}

async function UsersSection({
  chapters,
}: {
  chapters: { id: string; name: string }[];
}) {
  let orgUsers: Awaited<ReturnType<typeof listOrgUsersForAdminPage>> = [];
  try {
    orgUsers = await listOrgUsersForAdminPage();
  } catch {
    orgUsers = [];
  }

  return <UsersManager users={orgUsers} chapters={chapters} />;
}

export default async function AdminPage() {
  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin");
  if (!access?.isHr) redirect("/admin/jd");

  const supabase = await createClient();
  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, name")
    .order("name", { ascending: true });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Users
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          View team accounts, invite new users, and manage their recruiting
          access. New accounts receive a confirmed email and can sign in
          immediately with the password you set.
        </p>
      </div>

      <Suspense fallback={<TeamAccountsSkeleton />}>
        <UsersSection chapters={chapters ?? []} />
      </Suspense>

      <p className="text-sm text-muted">
        <Link
          href="/dashboard"
          className="font-medium text-accent underline underline-offset-2 hover:no-underline"
        >
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
