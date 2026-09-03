"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Users as UsersIcon, Layers as LayersIcon, Download } from "lucide-react";
import {
  DataTableStats,
  DataTableToolbar,
  DataTablePagination,
} from "@/components/admin/shell/table-system";
import { usePageQueryParam } from "@/components/admin/shell/use-page-query-param";
import { useDebouncedValue } from "@/components/admin/shell/use-debounced-value";
import { DateRangeCalendarField } from "@/components/admin/shell/date-range-calendar-field";
import { Button, ListBox, Select, Table, useOverlayState } from "@heroui/react";
import type { CalendarDate } from "@internationalized/date";
import type { RangeValue } from "react-aria-components";

import { useToast } from "@/components/admin/toast-provider";
import { PipelineStageSubStageInlineLabel } from "@/components/admin/jd/pipeline-stage-substage-inline-label";
import { PipelineTableRow } from "@/components/admin/jd/pipeline-table-row";
import {
  InterviewScheduleModal,
  DeleteCandidateModal,
  EditCandidateModal,
  RationaleModal,
  ConfirmBulkPipelineActionModal,
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
import { candidateService } from "@/lib/service/candidate.service";

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

type BulkActionType = "interview" | "offer" | "fail" | "jd-match";

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

  const bulkActionConfirmModal = useOverlayState();
  const [pendingBulkAction, setPendingBulkAction] =
    useState<BulkActionType | null>(null);

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

  const [pageRows, setPageRows] = useState<JdPipelineApplicationRow[]>([]);
  const [pageTotal, setPageTotal] = useState(0);
  const [pageLoadState, setPageLoadState] = useState<
    "loading" | "error" | "ok"
  >("loading");

  useEffect(() => {
    setSelected(new Set());
  }, [pageRows]);

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
      const { candidates, pagination } =
        await candidateService.getFilteredCandidateList(
          jobId,
          Object.fromEntries(params),
        );
      if (seq !== fetchPageSeqRef.current) return;
      const total = pagination?.total ?? candidates.length;
      setPageRows(candidates);
      setPageTotal(total);
      setPageLoadState("ok");
      const maxPage = Math.max(1, Math.ceil(total / pageSize));
      if (page > maxPage) {
        setPage(maxPage);
      }
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
    setPage,
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
      void fetchStats();
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
  }, [rowPendingDelete, deleteModal, fetchStats, toast, fetchPage]);

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
      .map((id) => pageRows.find((r) => r.id === id))
      .filter(Boolean) as JdPipelineApplicationRow[];
  }, [selected, pageRows]);

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
      void fetchStats();
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
    fetchStats,
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
      void fetchStats();
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
    fetchStats,
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
      void fetchStats();
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
    fetchStats,
    postPipeline,
    selectedRows,
    resolveRow,
    stageMappings,
    subStages,
    toast,
    fetchPage,
  ]);

  /**
   * Enqueues a `rerun-ai-matching` queue job per candidate (re-download CV ->
   * re-parse -> re-score); the worker always re-runs, overwriting any existing
   * score. `errorIds` are rows with no processed CV to re-run. Shared by the
   * bulk "Run AI JD Match" action and the per-row retry button.
   */
  const rerunAiMatch = useCallback(
    async (candidateIds: string[]) => {
      const ids = [...new Set(candidateIds)].filter(Boolean);
      if (ids.length === 0) return;
      try {
        const { candidates, errorIds } =
          await candidateService.rerunAIMatching(jobId, ids);
        void fetchStats();
        await fetchPage();
        if (candidates.length === 0) {
          toast.error("No candidate had a processed CV to re-run.");
        } else if (errorIds.length > 0) {
          toast.success(
            `${candidates.length} queued, ${errorIds.length} skipped (no processed CV).`,
          );
        } else {
          toast.success(`${candidates.length} queued for AI processing.`);
        }
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "AI JD-match run failed.",
        );
      }
    },
    [jobId, fetchStats, fetchPage, toast],
  );

  const runJdMatchForSelected = useCallback(async () => {
    if (selectedRows.length === 0) return;
    setPipelineBusy(true);
    try {
      await rerunAiMatch(selectedRows.map((r) => r.candidate_id));
    } finally {
      setPipelineBusy(false);
    }
  }, [selectedRows, rerunAiMatch]);

  const confirmBulkAction = useCallback(
    (action: BulkActionType) => {
      setPendingBulkAction(action);
      bulkActionConfirmModal.open();
    },
    [bulkActionConfirmModal],
  );

  const executeConfirmedBulkAction = useCallback(async () => {
    if (!pendingBulkAction) return;
    const action = pendingBulkAction;

    if (action === "interview") {
      await moveSelectedToInterview();
    } else if (action === "offer") {
      await moveSelectedToOffer();
    } else if (action === "fail") {
      await markSelectedFailed();
    } else {
      await runJdMatchForSelected();
    }

    // Clear the selection and dismiss the toast's source modal only once the
    // action (and its success/error toast) has actually run.
    setSelected(new Set());
    bulkActionConfirmModal.close();
    setPendingBulkAction(null);
  }, [
    pendingBulkAction,
    moveSelectedToInterview,
    moveSelectedToOffer,
    markSelectedFailed,
    runJdMatchForSelected,
    bulkActionConfirmModal,
  ]);

  const bulkActionDialogCopy = useMemo(() => {
    if (pendingBulkAction === "interview") {
      return {
        title: "Move to interview",
        description: "Move the current selection to the Interview stage",
        confirmLabel: "Move to interview",
      };
    }
    if (pendingBulkAction === "offer") {
      return {
        title: "Move to offer",
        description: "Move the current selection to the Offer stage",
        confirmLabel: "Move to offer",
      };
    }
    if (pendingBulkAction === "fail") {
      return {
        title: "Mark failed",
        description: "Mark the current selection as failed",
        confirmLabel: "Mark failed",
      };
    }
    return {
      title: "Run AI JD Match",
      description:
        "Run AI JD matching for the current selection. This may take a while and will overwrite any existing match scores",
      confirmLabel: "Run match",
    };
  }, [pendingBulkAction]);

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
        void fetchStats();
        void fetchPage();
        toast.success("Candidate status updated.");
      } catch (e) {
        const message = e instanceof Error ? e.message : "Update failed.";
        toast.error(message);
      } finally {
        setRowUpdating(null);
      }
    },
    [fetchStats, postPipeline, fetchPage, toast],
  );

  const retryParsing = useCallback(
    async (row: JdPipelineApplicationRow) => {
      setRowUpdating(row.id);
      try {
        await rerunAiMatch([row.candidate_id]);
      } finally {
        setRowUpdating(null);
      }
    },
    [rerunAiMatch],
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
      className="w-32"
    >
      <Select.Trigger className="w-full h-9 rounded-xl border border-divider bg-surface-secondary/40 text-xs">
        {statusFilter !== "all" && selectedFilterOption ? (
          <PipelineStageSubStageInlineLabel
            stageMapping={selectedFilterOption.stageMapping}
            subStage={selectedFilterOption.subStage}
          />
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
    <DateRangeCalendarField
      value={uploadDateRange}
      onChange={setUploadDateRange}
      monthYearNav
      idSuffix="-jd-pipeline"
    />
  );

  const hasSelection = selected.size > 0;
  const bulkActionsElement = (
    <div className="flex flex-col gap-3 rounded-xl border border-accent/25 bg-accent/5 p-3">
      <span className="text-xs font-semibold text-accent">
        {hasSelection
          ? `${selected.size} selected candidates`
          : "Select candidates to use bulk actions"}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="border border-accent/30 bg-white text-accent hover:bg-accent/5"
          isDisabled={
            !hasSelection ||
            !canEditPipeline ||
            pipelineBusy ||
            !bulkInterviewEligible
          }
          onPress={() => confirmBulkAction("interview")}
        >
          Move to interview
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="border border-accent/30 bg-white text-accent hover:bg-accent/5"
          isDisabled={
            !hasSelection ||
            !canEditPipeline ||
            pipelineBusy ||
            !bulkOfferEligible
          }
          onPress={() => confirmBulkAction("offer")}
        >
          Move to offer
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="border border-accent/30 bg-white text-accent hover:bg-accent/5"
          isDisabled={
            !hasSelection ||
            !canEditPipeline ||
            pipelineBusy ||
            !bulkFailEligible
          }
          onPress={() => confirmBulkAction("fail")}
        >
          Mark failed
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="border border-accent/30 bg-white text-accent hover:bg-accent/5"
          isDisabled={!hasSelection || !canEditPipeline || pipelineBusy}
          onPress={() => confirmBulkAction("jd-match")}
        >
          Run AI JD Match
        </Button>
      </div>
    </div>
  );

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
          void fetchStats();
          void fetchPage();
        }}
        isRefreshing={loadState === "loading" || pageLoadState === "loading"}
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
                          if (allSelected || someSelected) {
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
              <Table.Column className="text-center w-[140px]">
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
              ) : tableLoadState === "empty" && totalCandidates === 0 ? (
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
                    onRetryParsing={retryParsing}
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
          void fetchStats();
          void fetchPage();
          toast.success("Interview schedule saved.");
        }}
      />

      <ConfirmBulkPipelineActionModal
        isOpen={bulkActionConfirmModal.isOpen}
        onOpenChange={(open) => {
          bulkActionConfirmModal.setOpen(open);
          if (!open) setPendingBulkAction(null);
        }}
        title={bulkActionDialogCopy.title}
        description={bulkActionDialogCopy.description}
        confirmLabel={bulkActionDialogCopy.confirmLabel}
        candidateCount={selectedRows.length}
        busy={pipelineBusy}
        onCancel={() => {
          bulkActionConfirmModal.close();
          setPendingBulkAction(null);
        }}
        onConfirm={() => void executeConfirmedBulkAction()}
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
          void fetchStats();
          void fetchPage();
          toast.success("Candidate profile updated.");
        }}
      />
    </div>
  );
}
