import { notFound, redirect } from "next/navigation";

import { JobPipelineKanbanLoader } from "../job-pipeline-kanban-loader";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { fetchCandidatesForJobDescription } from "@/lib/candidates/fetch-candidates-for-job-description";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ jobId: string }>;
};

export default async function JobPipelineKanbanPage({ params }: PageProps) {
  const { jobId } = await params;
  const numId = Number(jobId);
  if (!Number.isInteger(numId) || numId <= 0) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/jd");

  const access = await getStaffProfileAccess(supabase, user.id);
  if (!access?.isStaff) redirect("/dashboard");

  const { data: jd } = await supabase
    .from("job_descriptions")
    .select("id, position")
    .eq("id", numId)
    .maybeSingle();

  if (!jd) notFound();

  const { data: linkedOpening } = await supabase
    .from("job_openings")
    .select("id, title, created_at")
    .eq("job_description_id", numId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { rows: initialPipelineCandidates, error: pipelineFetchError } =
    await fetchCandidatesForJobDescription(supabase, numId, {
      includeParsedPayload: true,
    });

  let stageMappings: any[] = [];
  let subStages: any[] = [];

  if (linkedOpening) {
    const { data: mappings } = await supabase
      .from("job_stage_mappings")
      .select(`
        id,
        sequence_number,
        pipeline_stage_id,
        pipeline_stages!inner (
          id,
          code,
          label,
          desc
        )
      `)
      .eq("job_opening_id", linkedOpening.id)
      .is("deleted_at", null)
      .order("sequence_number", { ascending: true });

    if (mappings && mappings.length > 0) {
      stageMappings = mappings;
    }
  }

  // Fallback to active pipeline stages if no mappings found
  if (stageMappings.length === 0) {
    const { data: defaultStages } = await supabase
      .from("pipeline_stages")
      .select("id, code, label, desc")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (defaultStages) {
      stageMappings = defaultStages.map((stage, idx) => ({
        id: stage.id, // Pseudo mapping ID
        sequence_number: idx + 1,
        pipeline_stage_id: stage.id,
        pipeline_stages: stage,
      }));
    }
  }

  const stageIds = stageMappings.map((sm) => sm.pipeline_stage_id);
  if (stageIds.length > 0) {
    const { data: sub } = await supabase
      .from("pipeline_sub_stages")
      .select("id, pipeline_stage_id, code, label, sequence_number, is_default, is_passed")
      .in("pipeline_stage_id", stageIds)
      .is("deleted_at", null)
      .order("sequence_number", { ascending: true });

    if (sub) {
      subStages = sub;
    }
  }

  return (
    <JobPipelineKanbanLoader
      key={`${jd.id}-v2`}
      jobDescriptionId={numId}
      jobId={String(jd.id)}
      jobTitle={jd.position}
      linkedJobOpeningId={linkedOpening?.id ?? null}
      linkedJobOpeningTitle={linkedOpening?.title ?? null}
      linkedJobOpeningTime={linkedOpening?.created_at ?? null}
      initialPipelineCandidates={initialPipelineCandidates}
      initialPipelineFetchFailed={pipelineFetchError != null}
      canEditPipeline={access.isHr}
      canAddCandidates={access.isHr}
      stageMappings={stageMappings}
      subStages={subStages}
    />
  );
}
