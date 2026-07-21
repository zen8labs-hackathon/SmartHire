import { JdManagementDashboard } from "@/components/admin/jd/jd-management-dashboard";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { canCreateJobs, hasRolePermission } from "@/lib/authz/can";
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

async function getJobDescriptionsList(
  visibleToUserId: string | undefined,
): Promise<JdListInitialData> {
  const { from, to } = defaultJdStartDateRangeIso();
  const { jobDescriptions, pagination, statusCounts } =
    await queryJobDescriptionsWithEnrichment(getPool(), {
      startFrom: from,
      startTo: to,
      limit: JD_LIST_PAGE_SIZE,
      offset: 0,
      visibleToUserId,
    });
  return { jobDescriptions, pagination: pagination!, statusCounts };
}

export default async function AdminJdPage() {
  const { access } = await getRequestAuth();

  const jdListPromise = getJobDescriptionsList(
    access && !access.isHr ? access.userId : undefined,
  );

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
      canManageJds={
        access != null &&
        (access.isHr || hasRolePermission(access, "job.view"))
      }
      canAdministerJds={access != null && canCreateJobs(access)}
      chapters={chapterRows}
      allPipelineStages={pipelineStages}
      initialRowsPromise={jdListPromise}
    />
  );
}
