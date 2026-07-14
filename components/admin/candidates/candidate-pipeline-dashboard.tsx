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
import {
  Users as UsersIcon,
  Layers as LayersIcon,
  Clock as ClockIcon,
  CheckCircle2 as CheckIcon,
} from "lucide-react";
import {
  type CandidateDbRow,
  candidateDbRowToTableRow,
  campaignAppliedToCandidateDbRow,
} from "@/lib/candidates/db-row";
import type { CandidateRow } from "@/lib/candidates/types";

export type CandidatePipelineDashboardHandle = {
  /** Opens the "Add Candidate" modal, callable from a header button that
   * lives outside the Suspense boundary this component is wrapped in. */
  openAddModal: () => void;
};

type Props = {
  candidatesPromise: Promise<{ rows: CandidateDbRow[]; total: number }>;
};

export const CandidatePipelineDashboard = forwardRef<
  CandidatePipelineDashboardHandle,
  Props
>(function CandidatePipelineDashboard({ candidatesPromise }, ref) {
  const { rows: initialRows, total: initialListTotal } = use(candidatesPromise);
  const {
    page,
    setPage,
    query,
    setQuery,
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
    stageUpdateBusy,
    stageUpdateError,
    cvHistoryRows,
    cvVersions,
    cvHistoryLoading,
    cvHistoryError,
    refreshCvHistoryForCandidate,
    dbLoadState,
    fetchCandidates,
    filteredRows,
    listTotal,
    listPageSize,
    changeListPageSize,
    tableSourceRows,
    activeDbRow,
    noResultsForUploadDate,
    openRow,
    resolvedActivePipeline,
    drawerStageOptions,
    patchCandidateStage,
    confirmDeleteCandidate,
  } = useCandidatePipelineState(initialRows, {
    listMode: "page",
    initialListTotal,
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
        setDbRows((prev) => {
          const withoutStaging = stagedNewId
            ? prev.filter((r) => r.id !== stagedNewId)
            : prev;
          const i = withoutStaging.findIndex((r) => r.id === updated.id);
          if (i >= 0) {
            const copy = [...withoutStaging];
            copy[i] = updated;
            return copy;
          }
          return [updated, ...withoutStaging];
        });
        openRow(candidateDbRowToTableRow(updated));
        void refreshCvHistoryForCandidate(existingId);
      }
      await fetchCandidates();
    },
    [fetchCandidates, openRow, refreshCvHistoryForCandidate, setDbRows],
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
      value: tableSourceRows.length,
      icon: <UsersIcon className="h-4.5 w-4.5" />,
      description: "Total uploaded CVs",
    },
    {
      label: "Experienced staff",
      value: tableSourceRows.filter((r) => (r.experienceYears ?? 0) >= 5)
        .length,
      icon: <LayersIcon className="h-4.5 w-4.5" />,
      description: "5+ years of experience",
    },
    {
      label: "Screened CVs",
      value: tableSourceRows.filter((r) => r.status.toUpperCase() !== "NEW")
        .length,
      icon: <ClockIcon className="h-4.5 w-4.5 text-accent" />,
      description: "In review or further stages",
    },
    {
      label: "Offers Extended",
      value: tableSourceRows.filter((r) => r.status.toUpperCase() === "OFFER")
        .length,
      icon: <CheckIcon className="h-4.5 w-4.5 text-success" />,
      description: "Hiring final stages",
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
        onOpenChange={setAddModalOpen}
        onCandidatesChanged={fetchCandidates}
        onDuplicateMergedToExisting={handleDuplicateMergedToExisting}
      />

      <DataTableStats stats={candidateStats} />

      <CandidatePipelineFiltersCard
        query={query}
        setQuery={setQuery}
        searchPlaceholder="Search by name, position, or skill…"
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
          resolvedStage={resolvedActivePipeline}
          stageOptions={drawerStageOptions}
          stageUpdateBusy={stageUpdateBusy}
          stageUpdateError={stageUpdateError}
          dbLoadState={dbLoadState}
          onStageChange={(target) => {
            if (!activeRow) return;
            void patchCandidateStage(activeRow.id, target);
          }}
          onProfileSaved={(rawC) => {
            const c = "candidate_id" in rawC
              ? campaignAppliedToCandidateDbRow(rawC as any)
              : (rawC as CandidateDbRow);
            setDbRows((prev) => prev.map((r) => (r.id === c.id ? c : r)));
            setActiveRow((prev) =>
              prev?.id === c.id ? candidateDbRowToTableRow(c) : prev,
            );
            void refreshCvHistoryForCandidate(c.id);
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
                This will permanently remove{" "}
                <strong className="text-foreground">
                  {rowPendingDelete?.name ?? "this candidate"}
                </strong>{" "}
                and the stored CV file. This cannot be undone.
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
