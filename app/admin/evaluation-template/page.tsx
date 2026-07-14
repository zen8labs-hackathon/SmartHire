import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Evaluation Template | Smart Hire Admin",
  description: "Upload and manage per-job interview evaluation templates.",
};

import {
  CandidateEvaluationTemplateManager,
  type EvaluationTemplateJobOption,
} from "@/components/admin/candidate-evaluation-template/candidate-evaluation-template-manager";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { getPool } from "@/lib/db/config/client";
import { listJobs } from "@/lib/db/jobs";
import { PageHeader } from "@/components/admin/shell/page-header";

function TemplateManagerSkeleton() {
  return (
    <div className="rounded-2xl border border-divider/60 p-6 animate-pulse space-y-4">
      <div className="h-9 w-64 rounded-lg bg-default-200" />
      <div className="h-40 rounded-xl bg-default-100" />
    </div>
  );
}

async function getEvaluationTemplateJobs(): Promise<EvaluationTemplateJobOption[]> {
  const { rows: jobs } = await listJobs(getPool(), { limit: 200 });
  return jobs.map((j) => ({ id: j.id, position: j.position }));
}

export default async function AdminEvaluationTemplatePage() {
  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/evaluation-template");
  if (!access?.isHr) redirect("/admin/jd");

  // Kick off the jobs query but don't await it here, so the header renders
  // immediately; the Suspense boundary only gates the manager, which is the
  // part that actually needs this data.
  const jobsPromise = getEvaluationTemplateJobs();

  return (
    <div className="flex flex-col gap-4 font-sans">
      <PageHeader
        title="Evaluation Template"
        description="Upload and manage the PDF document used as each job's candidate interview evaluation form."
      />

      <Suspense fallback={<TemplateManagerSkeleton />}>
        <CandidateEvaluationTemplateManager jobsPromise={jobsPromise} />
      </Suspense>
    </div>
  );
}
