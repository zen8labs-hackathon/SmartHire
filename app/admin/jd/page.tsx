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
import { listChapters } from "@/lib/db/chapters";
import { getPool } from "@/lib/db/config/client";
import { listPipelineStages } from "@/lib/db/pipeline-stages";

export type JdListInitialData = {
  jobDescriptions: JobDescriptionListRow[];
  pagination: JobDescriptionsListPagination;
  statusCounts: Record<JdStatus, number>;
};

// Matches the default client-side filter state (page 1, no search/status
// filter, last-3-months start-date range) so the first paint doesn't need an
// immediate client refetch to stay in sync.
async function getJobDescriptionsList(): Promise<JdListInitialData> {
  const { from, to } = defaultJdStartDateRangeIso();
  const { jobDescriptions, pagination, statusCounts } =
    await queryJobDescriptionsWithEnrichment(getPool(), {
      startFrom: from,
      startTo: to,
      limit: JD_LIST_PAGE_SIZE,
      offset: 0,
    });
  return { jobDescriptions, pagination: pagination!, statusCounts };
}

export default async function AdminJdPage() {
  const { access } = await getRequestAuth();

  // Kick off all 3 queries simultaneously so jdListPromise doesn't have to
  // wait for the reference data (chapters, pipeline_stages) to finish first.
  const jdListPromise = getJobDescriptionsList();

  const db = getPool();
  const [chapterRows, pipelineStageRows] = await Promise.all([
    listChapters(db),
    listPipelineStages(db),
  ]);
  const pipelineStages = pipelineStageRows.map((s) => ({
    id: s.id,
    label: s.label,
    code: s.code,
    color: s.color ?? "zinc",
  }));

  return (
    <JdManagementDashboard
      canManageJds={access?.isHr === true}
      chapters={chapterRows}
      allPipelineStages={pipelineStages}
      initialRowsPromise={jdListPromise}
    />
  );
}
