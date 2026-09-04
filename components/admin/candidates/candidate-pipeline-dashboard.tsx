"use client";

import { use, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AlertDialog, Button, Spinner, Tabs } from "@heroui/react";
import type { CalendarDate } from "@internationalized/date";
import type { RangeValue } from "react-aria-components";

import { CandidatePipelineFiltersCard } from "@/components/admin/candidates/candidate-pipeline-filters-card";
import { CandidatePipelineTable } from "@/components/admin/candidates/candidate-pipeline-table";
import { CvVersionComparisonDrawer } from "@/components/admin/candidates/cv-version-comparison-drawer";
import { UploadCvModal } from "@/components/admin/jd/upload-cv-modal";
import { UploadHistoryPanel } from "@/components/admin/jd/upload-history-panel";
import { DataTableStats } from "@/components/admin/shell/table-system";
import { useToast } from "@/components/admin/toast-provider";
import {
  CANDIDATES_LIST_DEFAULT_LIMIT,
  CandidatesListQuery,
} from "@/lib/candidates/candidates-list-query";
import {
  candidateService,
  GroupedCandidateRow,
} from "@/lib/service/candidate.service";
import { Layers as LayersIcon, Users as UsersIcon } from "lucide-react";

const PARSING_STATUS_FILTER_OPTIONS = [
  { id: "all", label: "All parsing" },
  { id: "failed", label: "Failed" },
  { id: "processing", label: "Processing" },
  { id: "pending", label: "Pending" },
  { id: "completed", label: "Completed" },
];

type Props = {
  candidatesPromise: Promise<{
    rows: GroupedCandidateRow[];
    total: number;
  }>;
};

export function CandidatePipelineDashboard({ candidatesPromise }: Props) {
  const { rows: initialRows, total: initialListTotal } = use(candidatesPromise);
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<"candidates" | "uploads">(
    searchParams.get("tab") === "uploads" ? "uploads" : "candidates",
  );
  useEffect(() => {
    if (searchParams.get("tab") === "uploads") setActiveTab("uploads");
  }, [searchParams]);

  // Keep `?tab=` in sync so the tab survives a refresh/shared link -- the
  // "candidates" tab is the default, so it's left out of the URL entirely.
  const selectTab = useCallback(
    (next: "candidates" | "uploads") => {
      setActiveTab(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "uploads") params.set("tab", "uploads");
      else params.delete("tab");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const [dbLoadState, setDbLoadState] = useState<"loading" | "ok" | "error">(
    "ok",
  );
  const [activeRow, setActiveRow] = useState<GroupedCandidateRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [dbRows, setDbRows] = useState<GroupedCandidateRow[]>(initialRows);
  const [uploadDateRangeFilter, setUploadDateRangeFilter] =
    useState<RangeValue<CalendarDate> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [listPageSize, setListPageSize] = useState<number>(
    CANDIDATES_LIST_DEFAULT_LIMIT,
  );
  const [listTotal, setListTotal] = useState<number>(initialListTotal);
  const [listPagination, setListPagination] = useState<{
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  }>({
    limit: CANDIDATES_LIST_DEFAULT_LIMIT,
    offset: 0,
    total: initialListTotal,
    hasMore: initialRows.length < initialListTotal,
  });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [rowPendingDelete, setRowPendingDelete] =
    useState<GroupedCandidateRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState<boolean>(false);

  const [addModalOpen, setAddModalOpen] = useState<boolean>(false);

  const buildListQuery = useCallback((): CandidatesListQuery => {
    const uploadFrom = uploadDateRangeFilter?.start.toString() ?? undefined;
    const uploadTo = uploadDateRangeFilter?.end.toString() ?? undefined;
    const q = debouncedQuery.trim() || undefined;

    return {
      limit: listPageSize,
      offset: (page - 1) * listPageSize,
      uploadFrom,
      uploadTo,
      q,
    };
  }, [debouncedQuery, page, uploadDateRangeFilter, listPageSize]);

  const fetchCandidates = useCallback(async () => {
    setDbLoadState((s) => (s === "ok" ? "ok" : "loading"));
    try {
      const listQuery = buildListQuery();
      const queryParams: Record<string, string> = {
        limit: String(listQuery.limit ?? CANDIDATES_LIST_DEFAULT_LIMIT),
        offset: String(listQuery.offset ?? 0),
      };
      if (listQuery.q) queryParams.q = listQuery.q;

      const { candidates, pagination } =
        await candidateService.getGroupedCandidatesList(queryParams);

      setDbRows(candidates);
      setListTotal(pagination?.total ?? candidates.length);
      if (pagination) {
        setListPagination({
          limit: pagination.limit,
          offset: pagination.offset,
          total: pagination.total,
          hasMore: pagination.hasMore,
        });
      }
      setDbLoadState("ok");
    } catch {
      setDbLoadState("error");
    }
  }, [buildListQuery]);

  const requestDeleteRow = useCallback(
    (row: GroupedCandidateRow) => {
      setDeleteError(null);
      setRowPendingDelete(row);
      setDeleteDialogOpen(true);
    },
    [setDeleteError, setRowPendingDelete, setDeleteDialogOpen],
  );

  const confirmDeleteCandidate = useCallback(async () => {
    if (!rowPendingDelete) return;
    const targetId = rowPendingDelete.id;
    setDeleteInProgress(true);
    setDeleteError(null);
    try {
      // Person-scope soft delete: drops this `candidates` row and every one
      // of its applications, across all jobs (see the dialog copy).
      await candidateService.deleteCandidates([targetId]);

      setDbRows((prev) => prev.filter((r) => r.id !== targetId));
      if (activeRow?.id === targetId) {
        setDrawerOpen(false);
        setActiveRow(null);
      }
      setDeleteDialogOpen(false);
      setRowPendingDelete(null);
      toast.success("Candidate deleted.");
      // Resync totals / pagination now that a row is gone.
      void fetchCandidates();
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Could not delete this candidate.";
      setDeleteError(msg);
      toast.error(msg);
    } finally {
      setDeleteInProgress(false);
    }
  }, [rowPendingDelete, activeRow?.id, toast, fetchCandidates]);

  useEffect(() => {
    if (activeTab === "candidates") {
      void fetchCandidates();
    }
  }, [activeTab]);

  const handleFiltersAdjusted = useCallback(() => setPage(1), [setPage]);

  const pageSize = listPagination.limit || CANDIDATES_LIST_DEFAULT_LIMIT;
  const totalPages = Math.max(1, Math.ceil(listPagination.total / pageSize));
  const safePage = Math.min(
    Math.max(1, Math.floor(listPagination.offset / pageSize) + 1),
    totalPages,
  );
  const paginatedRows = dbRows;
  const startIdx = dbRows.length === 0 ? 0 : listPagination.offset + 1;
  const endIdx =
    dbRows.length === 0 ? 0 : listPagination.offset + dbRows.length;
  const changeListPageSize = useCallback(
    (size: number) => {
      setListPageSize(size);
      setPage(1);
    },
    [setPage],
  );

  const openCandidateDrawer = useCallback((row: GroupedCandidateRow) => {
    setActiveRow(row);
    setDrawerOpen(true);
  }, []);

  const candidateStats = [
    {
      label: "Candidates",
      value: listTotal,
      icon: <UsersIcon className="h-4.5 w-4.5" />,
      description: "Total uploaded CVs",
    },
    {
      label: "Experienced staff",
      value: 9999,
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

      {/* CVs upload asynchronously through the file-upload worker; this modal
          doesn't poll, so resync the list on close (and on each batch's
          completion) so it doesn't go stale until a manual refresh. */}
      <UploadCvModal
        open={addModalOpen}
        onOpenChange={(open) => {
          setAddModalOpen(open);
          if (!open) void fetchCandidates();
        }}
        jobId={null}
        onUploaded={() => void fetchCandidates()}
      />

      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => selectTab(key as "candidates" | "uploads")}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Candidate sections">
            <Tabs.Tab id="candidates">
              <Tabs.Indicator />
              Candidates
            </Tabs.Tab>
            <Tabs.Tab id="uploads">
              <Tabs.Indicator />
              Uploaded files
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        {/* Candidates panel stays mounted (shouldForceMount) so switching
            tabs doesn't discard its live refetch state. Uploads panel is
            left lazy -- each visit fetches fresh rows and (re)starts polling. */}
        <Tabs.Panel
          id="candidates"
          shouldForceMount
          // min-w-0: this panel is a flex item; without it the pipeline
          // table's min-width (~1100px) can push the panel past its column
          // on narrow viewports instead of scrolling inside its own container.
          className={`min-w-0 ${activeTab === "candidates" ? "" : "hidden"}`}
        >
          <div className="flex min-w-0 flex-col gap-4">
            <DataTableStats stats={candidateStats} />

            <CandidatePipelineFiltersCard
              query={query}
              setQuery={setQuery}
              searchPlaceholder="Search by name, position, or skill…"
              uploadDateRangeFilter={uploadDateRangeFilter}
              setUploadDateRangeFilter={setUploadDateRangeFilter}
              onFiltersAdjusted={handleFiltersAdjusted}
              onRefresh={fetchCandidates}
              isRefreshing={dbLoadState === "loading"}
              createButtonLabel="Upload CVs"
              onCreate={() => setAddModalOpen(true)}
            />

            <CandidatePipelineTable
              dbLoadState={dbLoadState}
              noCandidatesAdded={
                uploadDateRangeFilter == null &&
                query.trim() === "" &&
                dbRows.length === 0
              }
              rows={paginatedRows}
              onOpenDrawer={openCandidateDrawer}
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
          </div>
        </Tabs.Panel>

        <Tabs.Panel id="uploads" className="min-w-0">
          <UploadHistoryPanel jobId={null} />
        </Tabs.Panel>
      </Tabs>

      {activeRow ? (
        <CvVersionComparisonDrawer
          key={activeRow.id}
          isOpen={drawerOpen}
          onOpenChange={setDrawerOpen}
          tableRow={activeRow}
        />
      ) : null}

      <AlertDialog.Backdrop
        isOpen={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deleteInProgress) return;
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
                and all of their applications, across every job. Their records
                and CV files are kept internally but won&apos;t appear in
                search, reporting, or any job&apos;s pipeline anymore.
              </p>
              {deleteError ? (
                <p
                  className="mt-2 text-sm font-semibold text-rose-500"
                  role="alert"
                >
                  {deleteError}
                </p>
              ) : null}
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
}
