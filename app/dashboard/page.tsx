import Link from "next/link";
import { redirect } from "next/navigation";

import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@heroui/react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = user.email ?? profile?.username ?? "User";
  const staffAccess = await getStaffProfileAccess(supabase, user.id);
  const showRecruiting = staffAccess?.isStaff === true;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
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
          {showRecruiting ? (
            <div className="flex flex-col gap-2 text-sm text-muted">
              <p className="font-medium text-foreground">Recruiting</p>
              <ul className="list-inside list-disc space-y-1">
                {staffAccess?.isHr ? (
                  <>
                    <li>
                      <Link
                        href="/admin"
                        className="font-medium text-accent underline"
                      >
                        Users — invite & manage accounts
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/admin/candidates"
                        className="font-medium text-accent underline"
                      >
                        Candidates — talent pool
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/admin/evaluation-template"
                        className="font-medium text-accent underline"
                      >
                        Evaluation template — interview form PDF
                      </Link>
                    </li>
                  </>
                ) : null}
                <li>
                  <Link
                    href="/admin/jd"
                    className="font-medium text-accent underline"
                  >
                    Job descriptions — openings & pipeline
                  </Link>
                </li>
              </ul>
            </div>
          ) : null}
        </Card.Content>
      </Card>
    </div>
  );
}
