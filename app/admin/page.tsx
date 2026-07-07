import { redirect } from "next/navigation";
import Link from "next/link";
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
  User,
  ArrowRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Admin Dashboard | Smart Hire Admin",
  description:
    "Central workspace management, audit logs, and recruiting analytics.",
};

export const dynamic = "force-dynamic";

type RecentJob = {
  id: number;
  position: string;
  status: string;
  created_at: string;
};

type RecentCandidate = {
  id: string;
  name: string;
  role: string | null;
  status: string;
  cv_uploaded_at: string | null;
};

type AuditEvent = {
  id: number;
  event_type: string;
  change_summary: string | null;
  created_at: string;
  candidate_name?: string;
};

export default async function AdminPage() {
  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin");
  if (!access?.isHr) redirect("/admin/jd");

  const supabase = await createClient();

  // 1. Fetch counts for statistics
  const [candidatesCountRes, jobsCountRes, usersCountRes, pipelinesCountRes] =
    await Promise.all([
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

  const totalCandidates = candidatesCountRes.count ?? 0;
  const totalJobs = jobsCountRes.count ?? 0;
  const totalUsers = usersCountRes.count ?? 0;
  const totalPipelines = pipelinesCountRes.count ?? 0;

  // 2. Fetch 5 recent jobs
  const { data: recentJobsRaw } = await supabase
    .from("job_descriptions")
    .select("id, position, status, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  const recentJobs: RecentJob[] = (recentJobsRaw ?? []).map((j: any) => ({
    id: j.id,
    position: j.position,
    status: j.status ?? "draft",
    created_at: j.created_at,
  }));

  // 3. Fetch 5 recent candidates
  const { data: recentCandidatesRaw } = await supabase
    .from("candidates")
    .select("id, name, role, status, cv_uploaded_at")
    .eq("is_active", true)
    .order("cv_uploaded_at", { ascending: false, nullsFirst: false })
    .limit(5);

  const recentCandidates: RecentCandidate[] = (recentCandidatesRaw ?? []).map(
    (c: any) => ({
      id: c.id,
      name: c.name || "Candidate",
      role: c.role,
      status: c.status || "",
      cv_uploaded_at: c.cv_uploaded_at,
    }),
  );

  // 4. Fetch 5 recent activities/audit events
  const { data: versionEventsRaw } = await supabase
    .from("candidate_cv_detail_version_events")
    .select("id, event_type, change_summary, created_at, candidates(name)")
    .order("created_at", { ascending: false })
    .limit(5);

  const auditEvents: AuditEvent[] = (versionEventsRaw ?? []).map((e: any) => ({
    id: Number(e.id),
    event_type: e.event_type,
    change_summary: e.change_summary,
    created_at: e.created_at,
    candidate_name: e.candidates?.name,
  }));

  const getEventDescription = (event: AuditEvent) => {
    const time = new Date(event.created_at).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    const target = event.candidate_name
      ? `for candidate "${event.candidate_name}"`
      : "";

    if (event.event_type === "profile_edit") {
      return `Edited profile details ${target}: ${event.change_summary || "updated fields"}`;
    }
    if (event.event_type === "pre_restore") {
      return `Created a restore snapshot ${target}`;
    }
    if (event.event_type === "full_restore") {
      return `Restored a previous CV version ${target}`;
    }
    return `${event.change_summary || "Modified record"} ${target}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="space-y-8 font-sans">
      <PageHeader
        title="Admin Control Panel"
        description="Monitor system metrics, active pipelines, recent uploads, and account changes."
      />

      {/* Statistics Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatisticCard
          label="Total Candidates"
          value={totalCandidates}
          icon={<FileText className="h-5 w-5" />}
          description="Active applicant CVs"
        />
        <StatisticCard
          label="Job Descriptions"
          value={totalJobs}
          icon={<Briefcase className="h-5 w-5" />}
          description="Open & draft positions"
        />
        <StatisticCard
          label="Team Members"
          value={totalUsers}
          icon={<Users className="h-5 w-5" />}
          description="Recruiter and HR profiles"
        />
        <StatisticCard
          label="Pipeline Stages"
          value={totalPipelines}
          icon={<Layers className="h-5 w-5" />}
          description="Active screening pipeline steps"
        />
      </div>

      {/* Lists and Timelines Dashboard Section */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Recent Jobs Panel */}
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
            <div className="divide-y divide-divider">
              {recentJobs.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted">
                  No job descriptions available.
                </div>
              ) : (
                recentJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/admin/jd`}
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
          </SectionCard>
        </div>

        {/* Recent Candidates Panel */}
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
            <div className="divide-y divide-divider">
              {recentCandidates.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted">
                  No candidates registered yet.
                </div>
              ) : (
                recentCandidates.map((cand) => (
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
                          {cand.name}
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
          </SectionCard>
        </div>

        {/* Recent Activities/Audit Log Timeline */}
        <div className="lg:col-span-12">
          <SectionCard
            title="Recent Activities"
            description="Audit events recorded for candidate profile updates and restorations."
          >
            <div className="space-y-4">
              {auditEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted gap-2">
                  <Activity className="h-8 w-8 text-muted/50" />
                  <p className="text-sm font-medium">
                    No recent CV edits or version changes recorded.
                  </p>
                </div>
              ) : (
                <div className="relative border-l-2 border-divider pl-4 ml-2 space-y-5 py-1">
                  {auditEvents.map((event) => (
                    <div key={event.id} className="relative group">
                      {/* Timeline dot */}
                      <span className="absolute -left-[21px] top-1.5 flex h-2 w-2 rounded-full bg-accent ring-4 ring-background" />

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <p className="text-sm font-semibold text-foreground">
                          {getEventDescription(event)}
                        </p>
                        <div className="flex items-center gap-1.5 text-xs text-muted shrink-0 mt-0.5 sm:mt-0 font-medium">
                          <Clock className="h-3.5 w-3.5" />
                          <span>
                            {formatDate(event.created_at)} at{" "}
                            {new Date(event.created_at).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
