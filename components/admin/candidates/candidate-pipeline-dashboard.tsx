"use client";

import { forwardRef, use, useCallback, useImperativeHandle } from "react";

import { AlertDialog, Button, Spinner } from "@heroui/react";

import { AddCandidateModal } from "@/components/admin/candidates/add-candidate-modal";
import { CandidatePipelineFiltersCard } from "@/components/admin/candidates/candidate-pipeline-filters-card";
import { CandidatePipelineTable } from "@/components/admin/candidates/candidate-pipeline-table";
import { CvVersionComparisonDrawer } from "@/components/admin/candidates/cv-version-comparison-drawer";
import { CANDIDATES_LIST_DEFAULT_LIMIT } from "@/lib/candidates/candidates-list-query";
import { useCandidatePipelineState } from "@/components/admin/candidates/use-candidate-pipeline-state";
import { DataTableStats } from "@/components/admin/shell/table-system";
import { useToast } from "@/components/admin/toast-provider";
import {
  Users as UsersIcon,
  Layers as LayersIcon,
} from "lucide-react";
import {
  type CandidateDbRow,
  candidateDbRowToTableRow,
  campaignAppliedToCandidateDbRow,
} from "@/lib/candidates/db-row";
import type { CandidateRow } from "@/lib/candidates/types";

const PARSING_STATUS_FILTER_OPTIONS = [
  { id: "all", label: "All parsing" },
  { id: "failed", label: "Failed" },
  { id: "processing", label: "Processing" },
  { id: "pending", label: "Pending" },
  { id: "completed", label: "Completed" },
];

export type CandidatePipelineDashboardHandle = {
  /** Opens the "Add Candidate" modal, callable from a header button that
   * lives outside the Suspense boundary this component is wrapped in. */
  openAddModal: () => void;
};

type Props = {
  candidatesPromise: Promise<{
    rows: CandidateDbRow[];
    total: number;
    experiencedTotal: number;
  }>;
};

export const CandidatePipelineDashboard = forwardRef<
  CandidatePipelineDashboardHandle,
  Props
>(function CandidatePipelineDashboard({ candidatesPromise }, ref) {
  const {
    rows: initialRows,
    total: initialListTotal,
    experiencedTotal: initialExperiencedTotal,
  } = use(candidatesPromise);
  const toast = useToast();
  const {
    page,
    setPage,
    query,
    setQuery,
    parsingStatusKey,
    setParsingStatusKey,
    uploadDateRangeFilter,
    setUploadDateRangeFilter,
    calendarFocusedDate,
    setCalendarFocusedDate,
    drawerOpen,
    setDrawerOpen,
    activeRow,
    setActiveRow,
    setDbRows,
    addModalOpen,
    setAddModalOpen,
    deleteDialogOpen,
    setDeleteDialogOpen,
    rowPendingDelete,
    setRowPendingDelete,
    deleteInProgress,
    deleteError,
    setDeleteError,
    cvHistoryRows,
    cvVersions,
    cvHistoryLoading,
    cvHistoryError,
    refreshCvHistoryForCandidate,
    dbLoadState,
    fetchCandidates,
    filteredRows,
    listTotal,
    listExperiencedTotal,
    listPageSize,
    changeListPageSize,
    tableSourceRows,
    activeDbRow,
    noResultsForUploadDate,
    openRow,
    confirmDeleteCandidate,
  } = useCandidatePipelineState(initialRows, {
    listMode: "page",
    initialListTotal,
    initialExperiencedTotal,
    deduped: true,
  });

  const refreshCvDetailAfterMutation = useCallback(async () => {
    await fetchCandidates();
    if (activeRow) {
      await refreshCvHistoryForCandidate(activeRow.id);
    }
  }, [activeRow, fetchCandidates, refreshCvHistoryForCandidate]);

  const handleDuplicateMergedToExisting = useCallback(
    async (
      existingId: string,
      updated?: CandidateDbRow,
      stagedNewId?: string,
    ) => {
      if (updated) {
        // `PUT update-with-history` actually responds with a
        // `CampaignAppliedAdminRow` (has `candidate_id`/`stage_label`, no
        // `status`), not a `CandidateDbRow` despite the prop's declared type
        // -- same shape ambiguity `onProfileSaved` below already guards
        // against. Passing the raw row straight into `candidateDbRowToTableRow`
        // reads `.status` as undefined and throws, taking down this whole
        // dashboard until reload.
        const c = "candidate_id" in updated
          ? campaignAppliedToCandidateDbRow(updated as any)
          : updated;
        setDbRows((prev) => {
          const withoutStaging = stagedNewId
            ? prev.filter((r) => r.id !== stagedNewId)
            : prev;
          const i = withoutStaging.findIndex((r) => r.id === c.id);
          if (i >= 0) {
            const copy = [...withoutStaging];
            copy[i] = c;
            return copy;
          }
          return [c, ...withoutStaging];
        });
        void refreshCvHistoryForCandidate(existingId);
      }
      await fetchCandidates();
    },
    [fetchCandidates, refreshCvHistoryForCandidate, setDbRows],
  );

  const requestDeleteRow = useCallback(
    (row: CandidateRow) => {
      setDeleteError(null);
      setRowPendingDelete(row);
      setDeleteDialogOpen(true);
    },
    [setDeleteError, setRowPendingDelete, setDeleteDialogOpen],
  );

  const handleFiltersAdjusted = useCallback(() => setPage(1), [setPage]);

  useImperativeHandle(
    ref,
    () => ({
      openAddModal: () => setAddModalOpen(true),
    }),
    [setAddModalOpen],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(listTotal / (listPageSize || CANDIDATES_LIST_DEFAULT_LIMIT)),
  );
  const safePage = Math.min(page, totalPages);
  const pageSize = listPageSize || CANDIDATES_LIST_DEFAULT_LIMIT;
  const paginatedRows = filteredRows;
  const startIdx =
    filteredRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx =
    filteredRows.length === 0 ? 0 : startIdx - 1 + filteredRows.length;

  const candidateStats = [
    {
      label: "Candidates",
      value: listTotal,
      icon: <UsersIcon className="h-4.5 w-4.5" />,
      description: "Total uploaded CVs",
    },
    {
      label: "Experienced staff",
      value: listExperiencedTotal,
      icon: <LayersIcon className="h-4.5 w-4.5" />,
      description: "5+ years of experience",
    },
  ];

  return (
    <>
      {dbLoadState === "error" ? (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
          Could not load candidates from the database. Showing sample data until
          the connection works.
        </p>
      ) : null}

      {deleteError ? (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
          {deleteError}
        </p>
      ) : null}

      <AddCandidateModal
        open={addModalOpen}
        onOpenChange={(open) => {
          setAddModalOpen(open);
          // Uploads still "processing" when the modal is closed stop being
          // polled (AddCandidateModal's status poll only runs while open),
          // so without this the list can go stale until a manual page
          // refresh -- always resync on close, not just on the in-modal
          // completion callbacks below.
          if (!open) void fetchCandidates();
        }}
        onCandidatesChanged={fetchCandidates}
        onDuplicateMergedToExisting={handleDuplicateMergedToExisting}
      />

      <DataTableStats stats={candidateStats} />

      <CandidatePipelineFiltersCard
        query={query}
        setQuery={setQuery}
        searchPlaceholder="Search by name, position, or skill…"
        statusKey={parsingStatusKey}
        setStatusKey={setParsingStatusKey}
        statusFilterOptions={PARSING_STATUS_FILTER_OPTIONS}
        uploadDateRangeFilter={uploadDateRangeFilter}
        setUploadDateRangeFilter={setUploadDateRangeFilter}
        calendarFocusedDate={calendarFocusedDate}
        setCalendarFocusedDate={setCalendarFocusedDate}
        onFiltersAdjusted={handleFiltersAdjusted}
        onRefresh={fetchCandidates}
        isRefreshing={dbLoadState === "loading"}
        createButtonLabel="Add Candidate"
        onCreate={() => setAddModalOpen(true)}
      />

      <CandidatePipelineTable
        dbLoadState={dbLoadState}
        tableSourceRows={tableSourceRows}
        rows={paginatedRows}
        noResultsForUploadDate={noResultsForUploadDate}
        onOpenRow={openRow}
        onDeleteRequest={requestDeleteRow}
        page={safePage}
        totalPages={totalPages}
        setPage={setPage}
        startIdx={startIdx}
        endIdx={endIdx}
        listTotal={listTotal}
        pageSize={listPageSize}
        setPageSize={changeListPageSize}
      />

      {activeRow ? (
        <CvVersionComparisonDrawer
          key={activeRow.id}
          isOpen={drawerOpen}
          onOpenChange={setDrawerOpen}
          tableRow={activeRow}
          dbRow={activeDbRow}
          cvHistoryRows={cvHistoryRows}
          cvVersions={cvVersions}
          cvHistoryLoading={cvHistoryLoading}
          cvHistoryError={cvHistoryError}
          onProfileSaved={(rawC) => {
            const c = "candidate_id" in rawC
              ? campaignAppliedToCandidateDbRow(rawC as any)
              : (rawC as CandidateDbRow);
            setDbRows((prev) => prev.map((r) => (r.id === c.id ? c : r)));
            setActiveRow((prev) =>
              prev?.id === c.id ? candidateDbRowToTableRow(c) : prev,
            );
            void refreshCvHistoryForCandidate(c.id);
            toast.success("Candidate profile updated.");
          }}
          onAfterCvDetailMutation={refreshCvDetailAfterMutation}
        />
      ) : null}

      <AlertDialog.Backdrop
        isOpen={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setRowPendingDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Delete CV candidate?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-sm text-muted">
                This will remove{" "}
                <strong className="text-foreground">
                  {rowPendingDelete?.name ?? "this candidate"}
                </strong>{" "}
                and all of their applications, across every job. Their
                records and CV files are kept internally but won&apos;t
                appear in search, reporting, or any job&apos;s pipeline
                anymore.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                slot="close"
                variant="tertiary"
                isDisabled={deleteInProgress}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                isPending={deleteInProgress}
                onPress={() => void confirmDeleteCandidate()}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <Spinner color="current" size="sm" className="mr-1.5" />
                    ) : null}
                    Delete
                  </>
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  );
});
