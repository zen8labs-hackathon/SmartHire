import {
  Suspense,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Alert } from "@heroui/react";

import { SuspenseErrorBoundary } from "@/components/admin/suspense-error-boundary";
import { JdListSkeleton } from "@/components/admin/jd/jd-list-skeleton";
import type { JobDescription } from "@/lib/jd/types";

import { JdDashboardProvider, useJdDashboard } from "./context";
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
  initialRowsPromise?: Promise<JobDescription[]>;
}

/** What the static `JdHeader` (outside Suspense) can trigger once the
 * Suspense-gated dashboard body (inside `JdDashboardProvider`) has mounted. */
type JdDashboardBridge = {
  openCreateModal: () => void;
};

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

/**
 * Renders the filters/stats/table region plus modals and drawer. Mounted
 * inside `JdDashboardProvider`, which suspends on `use(initialRowsPromise)`
 * via `useJdListState`, so this whole subtree (including the create/edit/
 * delete modals and detail drawer) is gated behind the `<Suspense>` boundary
 * in `JdManagementDashboard` below. `openCreateModal` is exposed via
 * `useImperativeHandle` so the static header's "New definition" button can
 * still open the create modal once this has mounted.
 */
const JdDashboardBody = forwardRef<JdDashboardBridge, object>(
  function JdDashboardBody(_props, ref) {
    const { jdModal } = useJdDashboard();

    useImperativeHandle(
      ref,
      () => ({
        openCreateModal: () => jdModal.open(),
      }),
      [jdModal],
    );

    return (
      <>
        <JdFilters />
        <JdStats />
        <JdTable />

        {/* Modals & Drawer */}
        <JdCreateModal />
        <JdEditModal />
        <JdDeleteModal />
        <JdDetailDrawer />
      </>
    );
  },
);

export function JdManagementDashboard({
  canManageJds = true,
  chapters = [],
  allPipelineStages = [],
  initialRowsPromise,
}: JdManagementDashboardProps) {
  const bridgeRef = useRef<JdDashboardBridge | null>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const setBridgeRef = useCallback((handle: JdDashboardBridge | null) => {
    bridgeRef.current = handle;
    setBridgeReady(handle !== null);
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <JdHeader
        canManageJds={canManageJds}
        disabled={!bridgeReady}
        onNewDefinition={() => bridgeRef.current?.openCreateModal()}
      />

      <SuspenseErrorBoundary fallback={<JdListErrorFallback />}>
        <Suspense fallback={<JdListSkeleton />}>
          <JdDashboardProvider
            canManageJds={canManageJds}
            chapters={chapters}
            allPipelineStages={allPipelineStages}
            initialRowsPromise={initialRowsPromise}
          >
            <JdDashboardBody ref={setBridgeRef} />
          </JdDashboardProvider>
        </Suspense>
      </SuspenseErrorBoundary>
    </div>
  );
}
export default JdManagementDashboard;
