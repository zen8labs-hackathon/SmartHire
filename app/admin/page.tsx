import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { getPool } from "@/lib/db/config/client";
import { listCandidates } from "@/lib/db/candidates";
import { listJobs } from "@/lib/db/jobs";
import { listPublicUsers } from "@/lib/db/users";
import { listPipelineStages } from "@/lib/db/pipeline-stages";
import { listCampaignAppliedForAdmin } from "@/lib/db/campaign-applied-list";
import { listRecentCvDetailVersionsForAdmin } from "@/lib/db/cv-detail-versions";
import { PageHeader } from "@/components/admin/shell/page-header";
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
import { StatisticCard, SectionCard } from "@/components/admin/shell/cards";

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
  const db = getPool();
  const [candidatesResult, jobsResult, users, pipelineStages] = await Promise.all([
    listCandidates(db, { limit: 1 }),
    listJobs(db, { limit: 1 }),
    listPublicUsers(db),
    listPipelineStages(db),
  ]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatisticCard
        label="Total Candidates"
        value={candidatesResult.total}
        icon={<FileText className="h-5 w-5" />}
        description="Active applicant profiles"
      />
      <StatisticCard
        label="Job Descriptions"
        value={jobsResult.total}
        icon={<Briefcase className="h-5 w-5" />}
        description="Open & draft positions"
      />
      <StatisticCard
        label="Team Members"
        value={users.length}
        icon={<Users className="h-5 w-5" />}
        description="Recruiter and HR accounts"
      />
      <StatisticCard
        label="Pipeline Stages"
        value={pipelineStages.length}
        icon={<Layers className="h-5 w-5" />}
        description="Active screening pipeline steps"
      />
    </div>
  );
}

async function RecentJobs() {
  const { rows } = await listJobs(getPool(), { limit: 5 });

  const formatDate = (date: Date) =>
    new Date(date).toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <div className="divide-y divide-divider">
      {rows.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted">
          No job descriptions available.
        </div>
      ) : (
        rows.map((job) => (
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
                job.status === "Hiring"
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
  const { rows } = await listCampaignAppliedForAdmin(getPool(), { limit: 5 });

  return (
    <div className="divide-y divide-divider">
      {rows.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted">
          No candidates registered yet.
        </div>
      ) : (
        rows.map((row) => {
          const stageLabel =
            row.stage_label && row.sub_stage_label
              ? `${row.stage_label} · ${row.sub_stage_label}`
              : "New";
          return (
            <div
              key={row.id}
              className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-secondary text-xs font-bold text-foreground border border-divider shrink-0">
                  {(row.candidate_name || "Candidate").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {row.candidate_name || "Candidate"}
                  </p>
                  <p className="text-xs text-muted truncate mt-0.5">
                    {row.candidate_role || "Role unspecified"}
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wide bg-accent/15 text-accent px-2 py-0.5 rounded-full shrink-0">
                {stageLabel}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

async function RecentActivities() {
  const activities = await listRecentCvDetailVersionsForAdmin(getPool(), 5);

  const getEventDescription = (activity: (typeof activities)[number]) => {
    const target = activity.candidate_name
      ? `for candidate "${activity.candidate_name}" (${activity.job_position})`
      : `for an application to "${activity.job_position}"`;
    if (activity.source_event === "manual_edit")
      return `Edited CV details ${target}: ${activity.change_summary || "updated fields"}`;
    if (activity.source_event === "restore")
      return `Restored a previous CV version ${target}`;
    if (activity.source_event === "file_replaced")
      return `Replaced the CV file ${target}`;
    return `New CV uploaded ${target}`;
  };

  const formatDateTime = (date: Date) => ({
    date: new Date(date).toLocaleDateString([], { month: "short", day: "numeric" }),
    time: new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  });

  if (activities.length === 0) {
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
      {activities.map((activity) => {
        const { date, time } = formatDateTime(activity.created_at);
        return (
          <div key={activity.id} className="relative group">
            <span className="absolute -left-[21px] top-1.5 flex h-2 w-2 rounded-full bg-accent ring-4 ring-background" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <p className="text-sm font-semibold text-foreground">
                {getEventDescription(activity)}
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
            description="Audit events recorded for candidate CV updates and restorations."
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
