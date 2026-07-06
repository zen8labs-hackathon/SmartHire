import { notFound, redirect } from "next/navigation";

import { JobPipelineSpreadsheet } from "@/components/admin/jd/job-pipeline-spreadsheet";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { fetchCandidatesForJobDescription } from "@/lib/candidates/fetch-candidates-for-job-description";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import {
  fetchJobPipelineConfig,
  type StageMapping,
  type SubStage,
} from "@/lib/pipelines/transition-validator";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ jobId: string }>;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type PipelineData = {
  rows: CandidateDbRow[];
  fetchFailed: boolean;
  stageMappings: StageMapping[];
  subStages: SubStage[];
};

// Mirrors the page's current behavior: a candidates-fetch failure is a soft
// failure (surfaced as `fetchFailed`, not a thrown error), while
// `fetchJobPipelineConfig`'s own `error` field is already ignored by the
// caller today (it falls back to whatever partial stageMappings/subStages it
// computed), so neither branch is turned into a hard throw here.
async function getPipelineData(
  supabase: SupabaseServerClient,
  jobDescriptionId: number,
  jobOpeningId: string | null,
): Promise<PipelineData> {
  const [candidatesResult, pipelineConfig] = await Promise.all([
    fetchCandidatesForJobDescription(supabase, jobDescriptionId, {
      includeParsedPayload: true,
    }),
    fetchJobPipelineConfig(supabase, jobOpeningId),
  ]);

  return {
    rows: candidatesResult.rows,
    fetchFailed: candidatesResult.error != null,
    stageMappings: pipelineConfig.stageMappings,
    subStages: pipelineConfig.subStages,
  };
}

export default async function JobPipelinePage({ params }: PageProps) {
  const { jobId } = await params;
  const numId = Number(jobId);
  if (!Number.isInteger(numId) || numId <= 0) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/jd");

  const access = await getStaffProfileAccess(supabase, user.id, user);
  if (!access?.isStaff) redirect("/dashboard");

  const [jdRes, linkedOpeningRes] = await Promise.all([
    supabase
      .from("job_descriptions")
      .select("id, position")
      .eq("id", numId)
      .maybeSingle(),
    supabase
      .from("job_openings")
      .select("id, title")
      .eq("job_description_id", numId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const jd = jdRes.data;
  if (!jd) notFound();

  const linkedOpening = linkedOpeningRes.data;

  // Kick off the combined candidates + pipeline-config fetch but don't await
  // it here, so the header (breadcrumbs, title, Add candidates buttons)
  // renders immediately. The Suspense boundary inside JobPipelineSpreadsheet
  // only gates the data-panel region, which is the part that actually needs
  // this data.
  const pipelineDataPromise = getPipelineData(
    supabase,
    numId,
    linkedOpening?.id ?? null,
  );

  return (
    <JobPipelineSpreadsheet
      key={String(jd.id)}
      jobDescriptionId={numId}
      jobId={String(jd.id)}
      jobTitle={jd.position}
      linkedJobOpeningId={linkedOpening?.id ?? null}
      linkedJobOpeningTitle={linkedOpening?.title ?? null}
      pipelineDataPromise={pipelineDataPromise}
      canEditPipeline={access.isHr}
      canAddCandidates={access.isHr}
    />
  );
}
