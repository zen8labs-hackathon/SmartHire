import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { PipelineCandidateEvaluationClient } from "@/components/admin/jd/pipeline-candidate-evaluation-client";
import { ADMIN_CANDIDATES_SELECT } from "@/lib/candidates/admin-select";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { enrichCandidatesWithJobOpenings } from "@/lib/candidates/enrich-candidates-job-openings";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";
import { candidateDbRowToEvaluationPipelineRow } from "@/lib/jd/candidate-to-evaluation-pipeline-row";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ jobId: string; candidateId: string }>;
};

export default async function PipelineCandidateEvaluationPage({ params }: PageProps) {
  const { jobId, candidateId } = await params;
  const numId = Number(jobId);
  if (!Number.isInteger(numId) || numId <= 0) notFound();

  if (!z.string().uuid().safeParse(candidateId).success) notFound();

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

  const { data: openings, error: openingsError } = await supabase
    .from("job_openings")
    .select("id")
    .eq("job_description_id", numId);

  if (openingsError) notFound();

  const openingIds = new Set(
    (openings ?? []).map((o) => o.id as string).filter(Boolean),
  );
  if (openingIds.size === 0) notFound();

  const { data: cand, error: candError } = await supabase
    .from("candidates")
    .select(ADMIN_CANDIDATES_SELECT)
    .eq("id", candidateId)
    .maybeSingle();

  if (candError || !cand) notFound();

  const [row] = await enrichCandidatesWithJobOpenings(supabase, [
    cand as unknown as CandidateDbRow,
  ]);
  if (!row.job_opening_id || !openingIds.has(row.job_opening_id)) {
    notFound();
  }

  const candidate = candidateDbRowToEvaluationPipelineRow(row);

  return (
    <PipelineCandidateEvaluationClient
      jobDescriptionId={Number(jd.id)}
      jobTitle={jd.position}
      candidate={candidate}
    />
  );
}
