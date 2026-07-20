import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Candidate Evaluation | Smart Hire Admin",
  description: "Evaluate candidate performance and view screening details.",
};

import { PipelineCandidateEvaluationClient } from "@/components/admin/jd/pipeline-candidate-evaluation-client";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { isChapterHeadOnJob } from "@/lib/admin/profile-access";
import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import { getPool } from "@/lib/db/config/client";
import { campaignAppliedAdminRowToEvaluationRow } from "@/lib/jd/campaign-applied-to-evaluation-row";
import { fetchJobPipelineConfig } from "@/lib/pipelines/transition-validator";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PageProps = {
  params: Promise<{ jobId: string; candidateId: string }>;
};

export default async function PipelineCandidateEvaluationPage({
  params,
}: PageProps) {
  const { jobId, candidateId } = await params;
  if (!UUID_RE.test(jobId) || !UUID_RE.test(candidateId)) notFound();

  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/jd");
  if (!access?.isStaff) redirect("/dashboard");

  const db = getPool();
  // None of these three depend on each other's result, so they can run
  // concurrently instead of waterfalling. Only fire the chapter-head check
  // when it can actually affect the outcome (access.isHr already grants
  // canViewSalary), matching the original short-circuit.
  const [row, isChapterHead, pipelineConfig] = await Promise.all([
    getCampaignAppliedAdminRowById(db, candidateId),
    access.isHr ? Promise.resolve(false) : isChapterHeadOnJob(db, user.id, jobId),
    fetchJobPipelineConfig(db, jobId),
  ]);
  if (!row || row.job_id !== jobId) notFound();

  const canViewSalary = access.isHr || isChapterHead;

  const candidate = campaignAppliedAdminRowToEvaluationRow(row, {
    canViewSalary,
    stageMappings: pipelineConfig.stageMappings,
    subStages: pipelineConfig.subStages,
  });

  return (
    <PipelineCandidateEvaluationClient
      jobId={jobId}
      jobTitle={row.job_position}
      candidate={candidate}
      currentUserId={user.id}
      isAdmin={access.isAdmin}
      canEditProfile={access.isHr}
    />
  );
}
