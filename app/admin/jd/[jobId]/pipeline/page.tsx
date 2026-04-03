import { notFound } from "next/navigation";

import { JobPipelineSpreadsheet } from "@/components/admin/jd/job-pipeline-spreadsheet";
import { getJobPipelineView } from "@/lib/jd/pipeline-mock-data";
import { JD_ROWS } from "@/lib/jd/mock-data";

type PageProps = {
  params: Promise<{ jobId: string }>;
};

export default async function JobPipelinePage({ params }: PageProps) {
  const { jobId } = await params;
  const exists = JD_ROWS.some((r) => r.id === jobId);
  if (!exists) {
    notFound();
  }
  const model = getJobPipelineView(jobId);
  return (
    <JobPipelineSpreadsheet
      jobId={model.jobId}
      jobTitle={model.jobTitle}
      totalCandidates={model.totalCandidates}
      activeOffers={model.activeOffers}
      rows={model.rows}
    />
  );
}
