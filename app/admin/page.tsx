import Link from "next/link";
import { redirect } from "next/navigation";

import { AddUserForm } from "@/components/admin/add-user-form";
import { listOrgUsersForAdminPage } from "@/lib/admin/list-org-users";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { createClient } from "@/lib/supabase/server";
import { Card, Table } from "@heroui/react";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  const access = await getStaffProfileAccess(supabase, user.id);
  if (!access?.isHr) redirect("/admin/jd");

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, name")
    .order("name", { ascending: true });

  let orgUsers: Awaited<ReturnType<typeof listOrgUsersForAdminPage>> = [];
  try {
    orgUsers = await listOrgUsersForAdminPage();
  } catch {
    orgUsers = [];
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Users
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          View team accounts and invite new users. New accounts receive a
          confirmed email and can sign in immediately with the password you set.
        </p>
      </div>

      <Card variant="secondary" className="border-divider">
        <Card.Header className="border-b border-divider px-5 py-4">
          <Card.Title className="text-base">Team accounts</Card.Title>
          <Card.Description>
            {orgUsers.length} user{orgUsers.length === 1 ? "" : "s"} in this
            project.
          </Card.Description>
        </Card.Header>
        <Card.Content className="p-0">
          <Table aria-label="Team user accounts">
            <Table.ScrollContainer>
              <Table.Content>
                <Table.Header>
                  <Table.Column isRowHeader>Email</Table.Column>
                  <Table.Column>Access</Table.Column>
                </Table.Header>
                <Table.Body>
                  {orgUsers.length === 0 ? (
                    <Table.Row id="users-empty">
                      <Table.Cell
                        colSpan={2}
                        className="py-10 text-center text-sm text-muted"
                      >
                        No users found.
                      </Table.Cell>
                    </Table.Row>
                  ) : (
                    orgUsers.map((row) => (
                      <Table.Row key={row.id} id={row.id}>
                        <Table.Cell className="font-mono text-sm text-foreground">
                          {row.email}
                        </Table.Cell>
                        <Table.Cell className="text-sm text-muted">
                          {row.accessSummary}
                        </Table.Cell>
                      </Table.Row>
                    ))
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </Card.Content>
      </Card>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="border-divider lg:col-span-5 xl:col-span-4">
          <Card.Header>
            <Card.Title className="text-base">Invite user</Card.Title>
            <Card.Description>
              Creates an Auth user and sets recruiting access on their profile.
            </Card.Description>
          </Card.Header>
          <Card.Content className="flex flex-col gap-4">
            <AddUserForm chapters={chapters ?? []} />
            <p className="text-center text-sm text-muted">
              <Link
                href="/dashboard"
                className="font-medium text-accent underline underline-offset-2 hover:no-underline"
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
