import { notFound } from "next/navigation";

import { JobPipelineSpreadsheet } from "@/components/admin/jd/job-pipeline-spreadsheet";
import { getJobPipelineView } from "@/lib/jd/pipeline-mock-data";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ jobId: string }>;
};

export default async function JobPipelinePage({ params }: PageProps) {
  const { jobId } = await params;
  const numId = Number(jobId);
  if (!Number.isInteger(numId) || numId <= 0) notFound();

  const supabase = await createClient();
  const { data: jd } = await supabase
    .from("job_descriptions")
    .select("id, position")
    .eq("id", numId)
    .maybeSingle();

  if (!jd) notFound();

  const { data: linkedOpening } = await supabase
    .from("job_openings")
    .select("id, title")
    .eq("job_description_id", numId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const model = getJobPipelineView(jobId);

  return (
    <JobPipelineSpreadsheet
      jobId={String(jd.id)}
      jobTitle={jd.position}
      totalCandidates={model.totalCandidates}
      activeOffers={model.activeOffers}
      rows={model.rows}
      linkedJobOpeningId={linkedOpening?.id ?? null}
      linkedJobOpeningTitle={linkedOpening?.title ?? null}
    />
  );
}
