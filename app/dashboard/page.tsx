import Link from "next/link";
import { redirect } from "next/navigation";

import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@heroui/react";

export const dynamic = "force-dynamic";

function WorkspaceCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="group block h-full">
      <Card
        variant="secondary"
        className="h-full border-divider transition-colors duration-200 hover:border-accent/35 hover:bg-surface-tertiary/60"
      >
        <Card.Content className="flex h-full flex-col gap-2 p-5">
          <Card.Title className="text-base font-semibold text-foreground group-hover:text-accent">
            {title}
          </Card.Title>
          <Card.Description className="text-sm leading-relaxed text-muted">
            {description}
          </Card.Description>
          <span className="mt-auto pt-2 text-xs font-medium text-accent opacity-90 group-hover:opacity-100">
            Open →
          </span>
        </Card.Content>
      </Card>
    </Link>
  );
}

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

  const displayName = user.email ?? profile?.username ?? "there";
  const staffAccess = await getStaffProfileAccess(supabase, user.id);
  const showRecruiting = staffAccess?.isStaff === true;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-8">
      <section className="relative overflow-hidden rounded-2xl border border-divider bg-gradient-to-br from-[#0a1f33]/90 via-surface-secondary to-background px-8 py-10 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            Welcome back
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            {displayName}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            You are signed in to Smart Hire. Use the shortcuts below to open the
            tools you use most.
          </p>
        </div>
      </section>

      {showRecruiting ? (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Recruiting workspace
            </h2>
            <p className="mt-1 text-sm text-muted">
              Jump into admin tools based on your role.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {staffAccess?.isHr ? (
              <>
                <WorkspaceCard
                  href="/admin"
                  title="Users"
                  description="Invite accounts and set recruiting access."
                />
                <WorkspaceCard
                  href="/admin/candidates"
                  title="CV management"
                  description="Talent pool, uploads, and pipeline."
                />
                <WorkspaceCard
                  href="/admin/evaluation-template"
                  title="Evaluation template"
                  description="Interview evaluation PDF for your process."
                />
              </>
            ) : null}
            <WorkspaceCard
              href="/admin/jd"
              title="Jobs list"
              description="Job definitions, openings, and applicant pipeline."
            />
          </div>
        </section>
      ) : (
        <Card variant="secondary" className="border-divider">
          <Card.Header>
            <Card.Title>Dashboard access</Card.Title>
            <Card.Description>
              Your account does not have recruiting workspace access yet. Ask an
              HR admin to grant access if you need it.
            </Card.Description>
          </Card.Header>
        </Card>
      )}
    </div>
  );
}
