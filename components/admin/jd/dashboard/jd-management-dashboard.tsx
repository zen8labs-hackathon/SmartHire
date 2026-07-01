import React from "react";
import { JdDashboardProvider } from "./context";
import { JdHeader } from "./jd-header";
import { JdFilters } from "./jd-filters";
import { JdStats } from "./jd-stats";
import { JdTable } from "./jd-table";
import { JdCreateModal } from "./jd-create-modal";
import { JdEditModal } from "./jd-edit-modal";
import { JdDeleteModal } from "./jd-delete-modal";
import { JdDetailDrawer } from "./jd-detail-drawer";

interface JdManagementDashboardProps {
  canManageJds?: boolean;
  chapters?: readonly { id: string; name: string }[];
  allPipelineStages?: readonly { id: string; label: string; code: string; color: string }[];
}

export function JdManagementDashboard({
  canManageJds = true,
  chapters = [],
  allPipelineStages = [],
}: JdManagementDashboardProps) {
  return (
    <JdDashboardProvider
      canManageJds={canManageJds}
      chapters={chapters}
      allPipelineStages={allPipelineStages}
    >
      <div className="flex flex-col gap-8">
        <JdHeader />
        <JdFilters />
        <JdStats />
        <JdTable />

        {/* Modals & Drawer */}
        <JdCreateModal />
        <JdEditModal />
        <JdDeleteModal />
        <JdDetailDrawer />
      </div>
    </JdDashboardProvider>
  );
}
export default JdManagementDashboard;
