"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Users as UsersIcon,
  Layers as LayersIcon,
  Calendar as CalendarIcon,
  Download,
} from "lucide-react";
import {
  DataTableStats,
  DataTableToolbar,
  DataTablePagination,
} from "@/components/admin/shell/table-system";
import { usePageQueryParam } from "@/components/admin/shell/use-page-query-param";
import { useDebouncedValue } from "@/components/admin/shell/use-debounced-value";
import {
  Button,
  DateField,
  DateRangePicker,
  ListBox,
  RangeCalendar,
  Select,
  Table,
  useOverlayState,
} from "@heroui/react";
import {
  today,
  getLocalTimeZone,
  type CalendarDate,
} from "@internationalized/date";
import { Dialog } from "react-aria-components";
import type { RangeValue } from "react-aria-components";

import { useToast } from "@/components/admin/toast-provider";
import { PipelineStageSubStageInlineLabel } from "@/components/admin/jd/pipeline-stage-substage-inline-label";
import { PipelineTableRow } from "@/components/admin/jd/pipeline-table-row";
import {
  InterviewScheduleModal,
  DeleteCandidateModal,
  EditCandidateModal,
  RationaleModal,
} from "@/components/admin/jd/jd-pipeline-modals";
import {
  campaignAppliedAdminRowToTableRow,
  type JdPipelineApplicationRow,
} from "@/lib/candidates/campaign-applied-table-row";
import { isEligibleForBulkMoveToInterview } from "@/lib/candidates/pipeline-phase";
import {
  type StageMapping,
  type SubStage,
} from "@/lib/pipelines/transition-validator";
import {
  buildPipelineStageSubStageFilterOptions,
  type PipelineStageSubStageFilterOption,
} from "@/lib/pipelines/jd-pipeline-filter-options";
import {
  findFailSubStage,
  resolveRowPipeline,
} from "@/lib/pipelines/jd-pipeline-row-helpers";
import {
  buildCandidatesListSearchParams,
  type CandidatesListSortColumn,
} from "@/lib/candidates/candidates-list-query";

const MONTH_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
];
const YEAR_OPTIONS = Array.from(
  { length: 2030 - 1990 + 1 },
  (_, i) => 1990 + i,
);

/** Shape of `/api/admin/job-descriptions/[id]/candidate-status-counts`'s `counts` entries. */
type StageCount = {
  stage_code: string;
  stage_label: string;
  sub_stage_code: string;
  sub_stage_label: string;
  count: number;
};

type Props = {
  jobId: string;
  dbRows: JdPipelineApplicationRow[];
  loadState: "idle" | "loading" | "error" | "ok";
  onRefetch: (silent?: boolean) => void;
  /** HR may change pipeline status and schedule; chapter recruiters are view-only here. */
  canEditPipeline?: boolean;
  stageMappings: StageMapping[];
  subStages: SubStage[];
  canAddCandidates?: boolean;
  onAddCandidates?: () => void;
};

export function JdAppliedCandidatesPipeline({
  jobId,
  dbRows,
  loadState,
  onRefetch,
  canEditPipeline = true,
  stageMappings,
  subStages,
  canAddCandidates = false,
  onAddCandidates,
}: Props) {
  const resolveRow = useCallback(
    (r: JdPipelineApplicationRow) =>
      resolveRowPipeline(r, stageMappings, subStages),
    [stageMappings, subStages],
  );

  /** One status-filter option per (stageMapping, subStage) pair configured for this job. */
  const filterOptions = useMemo(
    () => buildPipelineStageSubStageFilterOptions(stageMappings, subStages),
    [stageMappings, subStages],
  );

  /** Ordered by `sequence_number`; drives both filter options and the per-stage stat cards. */
  const orderedStageMappings = useMemo(
    () =>
      [...stageMappings].sort((a, b) => a.sequence_number - b.sequence_number),
    [stageMappings],
  );

  /** The "offer" stage's default ("currently offered") sub-stage — id used by "Move to offer". */
  const offerDefaultSubStage = useMemo(() => {
    const offerStage = stageMappings.find(
      (sm) => (sm.pipeline_stages?.code ?? "").toLowerCase() === "offer",
    );
    if (!offerStage) return null;
    return (
      subStages.find(
        (ss) =>
          ss.pipeline_stage_id === offerStage.pipeline_stage_id &&
          ss.is_default,
      ) ?? null
    );
  }, [stageMappings, subStages]);

  const offerStageMapping = useMemo(
    () =>
      stageMappings.find(
        (sm) => (sm.pipeline_stages?.code ?? "").toLowerCase() === "offer",
      ) ?? null,
    [stageMappings],
  );

  /** Every sub-stage id under the "offer" stage — used for the offer-row highlight. */
  const offerStageSubStateIds = useMemo(() => {
    if (!offerStageMapping) return null;
    return new Set(
      subStages
        .filter(
          (ss) => ss.pipeline_stage_id === offerStageMapping.pipeline_stage_id,
        )
        .map((ss) => ss.id),
    );
  }, [offerStageMapping, subStages]);

  const interviewStageMapping = useMemo(
    () =>
      stageMappings.find(
        (sm) => (sm.pipeline_stages?.code ?? "").toLowerCase() === "interview",
      ) ?? null,
    [stageMappings],
  );

  const interviewDefaultSubStage = useMemo(() => {
    if (!interviewStageMapping) return null;
    return (
      subStages.find(
        (ss) =>
          ss.pipeline_stage_id === interviewStageMapping.pipeline_stage_id &&
          ss.is_default,
      ) ?? null
    );
  }, [interviewStageMapping, subStages]);
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [rowUpdating, setRowUpdating] = useState<string | null>(null);

  const [rowPendingDelete, setRowPendingDelete] =
    useState<JdPipelineApplicationRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        setRowPendingDelete(null);
        setDeleteError(null);
      }
    },
  });

  const [rowPendingEdit, setRowPendingEdit] =
    useState<JdPipelineApplicationRow | null>(null);

  const editModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setRowPendingEdit(null);
    },
  });

  const [rowPendingSchedule, setRowPendingSchedule] =
    useState<JdPipelineApplicationRow | null>(null);

  const scheduleModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setRowPendingSchedule(null);
    },
  });

  const openSchedule = useCallback(
    (r: JdPipelineApplicationRow) => {
      setRowPendingSchedule(r);
      scheduleModal.open();
    },
    [scheduleModal],
  );

  const [rowPendingRationale, setRowPendingRationale] =
    useState<JdPipelineApplicationRow | null>(null);

  const rationaleModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setRowPendingRationale(null);
    },
  });

  const openRationale = useCallback(
    (r: JdPipelineApplicationRow) => {
      setRowPendingRationale(r);
      rationaleModal.open();
    },
    [rationaleModal],
  );

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 350);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const selectedFilterOption: PipelineStageSubStageFilterOption | null =
    useMemo(
      () => filterOptions.find((opt) => opt.id === statusFilter) ?? null,
      [filterOptions, statusFilter],
    );
  const [uploadDateRange, setUploadDateRange] =
    useState<RangeValue<CalendarDate> | null>(null);
  const [sortDescriptor, setSortDescriptor] = useState<{
    column: CandidatesListSortColumn;
    direction: "ascending" | "descending";
  } | null>(null);
  const [calendarFocusedDate, setCalendarFocusedDate] = useState<CalendarDate>(
    () => today(getLocalTimeZone()),
  );
  const [page, setPage] = usePageQueryParam();
  const skipInitialPageResetRef = useRef(true);

  const [pageSize, setPageSize] = useState(10);

  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPageSize(size);
      setPage(1);
    },
    [setPage],
  );

  useEffect(() => {
    setSelected(new Set());
  }, [dbRows]);

  useEffect(() => {
    if (skipInitialPageResetRef.current) {
      skipInitialPageResetRef.current = false;
      return;
    }
    setPage(1);
  }, [debouncedQuery, statusFilter, uploadDateRange, sortDescriptor]);

  // If the selected filter's stage/sub-stage was removed by a JD pipeline
  // edit (stale composite id), reset to "all" instead of silently showing
  // zero rows.
  useEffect(() => {
    if (statusFilter === "all") return;
    if (!filterOptions.some((opt) => opt.id === statusFilter)) {
      setStatusFilter("all");
    }
  }, [statusFilter, filterOptions]);

  useEffect(() => {
    if (uploadDateRange?.start) {
      setCalendarFocusedDate(uploadDateRange.start);
    }
  }, [uploadDateRange]);

  // Stage-count summary row: the `dbRows` full-list fetch caps out at 200
  // rows server-side (see `CANDIDATES_LIST_MAX_ALL`/`MAX_LIST_LIMIT`), so
  // deriving stat-card totals from it silently under-counts any job with
  // more applicants than that. These come from a dedicated `COUNT(*)`
  // endpoint instead, scoped to the whole job (not the search/date filters,
  // which only affect the table itself) so the numbers always match the
  // database regardless of how many rows happen to be loaded client-side.
  const [statusCounts, setStatusCounts] = useState<StageCount[]>([]);
  const [totalCandidates, setTotalCandidates] = useState(0);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/job-descriptions/${jobId}/candidate-status-counts`,
        { credentials: "include", cache: "no-store" },
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        counts?: StageCount[];
        total?: number;
      };
      setStatusCounts(json.counts ?? []);
      setTotalCandidates(json.total ?? 0);
    } catch {
      // Stat cards are non-critical; keep the last-known counts on failure.
    }
  }, [jobId]);

  // Re-synced whenever the parent's full-list fetch resolves with a new
  // `dbRows` reference (i.e. after any mutation via `onRefetch`), so the
  // cards don't go stale after a status change/delete/add.
  useEffect(() => {
    void fetchStats();
  }, [fetchStats, dbRows]);

  const stageMappingCounts = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const sm of stageMappings) {
      const code = (sm.pipeline_stages?.code ?? "").toLowerCase();
      totals[sm.id] = statusCounts
        .filter((c) => c.stage_code.toLowerCase() === code)
        .reduce((sum, c) => sum + c.count, 0);
    }
    return totals;
  }, [statusCounts, stageMappings]);

  // The rendered table is its own backend-paginated query (scoped by jobId +
  // the same filters, including the stage/sub-stage filter), independent of
  // the `dbRows` full fetch used for stats above.
  const [pageRows, setPageRows] = useState<JdPipelineApplicationRow[]>([]);
  const [pageTotal, setPageTotal] = useState(0);
  const [pageLoadState, setPageLoadState] = useState<
    "loading" | "error" | "ok"
  >("loading");

  /**
   * Every mutation handler below already calls `fetchPage()` directly after
   * its own `onRefetch(...)` -- so a `dbRows` dependency here (to re-fire via
   * the effect below once the parent's full-list refetch resolves) was pure
   * redundancy: two unsequenced requests per mutation, no `AbortController`,
   * so whichever response happened to land last won, sometimes clobbering a
   * fresher page with a stale one (the likely source of transient/duplicate
   * rows in the table). `fetchPageSeqRef` guards what's left of that race --
   * concurrent calls from fast repeated clicks -- by dropping any response
   * that isn't from the most recently *issued* request.
   */
  const fetchPageSeqRef = useRef(0);

  const fetchPage = useCallback(async () => {
    const seq = ++fetchPageSeqRef.current;
    setPageLoadState((s) => (s === "ok" ? "ok" : "loading"));
    try {
      const params = buildCandidatesListSearchParams({
        jobId,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        q: debouncedQuery.trim() || undefined,
        uploadFrom: uploadDateRange?.start.toString(),
        uploadTo: uploadDateRange?.end.toString(),
        stageMappingId: selectedFilterOption?.stageMapping.id,
        subStateId: selectedFilterOption?.subStage.id,
        sortBy: sortDescriptor?.column,
        sortDir: sortDescriptor
          ? sortDescriptor.direction === "ascending"
            ? "asc"
            : "desc"
          : undefined,
      });
      const res = await fetch(`/api/admin/candidates?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (seq !== fetchPageSeqRef.current) return;
      if (!res.ok) {
        setPageLoadState("error");
        return;
      }
      const json = (await res.json()) as {
        candidates?: JdPipelineApplicationRow[];
        pagination?: { total: number };
      };
      if (seq !== fetchPageSeqRef.current) return;
      setPageRows(json.candidates ?? []);
      setPageTotal(json.pagination?.total ?? json.candidates?.length ?? 0);
      setPageLoadState("ok");
    } catch {
      if (seq === fetchPageSeqRef.current) setPageLoadState("error");
    }
  }, [
    jobId,
    page,
    debouncedQuery,
    uploadDateRange,
    selectedFilterOption,
    sortDescriptor,
    pageSize,
  ]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const handleDeleteCandidate = useCallback(async () => {
    if (!rowPendingDelete) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/candidates/${rowPendingDelete.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Failed to delete candidate.");
      }
      deleteModal.close();
      onRefetch(true);
      void fetchPage();
      toast.success("Candidate deleted successfully.");
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to delete candidate.";
      setDeleteError(message);
      toast.error(message);
    } finally {
      setDeleteBusy(false);
    }
  }, [rowPendingDelete, deleteModal, onRefetch, toast, fetchPage]);

  const paginatedRows = pageRows;
  const totalPages = Math.max(1, Math.ceil(pageTotal / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = pageTotal === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = startIdx === 0 ? 0 : startIdx - 1 + paginatedRows.length;

  const tableLoadState: "loading" | "error" | "empty" | "data" =
    loadState === "loading" || pageLoadState === "loading"
      ? "loading"
      : loadState === "error" || pageLoadState === "error"
        ? "error"
        : paginatedRows.length === 0
          ? "empty"
          : "data";

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const postPipeline = useCallback(
    async (updates: unknown[]) => {
      const res = await fetch("/api/admin/candidates/pipeline", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, updates }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Update failed.");
    },
    [jobId],
  );

  const selectedRows = useMemo(() => {
    return [...selected]
      .map((id) => dbRows.find((r) => r.id === id))
      .filter(Boolean) as JdPipelineApplicationRow[];
  }, [selected, dbRows]);

  const bulkInterviewEligible = useMemo(
    () =>
      selectedRows.length > 0 &&
      selectedRows.every((r) => {
        const { stageMapping, subStage } = resolveRow(r);
        return isEligibleForBulkMoveToInterview(
          stageMapping?.pipeline_stages?.code ?? null,
          subStage?.code ?? null,
        );
      }),
    [selectedRows, resolveRow],
  );

  const bulkOfferEligible = useMemo(
    () =>
      selectedRows.length > 0 &&
      selectedRows.every((r) => {
        const { stageMapping, subStage } = resolveRow(r);
        return (
          (stageMapping?.pipeline_stages?.code ?? "").toLowerCase() ===
            "interview" && subStage?.is_passed === true
        );
      }),
    [selectedRows, resolveRow],
  );

  const bulkFailEligible = useMemo(
    () =>
      selectedRows.length > 0 &&
      selectedRows.every((r) => {
        const { stageMappingId } = resolveRow(r);
        return (
          findFailSubStage(stageMappingId, stageMappings, subStages) != null
        );
      }),
    [selectedRows, resolveRow, stageMappings, subStages],
  );

  const moveSelectedToOffer = useCallback(async () => {
    if (!bulkOfferEligible) return;
    if (!offerStageMapping || !offerDefaultSubStage) {
      toast.error("Offer stage is not configured for this job.");
      return;
    }
    setPipelineBusy(true);
    try {
      await postPipeline(
        selectedRows.map((r) => ({
          id: r.id,
          current_job_stage_mapping_id: offerStageMapping.id,
          current_sub_state_id: offerDefaultSubStage.id,
        })),
      );
      onRefetch(true);
      void fetchPage();
      toast.success("Selected candidates moved to Offer.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Update failed.";
      toast.error(message);
    } finally {
      setPipelineBusy(false);
    }
  }, [
    bulkOfferEligible,
    onRefetch,
    postPipeline,
    selectedRows,
    offerStageMapping,
    offerDefaultSubStage,
    fetchPage,
    toast,
  ]);

  const moveSelectedToInterview = useCallback(async () => {
    if (!bulkInterviewEligible) return;
    if (!interviewStageMapping || !interviewDefaultSubStage) {
      toast.error("Interview stage is not configured for this job.");
      return;
    }
    setPipelineBusy(true);
    try {
      await postPipeline(
        selectedRows.map((r) => ({
          id: r.id,
          current_job_stage_mapping_id: interviewStageMapping.id,
          current_sub_state_id: interviewDefaultSubStage.id,
        })),
      );
      onRefetch(true);
      void fetchPage();
      toast.success("Selected candidates moved to Interview.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Update failed.";
      toast.error(message);
    } finally {
      setPipelineBusy(false);
    }
  }, [
    bulkInterviewEligible,
    onRefetch,
    postPipeline,
    selectedRows,
    interviewStageMapping,
    interviewDefaultSubStage,
    fetchPage,
    toast,
  ]);

  const markSelectedFailed = useCallback(async () => {
    if (!bulkFailEligible) return;
    setPipelineBusy(true);
    try {
      const updates = selectedRows.map((r) => {
        const { stageMappingId } = resolveRow(r);
        const failSubStage = findFailSubStage(
          stageMappingId,
          stageMappings,
          subStages,
        );
        if (!stageMappingId || !failSubStage) {
          throw new Error(
            `No failure sub-stage configured for candidate ${r.id}'s current stage.`,
          );
        }
        return {
          id: r.id,
          current_job_stage_mapping_id: stageMappingId,
          current_sub_state_id: failSubStage.id,
        };
      });
      await postPipeline(updates);
      onRefetch(true);
      void fetchPage();
      toast.success("Selected candidates marked as failed.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Update failed.";
      toast.error(message);
    } finally {
      setPipelineBusy(false);
    }
  }, [
    bulkFailEligible,
    onRefetch,
    postPipeline,
    selectedRows,
    resolveRow,
    stageMappings,
    subStages,
    toast,
    fetchPage,
  ]);

  /**
   * `runJdMatchForCandidate` (called per id server-side) already self-guards
   * via its own CAS lock. This explicit user action sets `force` so completed
   * scores can be recalculated; genuinely ineligible rows (e.g. parsing not
   * done) still come back as skipped.
   */
  const runJdMatchForSelected = useCallback(async () => {
    if (selectedRows.length === 0) return;
    setPipelineBusy(true);
    try {
      const res = await fetch("/api/admin/candidates/jd-match/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedRows.map((r) => r.id),
          force: true,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        results?: {
          id: string;
          ok: boolean;
          skipped?: boolean;
          score?: number;
        }[];
      };
      if (!res.ok) {
        throw new Error(json.error ?? "AI JD-match run failed.");
      }
      const results = json.results ?? [];
      const scored = results.filter((r) => r.ok && !r.skipped).length;
      const skipped = results.filter((r) => r.ok && r.skipped).length;
      const failed = results.filter((r) => !r.ok).length;
      onRefetch(true);
      void fetchPage();
      toast.success(`${scored} scored, ${skipped} skipped, ${failed} failed.`);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "AI JD-match run failed.";
      toast.error(message);
    } finally {
      setPipelineBusy(false);
    }
  }, [selectedRows, onRefetch, fetchPage, toast]);

  const onStatusChange = useCallback(
    async (
      id: string,
      next: { toStageMappingId: string; toSubStateId: string },
    ) => {
      setRowUpdating(id);
      try {
        await postPipeline([
          {
            id,
            current_job_stage_mapping_id: next.toStageMappingId,
            current_sub_state_id: next.toSubStateId,
          },
        ]);
        onRefetch(true);
        void fetchPage();
        toast.success("Candidate status updated.");
      } catch (e) {
        const message = e instanceof Error ? e.message : "Update failed.";
        toast.error(message);
      } finally {
        setRowUpdating(null);
      }
    },
    [onRefetch, postPipeline, fetchPage, toast],
  );

  const filtersElement = (
    <Select
      value={statusFilter}
      onChange={(k) => {
        if (typeof k === "string") {
          setStatusFilter(k);
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        }
      }}
      placeholder="All statuses"
      className="w-40"
    >
      <Select.Trigger className="w-full h-9 overflow-hidden rounded-xl border border-divider bg-surface-secondary/40 text-xs">
        {statusFilter !== "all" && selectedFilterOption ? (
          <div className="min-w-0 flex-1 overflow-hidden">
            <PipelineStageSubStageInlineLabel
              stageMapping={selectedFilterOption.stageMapping}
              subStage={selectedFilterOption.subStage}
            />
          </div>
        ) : (
          <Select.Value />
        )}
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox className="p-1 border border-divider rounded-2xl bg-surface-primary shadow-xl max-h-[300px] overflow-y-auto">
          <ListBox.Item
            id="all"
            textValue="All statuses"
            className="text-xs font-semibold py-1.5 px-2.5 rounded-lg hover:bg-surface-secondary cursor-pointer"
          >
            All statuses
            <ListBox.ItemIndicator />
          </ListBox.Item>
          {filterOptions.map((opt) => (
            <ListBox.Item
              key={opt.id}
              id={opt.id}
              textValue={`${opt.stageMapping.pipeline_stages?.label ?? opt.stageMapping.pipeline_stages?.code} - ${opt.subStage.label}`}
              className="text-xs font-semibold py-1.5 px-2.5 rounded-lg hover:bg-surface-secondary cursor-pointer"
            >
              <PipelineStageSubStageInlineLabel
                stageMapping={opt.stageMapping}
                subStage={opt.subStage}
              />
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );

  const dateRangeElement = (
    <div className="flex items-center gap-2">
      <DateRangePicker
        value={uploadDateRange as any}
        onChange={(next) => setUploadDateRange(next as any)}
        className="w-64"
      >
        <DateField.Group
          fullWidth
          variant="primary"
          className="border-divider bg-surface-secondary/40 text-foreground shadow-sm h-9 rounded-xl py-1 px-3 text-xs"
        >
          <DateField.InputContainer className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none]">
            <DateField.Input slot="start" className="outline-none">
              {(segment) => <DateField.Segment segment={segment} />}
            </DateField.Input>
            <DateRangePicker.RangeSeparator className="shrink-0 px-0.5 text-muted" />
            <DateField.Input slot="end" className="outline-none">
              {(segment) => <DateField.Segment segment={segment} />}
            </DateField.Input>
          </DateField.InputContainer>
          <DateField.Suffix>
            <DateRangePicker.Trigger className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted outline-none hover:bg-surface-tertiary">
              <CalendarIcon className="h-3.5 w-3.5" />
            </DateRangePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <DateRangePicker.Popover>
          <Dialog className="outline-none border border-divider rounded-2xl bg-surface-primary p-4 shadow-2xl z-50">
            <RangeCalendar
              focusedValue={calendarFocusedDate as any}
              onFocusChange={(next) => setCalendarFocusedDate(next as any)}
            >
              <RangeCalendar.Header className="flex items-center justify-between mb-2 gap-2">
                <RangeCalendar.NavButton slot="previous" />
                <div className="flex flex-1 items-center gap-1 justify-center">
                  <select
                    id="jd-cal-month"
                    value={calendarFocusedDate.month}
                    onChange={(e) =>
                      setCalendarFocusedDate((p) =>
                        p.set({
                          month: Number(e.target.value),
                          day: 1,
                        }),
                      )
                    }
                    className="h-7 rounded-lg border border-divider bg-surface-secondary px-1 text-[11px] font-semibold outline-none"
                  >
                    {MONTH_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <select
                    id="jd-cal-year"
                    value={calendarFocusedDate.year}
                    onChange={(e) =>
                      setCalendarFocusedDate((p) =>
                        p.set({ year: Number(e.target.value), day: 1 }),
                      )
                    }
                    className="h-7 rounded-lg border border-divider bg-surface-secondary px-1 text-[11px] font-semibold outline-none"
                  >
                    {YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <RangeCalendar.NavButton slot="next" />
              </RangeCalendar.Header>
              <RangeCalendar.Grid
                weekdayStyle="short"
                className="border-collapse"
              >
                <RangeCalendar.GridHeader>
                  {(day) => (
                    <RangeCalendar.HeaderCell className="text-[10px] text-muted font-bold py-1">
                      {day}
                    </RangeCalendar.HeaderCell>
                  )}
                </RangeCalendar.GridHeader>
                <RangeCalendar.GridBody>
                  {(date) => (
                    <RangeCalendar.Cell
                      date={date}
                      className="w-8 h-8 text-center text-xs font-medium cursor-pointer relative p-0"
                    >
                      {({ formattedDate }) => (
                        <>
                          <RangeCalendar.CellIndicator className="absolute inset-0 bg-accent/10 rounded-lg" />
                          <span className="relative z-[1] flex items-center justify-center h-full w-full rounded-lg hover:bg-accent/15">
                            {formattedDate}
                          </span>
                        </>
                      )}
                    </RangeCalendar.Cell>
                  )}
                </RangeCalendar.GridBody>
              </RangeCalendar.Grid>
            </RangeCalendar>
          </Dialog>
        </DateRangePicker.Popover>
      </DateRangePicker>
      {uploadDateRange && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2.5 border border-divider rounded-xl text-xs font-semibold text-muted"
          onPress={() => setUploadDateRange(null)}
        >
          Clear
        </Button>
      )}
    </div>
  );

  const bulkActionsElement =
    selected.size > 0 ? (
      <div className="flex flex-wrap items-center gap-3 border border-accent/25 bg-accent/5 p-3 rounded-xl">
        <span className="text-xs font-semibold text-accent">
          {selected.size} selected candidates
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            className="bg-accent text-white"
            isDisabled={
              !canEditPipeline || pipelineBusy || !bulkInterviewEligible
            }
            onPress={() => void moveSelectedToInterview()}
          >
            Move to interview
          </Button>
          <Button
            size="sm"
            variant="primary"
            className="bg-accent text-white"
            isDisabled={!canEditPipeline || pipelineBusy || !bulkOfferEligible}
            onPress={() => void moveSelectedToOffer()}
          >
            Move to offer
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="border border-divider bg-surface-primary"
            isDisabled={!canEditPipeline || pipelineBusy || !bulkFailEligible}
            onPress={() => void markSelectedFailed()}
          >
            Mark failed
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="border border-divider bg-surface-primary"
            isDisabled={!canEditPipeline || pipelineBusy}
            onPress={() => void runJdMatchForSelected()}
          >
            Run AI JD Match
          </Button>
        </div>
      </div>
    ) : null;

  const pipelineStats = [
    {
      label: "Total Candidates",
      value: totalCandidates,
      icon: <UsersIcon className="h-4.5 w-4.5" />,
      description: "Applied to opening",
    },
    ...orderedStageMappings.map((sm) => {
      const label =
        sm.pipeline_stages?.label ?? sm.pipeline_stages?.code ?? "Stage";
      const value = stageMappingCounts[sm.id] ?? 0;
      return {
        label,
        value,
        description: "Candidates in stage",
        icon: <LayersIcon className="h-4.5 w-4.5" />,
      };
    }),
  ];

  return (
    <div className="mt-3 flex flex-col gap-4">
      <DataTableStats stats={pipelineStats} />

      <DataTableToolbar
        searchQuery={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search by name or school…"
        filters={filtersElement}
        dateRange={dateRangeElement}
        onRefresh={() => {
          onRefetch(false);
          void fetchPage();
        }}
        isRefreshing={loadState === "loading" || pageLoadState === "loading"}
        actions={
          <Button
            isDisabled={true}
            variant="outline"
            className="h-9 px-3.5 rounded-xl border border-divider hover:bg-surface-secondary text-foreground font-semibold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer text-xs"
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            <span>Export Excel</span>
          </Button>
        }
        createButtonLabel={canAddCandidates ? "Add Candidates" : undefined}
        onCreate={canAddCandidates ? onAddCandidates : undefined}
      />

      {bulkActionsElement}

      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label="Candidates for this job description"
            className="min-w-[900px]"
            sortDescriptor={sortDescriptor ?? undefined}
            onSortChange={(next) =>
              setSortDescriptor(
                next.column
                  ? {
                      column: next.column as CandidatesListSortColumn,
                      direction: next.direction,
                    }
                  : null,
              )
            }
          >
            <Table.Header>
              <Table.Column className="w-10" textValue="Select">
                {(() => {
                  const allSelected =
                    paginatedRows.length > 0 &&
                    paginatedRows.every((r) => selected.has(r.id));
                  const someSelected = paginatedRows.some((r) =>
                    selected.has(r.id),
                  );
                  return (
                    <input
                      type="checkbox"
                      className="size-4 rounded border-divider accent-accent cursor-pointer disabled:cursor-not-allowed"
                      checked={allSelected}
                      readOnly
                      ref={(el) => {
                        if (el) {
                          el.indeterminate = someSelected && !allSelected;
                        }
                      }}
                      disabled={!canEditPipeline || paginatedRows.length === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (allSelected) {
                            paginatedRows.forEach((r) => next.delete(r.id));
                          } else {
                            paginatedRows.forEach((r) => next.add(r.id));
                          }
                          return next;
                        });
                      }}
                      aria-label="Select all candidates on this page"
                    />
                  );
                })()}
              </Table.Column>
              <Table.Column isRowHeader>Candidate &amp; Role</Table.Column>
              <Table.Column
                id="experience"
                allowsSorting
                className="text-center"
              >
                <Table.SortableColumnHeader
                  sortDirection={
                    sortDescriptor?.column === "experience"
                      ? sortDescriptor.direction
                      : undefined
                  }
                >
                  Exp.
                </Table.SortableColumnHeader>
              </Table.Column>
              <Table.Column>Education</Table.Column>
              <Table.Column
                id="jdMatchScore"
                allowsSorting
                className="text-center"
              >
                <Table.SortableColumnHeader
                  sortDirection={
                    sortDescriptor?.column === "jdMatchScore"
                      ? sortDescriptor.direction
                      : undefined
                  }
                >
                  JD match
                </Table.SortableColumnHeader>
              </Table.Column>
              <Table.Column>Pipeline</Table.Column>
              <Table.Column
                id="uploadDate"
                allowsSorting
                className="whitespace-nowrap"
              >
                <Table.SortableColumnHeader
                  sortDirection={
                    sortDescriptor?.column === "uploadDate"
                      ? sortDescriptor.direction
                      : undefined
                  }
                >
                  Uploaded at
                </Table.SortableColumnHeader>
              </Table.Column>
              <Table.Column>Schedule</Table.Column>
              <Table.Column className="text-center w-[110px]">
                Action
              </Table.Column>
            </Table.Header>
            <Table.Body
              key={
                tableLoadState === "loading"
                  ? "pipeline-table-loading"
                  : tableLoadState === "error"
                    ? "pipeline-table-error"
                    : tableLoadState === "empty"
                      ? "pipeline-table-empty"
                      : "pipeline-table-data"
              }
            >
              {tableLoadState === "loading" ? (
                <Table.Row id="pipeline-row-loading">
                  <Table.Cell
                    className="py-8 text-center text-muted"
                    colSpan={9}
                  >
                    Loading…
                  </Table.Cell>
                </Table.Row>
              ) : tableLoadState === "error" ? (
                <Table.Row id="pipeline-row-error">
                  <Table.Cell className="py-8 text-center" colSpan={9}>
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-sm text-danger">
                        Could not load candidates. Try again later.
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onPress={() => {
                          onRefetch();
                          void fetchPage();
                        }}
                      >
                        Retry load
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ) : tableLoadState === "empty" && dbRows.length === 0 ? (
                <Table.Row id="pipeline-row-empty">
                  <Table.Cell
                    className="py-8 text-center text-muted"
                    colSpan={9}
                  >
                    No candidates yet. Link a job opening to this JD and add
                    applicants from the Candidates page or the JD pipeline.
                  </Table.Cell>
                </Table.Row>
              ) : tableLoadState === "empty" ? null : (
                paginatedRows.map((r) => (
                  <PipelineTableRow
                    key={r.id}
                    r={r}
                    jobId={jobId}
                    canEditPipeline={canEditPipeline}
                    selected={selected}
                    toggleSelect={toggleSelect}
                    rowUpdating={rowUpdating}
                    resolveRow={resolveRow}
                    stageMappings={stageMappings}
                    subStages={subStages}
                    offerStageSubStateIds={offerStageSubStateIds}
                    onStatusChange={onStatusChange}
                    onOpenSchedule={openSchedule}
                    onOpenRationale={openRationale}
                    setRowPendingEdit={setRowPendingEdit}
                    openEditModal={editModal.open}
                    setRowPendingDelete={setRowPendingDelete}
                    openDeleteModal={deleteModal.open}
                  />
                ))
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

      {pageTotal > 0 ? (
        <DataTablePagination
          page={safePage}
          totalPages={totalPages}
          setPage={setPage}
          startIdx={startIdx}
          endIdx={endIdx}
          totalCount={pageTotal}
          itemTypeLabel="candidates"
          pageSize={pageSize}
          setPageSize={handlePageSizeChange}
        />
      ) : null}

      {pageTotal === 0 && tableLoadState !== "loading" ? (
        <p className="text-center text-sm text-muted">
          No candidates match the current filters.
        </p>
      ) : null}

      <RationaleModal
        isOpen={rationaleModal.isOpen}
        onOpenChange={rationaleModal.setOpen}
        row={rowPendingRationale}
      />

      <InterviewScheduleModal
        isOpen={scheduleModal.isOpen}
        onOpenChange={scheduleModal.setOpen}
        row={rowPendingSchedule}
        canEdit={canEditPipeline}
        onSaved={() => {
          onRefetch(true);
          void fetchPage();
          toast.success("Interview schedule saved.");
        }}
      />

      <DeleteCandidateModal
        isOpen={deleteModal.isOpen}
        onOpenChange={deleteModal.setOpen}
        candidateName={
          rowPendingDelete
            ? campaignAppliedAdminRowToTableRow(rowPendingDelete).name
            : null
        }
        deleteError={deleteError}
        deleteBusy={deleteBusy}
        onCancel={deleteModal.close}
        onConfirm={() => void handleDeleteCandidate()}
      />

      <EditCandidateModal
        isOpen={editModal.isOpen}
        onOpenChange={editModal.setOpen}
        row={
          rowPendingEdit
            ? {
                id: rowPendingEdit.id,
                name: campaignAppliedAdminRowToTableRow(rowPendingEdit).name,
              }
            : null
        }
        canEdit={!!canEditPipeline}
        onSaved={() => {
          editModal.close();
          onRefetch(true);
          void fetchPage();
          toast.success("Candidate profile updated.");
        }}
      />
    </div>
  );
}
