"use client";

import { useCallback, useMemo } from "react";

import {
  AlertDialog,
  Avatar,
  Button,
  Card,
  Chip,
  Pagination,
  Spinner,
  Table,
  Tooltip,
} from "@heroui/react";

import { AddCandidateModal } from "@/components/admin/candidates/add-candidate-modal";
import { CandidatePipelineFiltersCard } from "@/components/admin/candidates/candidate-pipeline-filters-card";
import { CvVersionComparisonDrawer } from "@/components/admin/candidates/cv-version-comparison-drawer";
import { CANDIDATES_LIST_DEFAULT_LIMIT } from "@/lib/candidates/candidates-list-query";
import { useCandidatePipelineState } from "@/components/admin/candidates/use-candidate-pipeline-state";
import {
  candidateDisplayInitials,
  candidateStatusChipColor,
  jdMatchChipColor,
} from "@/lib/candidates/candidate-display";
import { candidateStatusUiLabel } from "@/lib/candidates/pipeline-phase";
import {
  type CandidateDbRow,
  candidateDbRowToTableRow,
} from "@/lib/candidates/db-row";

type Props = {
  initialRows?: CandidateDbRow[];
  initialListTotal?: number;
};

function pageWindow(current: number, total: number, width: number) {
  let start = Math.max(1, current - Math.floor(width / 2));
  const end = Math.min(total, start + width - 1);
  start = Math.max(1, end - width + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function formatUploadedAtDisplay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

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
      setAddModalOpen(false);
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
        onFiltersAdjusted={() => setPage(1)}
      />

      <Card>
        <Card.Content className="gap-0 p-0">
          <Table>
            <Table.ScrollContainer>
              <Table.Content
                aria-label="Candidate pipeline"
                className="min-w-[1400px]"
              >
                <Table.Header>
                  <Table.Column isRowHeader>Candidate &amp; Role</Table.Column>
                  <Table.Column className="text-center">Exp.</Table.Column>
                  <Table.Column>Key Skills</Table.Column>
                  <Table.Column>Education</Table.Column>
                  <Table.Column>Source</Table.Column>
                  <Table.Column>Applied JD</Table.Column>
                  <Table.Column className="text-center">JD match</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column className="whitespace-nowrap">
                    Uploaded at
                  </Table.Column>
                  <Table.Column className="text-right">Actions</Table.Column>
                </Table.Header>
                <Table.Body>
                  {dbLoadState === "loading" && tableSourceRows.length === 0 ? (
                    <Table.Row id="loading">
                      <Table.Cell>
                        <span className="text-sm text-muted">
                          Loading candidates…
                        </span>
                      </Table.Cell>
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                    </Table.Row>
                  ) : null}
                  {dbLoadState === "ok" &&
                    filteredRows.length === 0 &&
                    tableSourceRows.length === 0 ? (
                    <Table.Row id="empty">
                      <Table.Cell>
                        <span className="text-sm text-muted">
                          No candidates yet. Use Add Candidate to upload CVs.
                        </span>
                      </Table.Cell>
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                    </Table.Row>
                  ) : null}
                  {noResultsForUploadDate ? (
                    <Table.Row id="empty-upload-date">
                      <Table.Cell>
                        <span className="text-sm text-muted">
                          No results found for this date.
                        </span>
                      </Table.Cell>
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                      <Table.Cell />
                    </Table.Row>
                  ) : null}
                  {paginatedRows.map((row) => (
                    <Table.Row key={row.id} id={row.id}>
                      <Table.Cell>
                        <div className="flex items-center gap-4">
                          <Avatar className="size-10 shrink-0" size="md">
                            {row.avatarUrl ? (
                              <Avatar.Image alt="" src={row.avatarUrl} />
                            ) : null}
                            <Avatar.Fallback className="text-xs">
                              {candidateDisplayInitials(row.name)}
                            </Avatar.Fallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <p className="font-semibold text-foreground">
                                {row.name}
                              </p>
                              {row.hasCvFile ? (
                                <a
                                  href={`/api/admin/candidates/${row.id}/cv-download`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
                                >
                                  CV file
                                </a>
                              ) : null}
                            </div>
                            <p className="text-xs font-medium text-muted">
                              {row.role}
                            </p>
                          </div>
                        </div>
                      </Table.Cell>
                      <Table.Cell className="text-center align-middle">
                        <div className="flex flex-col items-center tabular-nums">
                          <span className="text-lg font-semibold leading-none text-foreground">
                            {row.experienceYears}
                          </span>
                          <span className="text-[10px] font-medium text-muted">
                            Years
                          </span>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex flex-wrap gap-1.5">
                          {row.skills.map((s) => (
                            <Chip
                              key={s}
                              size="sm"
                              variant="soft"
                              color="accent"
                              className="text-[10px] font-bold"
                            >
                              {s}
                            </Chip>
                          ))}
                          {row.moreSkills ? (
                            <Chip
                              size="sm"
                              variant="soft"
                              color="accent"
                              className="text-[10px] font-bold"
                            >
                              +{row.moreSkills}
                            </Chip>
                          ) : null}
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <p className="text-sm font-medium text-foreground">
                          {row.degree}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-tight text-muted">
                          {row.school}
                        </p>
                      </Table.Cell>
                      <Table.Cell>
                        <p className="max-w-[200px] text-sm text-foreground">
                          {row.sourceLabel}
                        </p>
                      </Table.Cell>
                      <Table.Cell>
                        <p className="max-w-[220px] truncate text-sm text-foreground" title={row.jdCampaignLabel}>
                          {row.jdCampaignLabel}
                        </p>
                      </Table.Cell>
                      <Table.Cell className="text-center align-middle">
                        <Chip
                          size="sm"
                          variant="soft"
                          color={jdMatchChipColor(row)}
                          className="min-w-[3.25rem] justify-center text-xs font-bold tabular-nums"
                        >
                          {row.jdMatchLabel}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={candidateStatusChipColor(row.status)}
                          className="text-[10px] font-bold uppercase"
                        >
                          {candidateStatusUiLabel(row.status)}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap text-sm text-foreground">
                        {formatUploadedAtDisplay(row.cvUploadedAtIso)}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip delay={0}>
                            <Button
                              isIconOnly
                              variant="ghost"
                              size="sm"
                              className="text-accent"
                              aria-label="View details"
                              onPress={() => openRow(row)}
                            >
                              <EyeIcon className="size-5" />
                            </Button>
                            <Tooltip.Content placement="top" showArrow>
                              <Tooltip.Arrow />
                              <p>View details</p>
                            </Tooltip.Content>
                          </Tooltip>
                          <Tooltip delay={0}>
                            <Button
                              isIconOnly
                              variant="ghost"
                              size="sm"
                              className="text-rose-600 dark:text-rose-400"
                              aria-label="Delete CV"
                              onPress={() => {
                                setDeleteError(null);
                                setRowPendingDelete(row);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <TrashIcon className="size-5" />
                            </Button>
                            <Tooltip.Content placement="top" showArrow>
                              <Tooltip.Arrow />
                              <p>Delete CV</p>
                            </Tooltip.Content>
                          </Tooltip>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
            <Table.Footer className="border-t border-divider px-4 py-3">
              <Pagination size="sm">
                <Pagination.Summary>
                  Showing {startIdx} to {endIdx}{" "}
                  of {listTotal} candidates
                </Pagination.Summary>
                <Pagination.Content>
                  <Pagination.Item>
                    <Pagination.Previous
                      isDisabled={safePage <= 1}
                      onPress={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <Pagination.PreviousIcon />
                    </Pagination.Previous>
                  </Pagination.Item>
                  {pageWindow(safePage, totalPages, 3).map((p) => (
                    <Pagination.Item key={p}>
                      <Pagination.Link
                        isActive={p === safePage}
                        onPress={() => setPage(p)}
                      >
                        {p}
                      </Pagination.Link>
                    </Pagination.Item>
                  ))}
                  <Pagination.Item>
                    <Pagination.Next
                      isDisabled={safePage >= totalPages}
                      onPress={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                    >
                      <Pagination.NextIcon />
                    </Pagination.Next>
                  </Pagination.Item>
                </Pagination.Content>
              </Pagination>
            </Table.Footer>
          </Table>
        </Card.Content>
      </Card>

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
