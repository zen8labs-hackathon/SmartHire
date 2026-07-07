import { Suspense } from "react";
import { Alert } from "@heroui/react";

import { SuspenseErrorBoundary } from "@/components/admin/suspense-error-boundary";
import { JdListSkeleton } from "@/components/admin/jd/jd-list-skeleton";
import type { JdListInitialData } from "./hooks/use-jd-list-state";

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
  initialRowsPromise?: Promise<JdListInitialData>;
}

function JdListErrorFallback() {
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Error</Alert.Title>
        <Alert.Description>
          Could not load job descriptions. Please refresh.
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function JdDashboardBody() {
  return (
    <>
      <JdStats />
      <JdFilters />
      <JdTable />

      {/* Modals & Drawer */}
      <JdCreateModal />
      <JdEditModal />
      <JdDeleteModal />
      <JdDetailDrawer />
    </>
  );
}

export function JdManagementDashboard({
  canManageJds = true,
  chapters = [],
  allPipelineStages = [],
  initialRowsPromise,
}: JdManagementDashboardProps) {
  return (
    <div className="flex flex-col gap-6 font-sans">
      <JdHeader />

      <SuspenseErrorBoundary fallback={<JdListErrorFallback />}>
        <Suspense fallback={<JdListSkeleton />}>
          <JdDashboardProvider
            canManageJds={canManageJds}
            chapters={chapters}
            allPipelineStages={allPipelineStages}
            initialRowsPromise={initialRowsPromise}
          >
            <JdDashboardBody />
          </JdDashboardProvider>
        </Suspense>
      </SuspenseErrorBoundary>
    </div>
  );
}

export default JdManagementDashboard;
