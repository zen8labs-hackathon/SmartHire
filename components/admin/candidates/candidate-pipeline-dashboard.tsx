"use client";

import { useCallback } from "react";

import { AlertDialog, Button, Spinner } from "@heroui/react";

import { AddCandidateModal } from "@/components/admin/candidates/add-candidate-modal";
import { CandidatePipelineFiltersCard } from "@/components/admin/candidates/candidate-pipeline-filters-card";
import { CandidatePipelineTable } from "@/components/admin/candidates/candidate-pipeline-table";
import { CvVersionComparisonDrawer } from "@/components/admin/candidates/cv-version-comparison-drawer";
import { CANDIDATES_LIST_DEFAULT_LIMIT } from "@/lib/candidates/candidates-list-query";
import { useCandidatePipelineState } from "@/components/admin/candidates/use-candidate-pipeline-state";
import {
  type CandidateDbRow,
  candidateDbRowToTableRow,
} from "@/lib/candidates/db-row";
import type { CandidateRow } from "@/lib/candidates/types";

type Props = {
  initialRows?: CandidateDbRow[];
  initialListTotal?: number;
};

export function CandidatePipelineDashboard({ initialRows, initialListTotal }: Props) {
  const {
    page,
    setPage,
    query,
    setQuery,
    statusKey,
    setStatusKey,
    jdFilterKey,
    setJdFilterKey,
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
    statusUpdateBusy,
    statusUpdateError,
    cvHistoryRows,
    cvVersions,
    cvHistoryLoading,
    cvHistoryError,
    refreshCvHistoryForCandidate,
    dbLoadState,
    fetchCandidates,
    statusFilterOptions,
    jdFilterOptions,
    filteredRows,
    listTotal,
    listPageSize,
    tableSourceRows,
    activeDbRow,
    noResultsForUploadDate,
    openRow,
    drawerStatusOptions,
    patchCandidateStatus,
    confirmDeleteCandidate,
  } = useCandidatePipelineState(initialRows, {
    listMode: "page",
    initialListTotal,
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

  const totalPages = Math.max(
    1,
    Math.ceil(listTotal / (listPageSize || CANDIDATES_LIST_DEFAULT_LIMIT)),
  );
  const safePage = Math.min(page, totalPages);
  const pageSize = listPageSize || CANDIDATES_LIST_DEFAULT_LIMIT;
  const paginatedRows = filteredRows;
  const startIdx = filteredRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = filteredRows.length === 0 ? 0 : startIdx - 1 + filteredRows.length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Smart Hire Suite
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Active Talent Pool
          </h1>
        </div>
        <Button
          variant="primary"
          className="bg-gradient-to-br from-[#002542] to-[#1b3b5a] shadow-sm"
          onPress={() => setAddModalOpen(true)}
        >
          <span className="text-lg leading-none">+</span>
          Add Candidate
        </Button>
      </div>

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

      <CandidatePipelineFiltersCard
        query={query}
        setQuery={setQuery}
        statusKey={statusKey}
        setStatusKey={setStatusKey}
        statusFilterOptions={statusFilterOptions}
        jdFilterKey={jdFilterKey}
        setJdFilterKey={setJdFilterKey}
        jdFilterOptions={jdFilterOptions}
        uploadDateRangeFilter={uploadDateRangeFilter}
        setUploadDateRangeFilter={setUploadDateRangeFilter}
        calendarFocusedDate={calendarFocusedDate}
        setCalendarFocusedDate={setCalendarFocusedDate}
        onFiltersAdjusted={handleFiltersAdjusted}
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
          drawerStatusOptions={drawerStatusOptions}
          statusUpdateBusy={statusUpdateBusy}
          statusUpdateError={statusUpdateError}
          dbLoadState={dbLoadState}
          onStatusChange={(next) => {
            if (!activeRow) return;
            void patchCandidateStatus(activeRow.id, next);
          }}
          onProfileSaved={(c) => {
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
              <Button slot="close" variant="tertiary" isDisabled={deleteInProgress}>
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
    </div>
  );
}
