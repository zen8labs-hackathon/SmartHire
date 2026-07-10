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
  type CalendarDateTime,
} from "@internationalized/date";
import { Dialog } from "react-aria-components";
import type { RangeValue } from "react-aria-components";

import { PipelineStatusLabel } from "@/components/admin/candidates/pipeline-status-label";
import { useToast } from "@/components/admin/toast-provider";
import { PipelineStageSubStageInlineLabel } from "@/components/admin/jd/pipeline-stage-substage-inline-label";
import { PipelineTableRow } from "@/components/admin/jd/pipeline-table-row";
import {
  OnboardingDatesModal,
  DeleteCandidateModal,
  EditCandidateModal,
} from "@/components/admin/jd/jd-pipeline-modals";
import {
  type CandidateDbRow,
  candidateDbRowToTableRow,
} from "@/lib/candidates/db-row";
import { isEligibleForBulkMoveToInterview } from "@/lib/candidates/pipeline-phase";
import {
  type StageMapping,
  type SubStage,
} from "@/lib/pipelines/transition-validator";
import {
  buildPipelineStageSubStageFilterOptions,
  countByStageMappingId,
  type PipelineStageSubStageFilterOption,
} from "@/lib/pipelines/jd-pipeline-filter-options";
import {
  calendarDateTimeToIso,
  findFailSubStage,
  isoToCalendarDateTime,
  localDatetimeToIso,
  resolveRowPipeline,
  rowMatchesSearch,
  rowMatchesUploadDateRange,
} from "@/lib/pipelines/jd-pipeline-row-helpers";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";
import { buildCandidatesListSearchParams } from "@/lib/candidates/candidates-list-query";

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

type Props = {
  jobDescriptionId: number;
  jobId: string;
  dbRows: CandidateDbRow[];
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
  jobDescriptionId,
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
  const supabase = useMemo(() => createClient(), []);

  const resolveRow = useCallback(
    (r: CandidateDbRow) => resolveRowPipeline(r, stageMappings, subStages),
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
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [rowUpdating, setRowUpdating] = useState<string | null>(null);

  const [rowPendingDelete, setRowPendingDelete] =
    useState<CandidateDbRow | null>(null);
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

  const [rowPendingEdit, setRowPendingEdit] = useState<CandidateDbRow | null>(
    null,
  );

  const editModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setRowPendingEdit(null);
    },
  });

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
  const [calendarFocusedDate, setCalendarFocusedDate] = useState<CalendarDate>(
    () => today(getLocalTimeZone()),
  );
  const [page, setPage] = usePageQueryParam();
  const skipInitialPageResetRef = useRef(true);

  const [onboardingDrafts, setOnboardingDrafts] = useState<
    Record<string, string>
  >({});

  const [interviewDrafts, setInterviewDrafts] = useState<
    Record<string, CalendarDateTime | null>
  >({});

  const offerModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        setOnboardingDrafts({});
        setPipelineError(null);
      }
    },
  });

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
  }, [debouncedQuery, statusFilter, uploadDateRange]);

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

  // Stage-count summary row: derived from the full `dbRows` (all=true, every
  // candidate for this JD) fetch, filtered by search/date only — not by the
  // stage/sub-stage filter itself, so selecting one stage doesn't zero out
  // every other stage's card.
  const statsSourceRows = useMemo(() => {
    let rows = dbRows;
    if (debouncedQuery.trim()) {
      rows = rows.filter((r) => rowMatchesSearch(r, debouncedQuery));
    }
    rows = rows.filter((r) => rowMatchesUploadDateRange(r, uploadDateRange));
    return rows;
  }, [dbRows, debouncedQuery, uploadDateRange]);

  const stageMappingCounts = useMemo(
    () =>
      countByStageMappingId(
        statsSourceRows.map((r) => resolveRow(r).stageMappingId),
        stageMappings,
      ),
    [statsSourceRows, resolveRow, stageMappings],
  );

  // The rendered table is its own backend-paginated query (scoped by
  // jobDescriptionId + the same filters, including the stage/sub-stage
  // filter), independent of the `dbRows` full fetch used for stats above.
  const [pageRows, setPageRows] = useState<CandidateDbRow[]>([]);
  const [pageTotal, setPageTotal] = useState(0);
  const [pageLoadState, setPageLoadState] = useState<
    "loading" | "error" | "ok"
  >("loading");

  const fetchPage = useCallback(async () => {
    setPageLoadState((s) => (s === "ok" ? "ok" : "loading"));
    try {
      const h = await getSessionAuthorizationHeaders(supabase);
      const params = buildCandidatesListSearchParams({
        jobDescriptionId,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        q: debouncedQuery.trim() || undefined,
        uploadFrom: uploadDateRange?.start.toString(),
        uploadTo: uploadDateRange?.end.toString(),
        stageMappingId: selectedFilterOption?.stageMapping.id,
        subStateId: selectedFilterOption?.subStage.id,
        legacyStatus: selectedFilterOption?.legacyStatus ?? undefined,
        contactFieldsOnly: true,
      });
      const res = await fetch(`/api/admin/candidates?${params}`, {
        credentials: "include",
        headers: { ...h },
      });
      if (!res.ok) {
        setPageLoadState("error");
        return;
      }
      const json = (await res.json()) as {
        candidates?: CandidateDbRow[];
        pagination?: { total: number };
      };
      setPageRows(json.candidates ?? []);
      setPageTotal(json.pagination?.total ?? json.candidates?.length ?? 0);
      setPageLoadState("ok");
    } catch {
      setPageLoadState("error");
    }
  }, [
    supabase,
    jobDescriptionId,
    page,
    debouncedQuery,
    uploadDateRange,
    selectedFilterOption,
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
      const h = await getSessionAuthorizationHeaders(supabase);
      const res = await fetch(`/api/admin/candidates/${rowPendingDelete.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          ...(h.Authorization ? { Authorization: h.Authorization } : {}),
        },
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
  }, [rowPendingDelete, deleteModal, onRefetch, supabase, toast, fetchPage]);

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
      const h = await getSessionAuthorizationHeaders(supabase);
      const res = await fetch("/api/admin/candidates/pipeline", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(h.Authorization ? { Authorization: h.Authorization } : {}),
        },
        body: JSON.stringify({ jobDescriptionId, updates }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Update failed.");
    },
    [jobDescriptionId, supabase],
  );

  const selectedRows = useMemo(() => {
    return [...selected]
      .map((id) => dbRows.find((r) => r.id === id))
      .filter(Boolean) as CandidateDbRow[];
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

  const openOfferModal = useCallback(() => {
    const ids = selectedRows
      .filter((r) => {
        const { stageMapping, subStage } = resolveRow(r);
        return (
          (stageMapping?.pipeline_stages?.code ?? "").toLowerCase() ===
            "interview" && subStage?.is_passed === true
        );
      })
      .map((r) => r.id);
    if (ids.length === 0) return;
    const drafts: Record<string, string> = {};
    for (const id of ids) drafts[id] = "";
    setOnboardingDrafts(drafts);
    offerModal.open();
  }, [selectedRows, offerModal, resolveRow]);

  const confirmOffer = useCallback(async () => {
    if (!offerStageMapping || !offerDefaultSubStage) {
      setPipelineError("Offer stage is not configured for this job.");
      return;
    }
    const entries = Object.entries(onboardingDrafts);
    for (const [, v] of entries) {
      if (!v?.trim()) {
        setPipelineError(
          "Please set onboarding date and time for every candidate.",
        );
        return;
      }
    }
    const updates: {
      id: string;
      current_job_stage_mapping_id: string;
      current_sub_state_id: string;
      onboarding_at: string;
    }[] = [];
    for (const [id, local] of entries) {
      const iso = localDatetimeToIso(local);
      if (!iso) {
        setPipelineError("One or more onboarding times are invalid.");
        return;
      }
      updates.push({
        id,
        current_job_stage_mapping_id: offerStageMapping.id,
        current_sub_state_id: offerDefaultSubStage.id,
        onboarding_at: iso,
      });
    }
    setPipelineError(null);
    setPipelineBusy(true);
    try {
      await postPipeline(updates);
      offerModal.close();
      onRefetch(true);
      void fetchPage();
      toast.success("Offer confirmed for selected candidates.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Update failed.";
      setPipelineError(message);
      toast.error(message);
    } finally {
      setPipelineBusy(false);
    }
  }, [
    onboardingDrafts,
    offerModal,
    onRefetch,
    postPipeline,
    offerStageMapping,
    offerDefaultSubStage,
    fetchPage,
    toast,
  ]);

  const moveSelectedToInterview = useCallback(async () => {
    if (!bulkInterviewEligible) return;
    if (!interviewStageMapping || !interviewDefaultSubStage) {
      setPipelineError("Interview stage is not configured for this job.");
      return;
    }
    setPipelineBusy(true);
    setPipelineError(null);
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
      setPipelineError(message);
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
    setPipelineError(null);
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
      setPipelineError(message);
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

  const onStatusChange = useCallback(
    async (
      id: string,
      next: { toStageMappingId: string; toSubStateId: string },
    ) => {
      setRowUpdating(id);
      setPipelineError(null);
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
        setPipelineError(message);
        toast.error(message);
      } finally {
        setRowUpdating(null);
      }
    },
    [onRefetch, postPipeline, fetchPage, toast],
  );

  const patchTimeline = useCallback(
    async (
      id: string,
      body: { interview_at?: string | null; onboarding_at?: string | null },
    ) => {
      const h = await getSessionAuthorizationHeaders(supabase);
      const res = await fetch(`/api/admin/candidates/${id}/timeline`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(h.Authorization ? { Authorization: h.Authorization } : {}),
        },
        body: JSON.stringify({ jobDescriptionId, ...body }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Update failed.");
    },
    [jobDescriptionId, supabase],
  );

  const saveInterviewTime = useCallback(
    async (id: string, value: CalendarDateTime | null) => {
      setPipelineError(null);
      setRowUpdating(id);
      try {
        const iso = calendarDateTimeToIso(value);
        await patchTimeline(id, { interview_at: iso });
        onRefetch(true);
        void fetchPage();
        toast.success("Interview time saved.");
      } catch (e) {
        const message = e instanceof Error ? e.message : "Update failed.";
        setPipelineError(message);
        toast.error(message);
      } finally {
        setRowUpdating(null);
      }
    },
    [onRefetch, patchTimeline, fetchPage, toast],
  );

  const saveOnboardingTime = useCallback(
    async (id: string, value: CalendarDateTime | null) => {
      setPipelineError(null);
      setRowUpdating(id);
      try {
        const iso = calendarDateTimeToIso(value);
        await patchTimeline(id, { onboarding_at: iso });
        onRefetch(true);
        void fetchPage();
        toast.success("Onboarding time saved.");
      } catch (e) {
        const message = e instanceof Error ? e.message : "Update failed.";
        setPipelineError(message);
        toast.error(message);
      } finally {
        setRowUpdating(null);
      }
    },
    [onRefetch, patchTimeline, fetchPage, toast],
  );

  useEffect(() => {
    setInterviewDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const r of dbRows) {
        if (
          (r.status === "Interview" || r.status === "InterviewPassed") &&
          next[r.id] === undefined
        ) {
          next[r.id] = isoToCalendarDateTime(r.interview_at);
          changed = true;
        }
        const obKey = `ob-${r.id}`;
        if (r.status === "Offer" && next[obKey] === undefined) {
          next[obKey] = isoToCalendarDateTime(r.onboarding_at);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [dbRows]);

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
          selectedFilterOption.legacyStatus ? (
            <PipelineStatusLabel
              status={selectedFilterOption.legacyStatus}
              variant="inline"
              uppercase={false}
              stageMappings={stageMappings}
              subStages={subStages}
            />
          ) : (
            <PipelineStageSubStageInlineLabel
              stageMapping={selectedFilterOption.stageMapping}
              subStage={selectedFilterOption.subStage}
            />
          )
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
              {opt.legacyStatus ? (
                <PipelineStatusLabel
                  status={opt.legacyStatus}
                  variant="inline"
                  uppercase={false}
                  stageMappings={stageMappings}
                  subStages={subStages}
                />
              ) : (
                <PipelineStageSubStageInlineLabel
                  stageMapping={opt.stageMapping}
                  subStage={opt.subStage}
                />
              )}
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
            onPress={openOfferModal}
          >
            Move to offer…
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
        </div>
      </div>
    ) : null;

  const pipelineStats = [
    {
      label: "Total Candidates",
      value: dbRows.length,
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
      {pipelineError ? (
        <p className="text-sm text-danger">{pipelineError}</p>
      ) : null}

      <DataTableToolbar
        searchQuery={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search by name, role, school, or degree…"
        filters={filtersElement}
        dateRange={dateRangeElement}
        onRefresh={() => {
          onRefetch(false);
          void fetchPage();
        }}
        isRefreshing={loadState === "loading" || pageLoadState === "loading"}
        actions={
          <Button
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

      <DataTableStats stats={pipelineStats} />

      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label="Candidates for this job description"
            className="min-w-[900px]"
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
              <Table.Column className="text-center">Exp.</Table.Column>
              <Table.Column>Education</Table.Column>
              <Table.Column className="text-center">JD match</Table.Column>
              <Table.Column>Pipeline</Table.Column>
              <Table.Column className="whitespace-nowrap">
                Uploaded at
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
                    interviewDrafts={interviewDrafts}
                    setInterviewDrafts={setInterviewDrafts}
                    saveInterviewTime={saveInterviewTime}
                    saveOnboardingTime={saveOnboardingTime}
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

      <OnboardingDatesModal
        isOpen={offerModal.isOpen}
        onOpenChange={offerModal.setOpen}
        onboardingDrafts={onboardingDrafts}
        setOnboardingDrafts={setOnboardingDrafts}
        dbRows={dbRows}
        pipelineError={pipelineError}
        pipelineBusy={pipelineBusy}
        onCancel={offerModal.close}
        onConfirm={() => void confirmOffer()}
      />

      <DeleteCandidateModal
        isOpen={deleteModal.isOpen}
        onOpenChange={deleteModal.setOpen}
        candidateName={
          rowPendingDelete
            ? candidateDbRowToTableRow(rowPendingDelete).name
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
        row={rowPendingEdit}
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
