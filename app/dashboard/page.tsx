import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@heroui/react";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/shell/page-header";
import { SectionCard } from "@/components/admin/shell/cards";
import {
  Briefcase,
  Users,
  FileText,
  Layers,
  Compass,
  FileSpreadsheet,
  Lock,
  Mail,
  ShieldCheck,
  Building,
} from "lucide-react";

export const dynamic = "force-dynamic";

type FeatureCardProps = {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  locked?: boolean;
  statusText?: string;
};

function FeatureLinkCard({
  href,
  title,
  description,
  icon,
  locked = false,
  statusText,
}: FeatureCardProps) {
  const content = (
    <Card
      variant="secondary"
      className={`group relative h-full border border-divider/60 p-5 rounded-2xl transition-all duration-200 ${
        locked
          ? "opacity-60 bg-surface-secondary/20 cursor-not-allowed"
          : "hover:border-accent/35 hover:bg-surface-secondary/50 hover:-translate-y-0.5 shadow-sm hover:shadow-md cursor-pointer"
      }`}
    >
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                locked
                  ? "bg-surface-tertiary text-muted"
                  : "bg-accent/10 text-accent group-hover:bg-accent group-hover:text-white"
              }`}
            >
              {locked ? <Lock className="h-4.5 w-4.5" /> : icon}
            </div>
            {statusText && (
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  locked
                    ? "bg-surface-tertiary text-muted border border-divider"
                    : "bg-accent/10 text-accent"
                }`}
              >
                {statusText}
              </span>
            )}
          </div>

          <div className="space-y-1">
            <h4 className="text-sm font-bold text-foreground">{title}</h4>
            <p className="text-xs text-muted leading-relaxed font-medium">
              {description}
            </p>
          </div>
        </div>

        {!locked && (
          <span className="text-[11px] font-semibold text-accent flex items-center gap-1 group-hover:underline">
            Launch tools →
          </span>
        )}
      </div>
    </Card>
  );

  if (locked) {
    return content;
  }

  return (
    <Link href={href} className="block h-full">
      {content}
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

  const displayName =
    profile?.username ?? user.email?.split("@")[0] ?? "Recruiter";
  const staffAccess = await getStaffProfileAccess(supabase, user.id);
  const isHr = staffAccess?.isHr === true;

  // Fetch chapter names
  const { data: chaptersData } = await supabase
    .from("profile_chapters")
    .select("chapters(name)")
    .eq("profile_id", user.id);

  const chapterNames = (chaptersData ?? [])
    .map((r: any) => r.chapters?.name)
    .filter((name): name is string => typeof name === "string");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Access workspaces and configurations for candidate workflows."
      />

      {/* Welcome Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-divider/60 bg-gradient-to-br from-accent/5 via-surface-secondary/40 to-surface-primary p-6 md:p-8 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-accent/5 blur-3xl animate-pulse-glow"
        />
        <div className="relative">
          <span className="text-[10px] font-bold uppercase tracking-widest text-accent">
            Welcome back
          </span>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {displayName}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            You are signed in to Smart Hire as an authorized recruiting member.
            Launch tools from the workspace cards below.
          </p>
        </div>
      </section>

      {/* User Information details */}
      <SectionCard
        title="My Account Overview"
        description="Your workspace profile and credentials."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-divider/50 bg-surface-secondary/20 p-3.5">
            <Mail className="h-4.5 w-4.5 text-muted shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted">
                Email address
              </p>
              <p className="text-xs font-semibold text-foreground truncate mt-0.5">
                {user.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-divider/50 bg-surface-secondary/20 p-3.5">
            <ShieldCheck className="h-4.5 w-4.5 text-muted shrink-0" />
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted">
                Access role
              </p>
              <span className="inline-flex mt-0.5 items-center rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">
                {isHr ? "HR Admin" : "Chapter Recruiter"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-divider/50 bg-surface-secondary/20 p-3.5">
            <Building className="h-4.5 w-4.5 text-muted shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted">
                My Chapters
              </p>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {chapterNames.length > 0 ? (
                  chapterNames.map((ch, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center rounded bg-surface-tertiary px-1.5 py-0.5 text-[10px] text-foreground border border-divider"
                    >
                      {ch}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted font-medium truncate">
                    None assigned
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Feature Cards Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted/80">
          Workspaces & Tools
        </h3>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureLinkCard
            href="/admin/jd"
            title="Jobs list"
            description="Manage job opening definitions and track candidate applications pipelines."
            icon={<Briefcase className="h-4.5 w-4.5" />}
            statusText="Core tool"
          />

          <FeatureLinkCard
            href="/admin/candidates"
            title="Candidates Pool"
            description="Access the central candidates, upload CVs, and monitor general pipeline states."
            icon={<FileText className="h-4.5 w-4.5" />}
            locked={!isHr}
            statusText={isHr ? "HR Admin" : "Locked"}
          />

          <FeatureLinkCard
            href="/admin/users"
            title="Users & Access"
            description="Invite new workspace accounts and set granular recruiting access controls."
            icon={<Users className="h-4.5 w-4.5" />}
            locked={!isHr}
            statusText={isHr ? "HR Admin" : "Locked"}
          />

          <FeatureLinkCard
            href="/admin/pipelines"
            title="Pipeline stages"
            description="Configure active candidate statuses, stages, and sub-stages validations."
            icon={<Layers className="h-4.5 w-4.5" />}
            locked={!isHr}
            statusText={isHr ? "Setup" : "Locked"}
          />

          <FeatureLinkCard
            href="/admin/chapters"
            title="Chapters setup"
            description="Define recruiting departments (chapters) and set viewer permissions."
            icon={<Compass className="h-4.5 w-4.5" />}
            locked={!isHr}
            statusText={isHr ? "Setup" : "Locked"}
          />

          <FeatureLinkCard
            href="/admin/evaluation-template"
            title="Evaluation Template"
            description="Upload and preview the active PDF template for candidate evaluation."
            icon={<FileSpreadsheet className="h-4.5 w-4.5" />}
            locked={!isHr}
            statusText={isHr ? "Setup" : "Locked"}
          />
        </div>
      </div>
    </div>
  );
}
