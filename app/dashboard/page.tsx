import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@heroui/react";
import { PageHeader } from "@/components/admin/shell/page-header";
import {
  Briefcase,
  Users,
  FileText,
  Layers,
  Compass,
  FileSpreadsheet,
  Lock,
} from "lucide-react";
import { Chip } from "@/components/ui";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { hasRolePermission } from "@/lib/authz/can";
import { getPool } from "@/lib/db/config/client";
import { getPublicUserById } from "@/lib/db/users";

type FeatureColor =
  | "accent"
  | "blue"
  | "purple"
  | "warning"
  | "cyan"
  | "success";

// DS: brand green is the only accent; cards stay neutral regardless of color key.
const ACCENT_STYLES = {
  iconBg: "bg-accent-soft",
  iconText: "text-accent",
  link: "text-accent",
};

const COLOR_STYLES: Record<
  FeatureColor,
  { iconBg: string; iconText: string; link: string }
> = {
  accent: ACCENT_STYLES,
  blue: ACCENT_STYLES,
  purple: ACCENT_STYLES,
  warning: ACCENT_STYLES,
  cyan: ACCENT_STYLES,
  success: ACCENT_STYLES,
};

type FeatureCardProps = {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  locked?: boolean;
  statusText?: string;
  color?: FeatureColor;
};

function FeatureLinkCard({
  href,
  title,
  description,
  icon,
  locked = false,
  statusText,
  color = "accent",
}: FeatureCardProps) {
  const styles = COLOR_STYLES[color];

  const content = (
    <Card
      variant="secondary"
      className={`group relative h-full rounded-lg border border-divider bg-surface p-4 shadow-none transition-colors duration-[120ms] ease-standard ${
        locked
          ? "cursor-not-allowed bg-surface-subtle"
          : "cursor-pointer hover:border-border-strong hover:bg-surface-subtle"
      }`}
    >
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                locked
                  ? "bg-neutral-100 text-muted"
                  : `${styles.iconBg} ${styles.iconText}`
              }`}
            >
              {locked ? <Lock className="h-4.5 w-4.5" /> : icon}
            </div>
            {statusText && (
              <Chip tone={locked ? "lock" : "neutral"} icon={locked ? Lock : undefined}>
                {statusText}
              </Chip>
            )}
          </div>

          <div className="space-y-1">
            <h4 className="text-body font-semibold text-foreground">{title}</h4>
            <p className="text-caption leading-relaxed text-muted">
              {description}
            </p>
          </div>
        </div>

        {!locked && (
          <span
            className={`flex items-center gap-1 text-caption font-medium ${styles.link} group-hover:underline`}
          >
            Open
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
  // getRequestAuth() is memoized via React cache() — the layout already called
  // it, so this resolves instantly from cache without extra network round-trips.
  const { user, access } = await getRequestAuth();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  const isHr =
    access != null &&
    (access.isHr ||
      hasRolePermission(access, "job.manage") ||
      hasRolePermission(access, "users.manage"));

  // Only one additional query needed: the display name from the user row.
  const profile = await getPublicUserById(getPool(), user.id);

  const displayName =
    profile?.username ?? user.email?.split("@")[0] ?? "Recruiter";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        description="Access workspaces and configurations for candidate workflows."
      />

      {/* Welcome Banner */}
      <section className="rounded-lg border border-divider bg-surface p-5">
        <div>
          <span className="text-caption font-medium text-muted">
            Welcome back
          </span>
          <h2 className="mt-1 text-page font-semibold text-heading">
            {displayName}
          </h2>
          <p className="mt-2 max-w-xl text-body leading-relaxed text-fg-2">
            You are signed in to Smart Hire as an authorized recruiting member.
            Launch tools from the workspace cards below.
          </p>
        </div>
      </section>

      {/* User Information details */}
      {/* <SectionCard
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
      </SectionCard> */}

      {/* Feature Cards Grid */}
      <div className="space-y-3">
        <h3 className="text-section font-semibold text-foreground">
          Workspaces and tools
        </h3>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureLinkCard
            href="/admin/jd"
            title="Jobs list"
            description="Manage job opening definitions and track candidate applications pipelines."
            icon={<Briefcase className="h-4.5 w-4.5" />}
            statusText="Core tool"
            color="accent"
          />

          <FeatureLinkCard
            href="/admin/candidates"
            title="Candidates pool"
            description="Access the central candidates, upload CVs, and monitor general pipeline states."
            icon={<FileText className="h-4.5 w-4.5" />}
            locked={!isHr}
            statusText={isHr ? "HR Admin" : "Locked"}
            color="blue"
          />

          <FeatureLinkCard
            href="/admin/users"
            title="Users and access"
            description="Invite new workspace accounts and set granular recruiting access controls."
            icon={<Users className="h-4.5 w-4.5" />}
            locked={!isHr}
            statusText={isHr ? "HR Admin" : "Locked"}
            color="purple"
          />

          <FeatureLinkCard
            href="/admin/pipelines"
            title="Pipeline stages"
            description="Configure active candidate statuses, stages, and sub-stages validations."
            icon={<Layers className="h-4.5 w-4.5" />}
            locked={!isHr}
            statusText={isHr ? "Setup" : "Locked"}
            color="warning"
          />

          <FeatureLinkCard
            href="/admin/chapters"
            title="Chapters setup"
            description="Define recruiting departments (chapters) and set viewer permissions."
            icon={<Compass className="h-4.5 w-4.5" />}
            locked={!isHr}
            statusText={isHr ? "Setup" : "Locked"}
            color="cyan"
          />

          <FeatureLinkCard
            href="/admin/evaluation-template"
            title="Evaluation Template"
            description="Upload and preview the active PDF template for candidate evaluation."
            icon={<FileSpreadsheet className="h-4.5 w-4.5" />}
            locked={!isHr}
            statusText={isHr ? "Setup" : "Locked"}
            color="success"
          />
        </div>
      </div>
    </div>
  );
}
