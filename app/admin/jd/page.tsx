import { JdManagementDashboard } from "@/components/admin/jd/jd-management-dashboard";
import { getRequestAuth } from "@/lib/admin/request-auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jobs | Smart Hire Admin",
  description: "Manage and monitor recruitment job descriptions.",
};
import {
  defaultJdStartDateRangeIso,
  queryJobDescriptionsWithEnrichment,
  JD_LIST_PAGE_SIZE,
  type JobDescriptionListRow,
  type JobDescriptionsListPagination,
} from "@/lib/jd/list-with-enrichment";
import type { JdStatus } from "@/lib/jd/types";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type JdListInitialData = {
  jobDescriptions: JobDescriptionListRow[];
  pagination: JobDescriptionsListPagination;
  statusCounts: Record<JdStatus, number>;
};

// `queryJobDescriptionsWithEnrichment` resolves to `{ jobDescriptions, error }`
// rather than throwing (Supabase queries never reject on their own), so this
// helper throws explicitly. That gives `use()` a real rejection to propagate
// to the `SuspenseErrorBoundary` inside `JdManagementDashboard` instead of the
// list silently rendering empty. Matches the default client-side filter state
// (page 1, no search/status filter, last-3-months start-date range) so the
// first paint doesn't need an immediate client refetch to stay in sync.
async function getJobDescriptionsList(
  supabase: SupabaseServerClient,
): Promise<JdListInitialData> {
  const { from, to } = defaultJdStartDateRangeIso();
  const { jobDescriptions, pagination, statusCounts, error } =
    await queryJobDescriptionsWithEnrichment(supabase, {
      startFrom: from,
      startTo: to,
      limit: JD_LIST_PAGE_SIZE,
      offset: 0,
    });
  if (error) throw new Error(error);
  return { jobDescriptions, pagination: pagination!, statusCounts };
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
