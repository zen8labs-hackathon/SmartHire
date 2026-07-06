import { JdManagementDashboard } from "@/components/admin/jd/jd-management-dashboard";
import { getRequestAuth } from "@/lib/admin/request-auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jobs | Smart Hire Admin",
  description: "Manage and monitor recruitment job descriptions.",
};
import {
  queryJobDescriptionsWithEnrichment,
  type JobDescriptionListRow,
} from "@/lib/jd/list-with-enrichment";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// `queryJobDescriptionsWithEnrichment` resolves to `{ jobDescriptions, error }`
// rather than throwing (Supabase queries never reject on their own), so this
// helper throws explicitly. That gives `use()` a real rejection to propagate
// to the `SuspenseErrorBoundary` inside `JdManagementDashboard` instead of the
// list silently rendering empty.
async function getJobDescriptionsList(
  supabase: SupabaseServerClient,
): Promise<JobDescriptionListRow[]> {
  const { jobDescriptions, error } = await queryJobDescriptionsWithEnrichment(supabase);
  if (error) throw new Error(error);
  return jobDescriptions;
}

export default async function AdminJdPage() {
  const { access } = await getRequestAuth();
  const supabase = await createClient();

  const [chapterRowsRes, pipelineStagesRes] = await Promise.all([
    supabase
      .from("chapters")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase
      .from("pipeline_stages")
      .select("id, label, code, color")
      .is("deleted_at", null)
      .order("label", { ascending: true }),
  ]);

  const chapterRows = chapterRowsRes.data;
  const pipelineStages = pipelineStagesRes.data;

  // Kick off the JD list query but don't await it here, so the static header
  // below renders immediately. The Suspense boundary inside
  // JdManagementDashboard only gates the filters/stats/table region, which is
  // the part that actually needs this data.
  const jdListPromise = getJobDescriptionsList(supabase);

  return (
    <JdManagementDashboard
      canManageJds={access?.isHr === true}
      chapters={chapterRows ?? []}
      allPipelineStages={pipelineStages ?? []}
      initialRowsPromise={jdListPromise}
    />
  );
}
