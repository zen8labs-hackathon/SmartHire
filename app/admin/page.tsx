import Link from "next/link";
import { redirect } from "next/navigation";

import { AddUserForm } from "@/components/admin/add-user-form";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@heroui/react";

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

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <Card>
        <Card.Header>
          <Card.Title>Admin</Card.Title>
          <Card.Description>
            Create a user with email and password. They can sign in immediately
            (email is marked confirmed).
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          <AddUserForm chapters={chapters ?? []} />
          <p className="text-center text-sm text-muted">
            <Link href="/dashboard" className="font-medium text-accent underline">
              Back to dashboard
            </Link>
          </p>
        </Card.Content>
      </Card>
    </div>
  );
}
