import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Job Pipeline | Smart Hire Admin",
  description: "View candidate pipeline and evaluation statuses.",
};

import { JobPipelineSpreadsheet } from "@/components/admin/jd/job-pipeline-spreadsheet";
import { getRequestAuth } from "@/lib/admin/request-auth";
import type { StaffProfileAccess } from "@/lib/admin/profile-access";
import { canViewJob, canViewSalary } from "@/lib/authz/can";
import { redactAdminRowSalary } from "@/lib/authz/redact-salary";
import { getPool } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";
import { fetchCandidatesForJobDescription } from "@/lib/candidates/fetch-candidates-for-job-description";
import {
  toJdPipelineApplicationRow,
  type JdPipelineApplicationRow,
} from "@/lib/candidates/campaign-applied-table-row";
import {
  fetchJobPipelineConfig,
  type StageMapping,
  type SubStage,
} from "@/lib/pipelines/transition-validator";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PageProps = {
  params: Promise<{ jobId: string }>;
};

export type PipelineData = {
  rows: JdPipelineApplicationRow[];
  fetchFailed: boolean;
  stageMappings: StageMapping[];
  subStages: SubStage[];
};

async function getPipelineData(
  jobId: string,
  access: StaffProfileAccess,
): Promise<PipelineData> {
  const db = getPool();
  const [candidatesResult, pipelineConfig, viewSalary] = await Promise.all([
    fetchCandidatesForJobDescription(db, jobId),
    fetchJobPipelineConfig(db, jobId),
    canViewSalary(db, access, jobId),
  ]);

  return {
    rows: candidatesResult.rows.map((r) =>
      toJdPipelineApplicationRow(redactAdminRowSalary(r, viewSalary)),
    ),
    fetchFailed: candidatesResult.error != null,
    stageMappings: pipelineConfig.stageMappings,
    subStages: pipelineConfig.subStages,
  };
}

export default async function JobPipelinePage({ params }: PageProps) {
  const { jobId } = await params;
  if (!UUID_RE.test(jobId)) notFound();

  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/jd");
  if (!access?.isStaff) redirect("/dashboard");

  const db = getPool();
  const allowed = await canViewJob(db, access, jobId);
  if (!allowed) redirect("/admin/jd");

  const job = await getJobById(db, jobId);
  if (!job) notFound();

  const pipelineDataPromise = getPipelineData(job.id, access);

  return (
    <JobPipelineSpreadsheet
      key={job.id}
      jobId={job.id}
      jobTitle={job.position}
      hasJdSourceFile={!!job.jd_storage_path}
      pipelineDataPromise={pipelineDataPromise}
      canEditPipeline={access.isHr}
      canAddCandidates={access.isStaff}
    />
  );
}
