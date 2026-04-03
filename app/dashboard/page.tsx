import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutForm } from "@/components/auth/sign-out-form";
import { isProfileAdmin } from "@/lib/admin/config";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@heroui/react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = user.email ?? profile?.username ?? "User";
  const showAdmin = await isProfileAdmin(supabase, user.id);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <Card>
        <Card.Header>
          <Card.Title>Dashboard</Card.Title>
          <Card.Description>
            You are signed in to Smart Hire.
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          <p className="text-foreground">
            Signed in as{" "}
            <span className="font-medium">{displayName}</span>
          </p>
          {showAdmin ? (
            <p className="text-sm text-muted">
              <Link href="/admin" className="font-medium text-accent underline">
                Admin — add users
              </Link>
            </p>
          ) : null}
          <SignOutForm />
        </Card.Content>
      </Card>
    </div>
  );
}
