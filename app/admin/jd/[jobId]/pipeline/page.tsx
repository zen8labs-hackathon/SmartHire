import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Job Pipeline | Smart Hire Admin",
  description: "View candidate pipeline and evaluation statuses.",
};

import { JobPipelineSpreadsheet } from "@/components/admin/jd/job-pipeline-spreadsheet";
import { getRequestAuth } from "@/lib/admin/request-auth";
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

// Mirrors the page's prior behavior: a candidates-fetch failure is a soft
// failure (surfaced as `fetchFailed`, not a thrown error), while
// `fetchJobPipelineConfig`'s own errors are allowed to propagate like every
// other `lib/db` caller (DB7X2K is green-field, no legacy fallback to reconcile).
async function getPipelineData(jobId: string): Promise<PipelineData> {
  const db = getPool();
  const [candidatesResult, pipelineConfig] = await Promise.all([
    fetchCandidatesForJobDescription(db, jobId),
    fetchJobPipelineConfig(db, jobId),
  ]);

  return {
    rows: candidatesResult.rows.map(toJdPipelineApplicationRow),
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

  const job = await getJobById(getPool(), jobId);
  if (!job) notFound();

  // Kick off the combined candidates + pipeline-config fetch but don't await
  // it here, so the header (breadcrumbs, title, Add candidates buttons)
  // renders immediately. The Suspense boundary inside JobPipelineSpreadsheet
  // only gates the data-panel region, which is the part that actually needs
  // this data.
  const pipelineDataPromise = getPipelineData(job.id);

  return (
    <JobPipelineSpreadsheet
      key={job.id}
      jobId={job.id}
      jobTitle={job.position}
      pipelineDataPromise={pipelineDataPromise}
      canEditPipeline={access.isHr}
      canAddCandidates={access.isStaff}
    />
  );
}
