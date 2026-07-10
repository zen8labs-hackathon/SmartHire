import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/shell/page-header";
import { StatisticCard, SectionCard } from "@/components/admin/shell/cards";
import {
  Briefcase,
  Users,
  FileText,
  Layers,
  Activity,
  Calendar,
  Clock,
  ArrowRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Admin Dashboard | Smart Hire Admin",
  description:
    "Central workspace management, audit logs, and recruiting analytics.",
};

export const dynamic = "force-dynamic";

// ─── Skeleton fallbacks ───────────────────────────────────────────────────────

function StatsGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="relative overflow-hidden border border-divider/60 bg-surface-secondary/35 p-5 rounded-2xl animate-pulse"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="h-3 w-28 rounded bg-default-200" />
            <div className="h-5 w-5 rounded bg-default-200" />
          </div>
          <div className="mt-3 h-8 w-20 rounded bg-default-200" />
          <div className="mt-2 h-3 w-36 rounded bg-default-100" />
        </div>
      ))}
    </div>
  );
}

function SectionListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-divider">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-3 animate-pulse">
          <div className="space-y-1.5">
            <div className="h-4 w-40 rounded bg-default-200" />
            <div className="h-3 w-24 rounded bg-default-100" />
          </div>
          <div className="h-5 w-16 rounded-full bg-default-100" />
        </div>
      ))}
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="relative border-l-2 border-divider pl-4 ml-2 space-y-5 py-1 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="relative">
          <span className="absolute -left-[21px] top-1.5 flex h-2 w-2 rounded-full bg-default-200" />
          <div className="flex items-center justify-between gap-4">
            <div className="h-4 w-64 rounded bg-default-200" />
            <div className="h-3 w-24 rounded bg-default-100 shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Async server components (each fetches its own data) ─────────────────────

async function DashboardStats() {
  const supabase = await createClient();
  const [candidatesRes, jobsRes, usersRes, pipelinesRes] = await Promise.all([
    supabase
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("job_descriptions")
      .select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("pipeline_stages")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
  ]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatisticCard
        label="Total Candidates"
        value={candidatesRes.count ?? 0}
        icon={<FileText className="h-5 w-5" />}
        description="Active applicant CVs"
      />
      <StatisticCard
        label="Job Descriptions"
        value={jobsRes.count ?? 0}
        icon={<Briefcase className="h-5 w-5" />}
        description="Open & draft positions"
      />
      <StatisticCard
        label="Team Members"
        value={usersRes.count ?? 0}
        icon={<Users className="h-5 w-5" />}
        description="Recruiter and HR profiles"
      />
      <StatisticCard
        label="Pipeline Stages"
        value={pipelinesRes.count ?? 0}
        icon={<Layers className="h-5 w-5" />}
        description="Active screening pipeline steps"
      />
    </div>
  );
}

async function RecentJobs() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("job_descriptions")
    .select("id, position, status, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <div className="divide-y divide-divider">
      {!data?.length ? (
        <div className="py-6 text-center text-sm text-muted">
          No job descriptions available.
        </div>
      ) : (
        data.map((job: any) => (
          <div
            key={job.id}
            className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <Link
                href="/admin/jd"
                className="text-sm font-semibold text-foreground hover:text-accent truncate block"
              >
                {job.position}
              </Link>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted">
                <Calendar className="h-3 w-3" />
                <span>{formatDate(job.created_at)}</span>
              </div>
            </div>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                job.status === "active"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-surface-tertiary text-muted border border-divider"
              }`}
            >
              {job.status}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

async function RecentCandidates() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("candidates")
    .select("id, name, role, status, cv_uploaded_at")
    .eq("is_active", true)
    .order("cv_uploaded_at", { ascending: false, nullsFirst: false })
    .limit(5);

  return (
    <div className="divide-y divide-divider">
      {!data?.length ? (
        <div className="py-6 text-center text-sm text-muted">
          No candidates registered yet.
        </div>
      ) : (
        data.map((cand: any) => (
          <div
            key={cand.id}
            className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-secondary text-xs font-bold text-foreground border border-divider shrink-0">
                {(cand?.name || "Candidate").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {cand.name || "Candidate"}
                </p>
                <p className="text-xs text-muted truncate mt-0.5">
                  {cand.role || "Role unspecified"}
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wide bg-accent/15 text-accent px-2 py-0.5 rounded-full shrink-0">
              {cand.status ? cand.status.replace("_", " ") : ""}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

async function RecentActivities() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("candidate_cv_detail_version_events")
    .select("id, event_type, change_summary, created_at, candidates(name)")
    .order("created_at", { ascending: false })
    .limit(5);

  const getEventDescription = (event: any) => {
    const target = event.candidates?.name
      ? `for candidate "${event.candidates.name}"`
      : "";
    if (event.event_type === "profile_edit")
      return `Edited profile details ${target}: ${event.change_summary || "updated fields"}`;
    if (event.event_type === "pre_restore")
      return `Created a restore snapshot ${target}`;
    if (event.event_type === "full_restore")
      return `Restored a previous CV version ${target}`;
    return `${event.change_summary || "Modified record"} ${target}`;
  };

  const formatDateTime = (dateStr: string) => ({
    date: new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric" }),
    time: new Date(dateStr).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  });

  if (!data?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-muted gap-2">
        <Activity className="h-8 w-8 text-muted/50" />
        <p className="text-sm font-medium">
          No recent CV edits or version changes recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="relative border-l-2 border-divider pl-4 ml-2 space-y-5 py-1">
      {data.map((event: any) => {
        const { date, time } = formatDateTime(event.created_at);
        return (
          <div key={event.id} className="relative group">
            <span className="absolute -left-[21px] top-1.5 flex h-2 w-2 rounded-full bg-accent ring-4 ring-background" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <p className="text-sm font-semibold text-foreground">
                {getEventDescription(event)}
              </p>
              <div className="flex items-center gap-1.5 text-xs text-muted shrink-0 mt-0.5 sm:mt-0 font-medium">
                <Clock className="h-3.5 w-3.5" />
                <span>{date} at {time}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminPage() {
  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin");
  if (!access?.isHr) redirect("/admin/jd");

  return (
    <div className="space-y-8 font-sans">
      <PageHeader
        title="Admin Control Panel"
        description="Monitor system metrics, active pipelines, recent uploads, and account changes."
      />

      {/* Stats cards — stream in as soon as the 4 counts resolve */}
      <Suspense fallback={<StatsGridSkeleton />}>
        <DashboardStats />
      </Suspense>

      {/* Lists grid — Recent Jobs and Candidates stream independently */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <SectionCard
            title="Recent Jobs"
            description="Newly created or updated job openings."
            actions={
              <Link
                href="/admin/jd"
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-0.5"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            }
          >
            <Suspense fallback={<SectionListSkeleton rows={5} />}>
              <RecentJobs />
            </Suspense>
          </SectionCard>
        </div>

        <div className="lg:col-span-6">
          <SectionCard
            title="Recent Candidates"
            description="Latest applicant CV uploads and parses."
            actions={
              <Link
                href="/admin/candidates"
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-0.5"
              >
                View pool <ArrowRight className="h-3 w-3" />
              </Link>
            }
          >
            <Suspense fallback={<SectionListSkeleton rows={5} />}>
              <RecentCandidates />
            </Suspense>
          </SectionCard>
        </div>

        {/* Audit log — heaviest query, streams in last */}
        <div className="lg:col-span-12">
          <SectionCard
            title="Recent Activities"
            description="Audit events recorded for candidate profile updates and restorations."
          >
            <Suspense fallback={<TimelineSkeleton />}>
              <RecentActivities />
            </Suspense>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
