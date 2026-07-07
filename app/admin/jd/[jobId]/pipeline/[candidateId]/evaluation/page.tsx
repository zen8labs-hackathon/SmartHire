import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Candidate Evaluation | Smart Hire Admin",
  description: "Evaluate candidate performance and view screening details.",
};

import { PipelineCandidateEvaluationClient } from "@/components/admin/jd/pipeline-candidate-evaluation-client";
import { ADMIN_CANDIDATES_SELECT } from "@/lib/candidates/admin-select";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { enrichCandidatesWithJobOpenings } from "@/lib/candidates/enrich-candidates-job-openings";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { isChapterHeadOnJobDescription } from "@/lib/admin/profile-access";
import { candidateDbRowToEvaluationPipelineRow } from "@/lib/jd/candidate-to-evaluation-pipeline-row";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ jobId: string; candidateId: string }>;
};

export default async function PipelineCandidateEvaluationPage({
  params,
}: PageProps) {
  const { jobId, candidateId } = await params;
  const numId = Number(jobId);
  if (!Number.isInteger(numId) || numId <= 0) notFound();

  if (!z.string().uuid().safeParse(candidateId).success) notFound();

  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/jd");
  if (!access?.isStaff) redirect("/dashboard");

  const supabase = await createClient();

  const [jdRes, openingsRes, candRes, isChapterHead] = await Promise.all([
    supabase
      .from("job_descriptions")
      .select("id, position")
      .eq("id", numId)
      .maybeSingle(),
    supabase
      .from("job_openings")
      .select("id")
      .eq("job_description_id", numId),
    supabase
      .from("candidates")
      .select(ADMIN_CANDIDATES_SELECT)
      .eq("id", candidateId)
      .eq("is_active", true)
      .maybeSingle(),
    access.isHr
      ? Promise.resolve(false)
      : isChapterHeadOnJobDescription(supabase, numId),
  ]);

  const canViewSalary = access.isHr || isChapterHead;

  const jd = jdRes.data;
  if (!jd) notFound();

  const openings = openingsRes.data;
  const openingsError = openingsRes.error;
  if (openingsError) notFound();

  const openingIds = new Set(
    (openings ?? []).map((o) => o.id as string).filter(Boolean),
  );
  if (openingIds.size === 0) notFound();

  const cand = candRes.data;
  const candError = candRes.error;
  if (candError || !cand) notFound();

  const [row] = await enrichCandidatesWithJobOpenings(supabase, [
    cand as unknown as CandidateDbRow,
  ]);
  if (!row.job_opening_id || !openingIds.has(row.job_opening_id)) {
    notFound();
  }

  // Expected salary is deliberately excluded from ADMIN_CANDIDATES_SELECT —
  // fetch it separately, and only when the viewer is allowed to see it.
  if (canViewSalary) {
    const { data: salaryRow } = await supabase
      .from("candidates")
      .select("expected_salary")
      .eq("id", candidateId)
      .maybeSingle();
    row.expected_salary = (salaryRow?.expected_salary as string | null) ?? null;
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
