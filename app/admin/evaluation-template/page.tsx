import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Evaluation Template | Smart Hire Admin",
  description: "Upload and manage per-job interview evaluation templates.",
};

import { CandidateEvaluationTemplateManager } from "@/components/admin/candidate-evaluation-template/candidate-evaluation-template-manager";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { getPool } from "@/lib/db/config/client";
import { listJobs } from "@/lib/db/jobs";
import { PageHeader } from "@/components/admin/shell/page-header";

export default async function AdminEvaluationTemplatePage() {
  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/evaluation-template");
  if (!access?.isHr) redirect("/admin/jd");

  const { rows: jobs } = await listJobs(getPool(), { limit: 200 });

  return (
    <div className="flex flex-col gap-4 font-sans">
      <PageHeader
        title="Evaluation Template"
        description="Upload and manage the PDF document used as each job's candidate interview evaluation form."
      />

      <CandidateEvaluationTemplateManager
        jobs={jobs.map((j) => ({ id: j.id, position: j.position }))}
      />
    </div>
  );
}
