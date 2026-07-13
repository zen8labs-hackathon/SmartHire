"use client";

import { getLocalTimeZone, today, type CalendarDate } from "@internationalized/date";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RangeValue } from "react-aria-components";

import type { CandidateCvHistoryRow } from "@/lib/candidates/cv-history-types";
import type { CvManagementVersionListItem } from "@/lib/candidates/cv-management-version-list";
import {
  type CandidateDbRow,
  candidateDbRowToTableRow,
} from "@/lib/candidates/db-row";
import {
  CANDIDATES_LIST_DEFAULT_LIMIT,
  buildCandidatesListSearchParams,
  type CandidatesListQuery,
} from "@/lib/candidates/candidates-list-query";
import { CANDIDATE_ROWS } from "@/lib/candidates/mock-data";
import type { CandidateRow } from "@/lib/candidates/types";
import { allowedStageTargets } from "@/lib/pipelines/jd-pipeline-row-helpers";
import {
  resolveCandidatePipelineIds,
  wasCandidateStageOrphaned,
  type StageMapping,
  type SubStage,
} from "@/lib/pipelines/transition-validator";
import { usePageQueryParam } from "@/components/admin/shell/use-page-query-param";
import { useDebouncedValue } from "@/components/admin/shell/use-debounced-value";

export type PipelineConfigForJob = {
  stageMappings: StageMapping[];
  subStages: SubStage[];
};

export type ResolvedActivePipeline = {
  stageMappingId: string | null;
  subStateId: string | null;
  stageMapping: StageMapping | null;
  subStage: SubStage | null;
  orphaned: boolean;
};

/** Local calendar day YYYY-MM-DD for upload timestamp (for date filter). */
export function uploadDateKeyLocal(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type CandidatePipelineListMode = "page" | "all";

type UseCandidatePipelineStateOptions = {
  /** `page` = server pagination + filters; `all` = full list (e.g. JD pipeline table). */
  listMode?: CandidatePipelineListMode;
  initialListTotal?: number;
  /** When true, fetch from the deduped endpoint that merges CVs from the same person. */
  deduped?: boolean;
};

export function useCandidatePipelineState(
  initialRows?: CandidateDbRow[],
  options: UseCandidatePipelineStateOptions = {},
) {
  const listMode = options.listMode ?? "page";
  const initialListTotal = options.initialListTotal;
  const deduped = options.deduped ?? false;
  const [urlPage, setUrlPage] = usePageQueryParam();
  const [localPage, setLocalPage] = useState(1);
  const page = listMode === "page" ? urlPage : localPage;
  const setPage = listMode === "page" ? setUrlPage : setLocalPage;
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 350);
  const [uploadDateRangeFilter, setUploadDateRangeFilter] =
    useState<RangeValue<CalendarDate> | null>(null);
  const [calendarFocusedDate, setCalendarFocusedDate] = useState<CalendarDate>(() =>
    today(getLocalTimeZone()),
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<CandidateRow | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [rowPendingDelete, setRowPendingDelete] = useState<CandidateRow | null>(
    null,
  );
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [stageUpdateBusy, setStageUpdateBusy] = useState(false);
  const [stageUpdateError, setStageUpdateError] = useState<string | null>(null);
  const [cvHistoryRows, setCvHistoryRows] = useState<CandidateCvHistoryRow[]>([]);
  const [cvVersions, setCvVersions] = useState<CvManagementVersionListItem[]>([]);
  const [cvHistoryLoading, setCvHistoryLoading] = useState(false);
  const [cvHistoryError, setCvHistoryError] = useState<string | null>(null);
  const [dbRows, setDbRows] = useState<CandidateDbRow[]>(initialRows ?? []);
  const [pipelineConfigByJob, setPipelineConfigByJob] = useState<
    Record<string, PipelineConfigForJob>
  >({});
  const [dbLoadState, setDbLoadState] = useState<"loading" | "error" | "ok">(
    initialRows ? "ok" : "loading",
  );
  const [listTotal, setListTotal] = useState(
    initialListTotal ?? initialRows?.length ?? 0,
  );
  const [listPageSize, setListPageSize] = useState(10);

  const changeListPageSize = useCallback((size: number) => {
    setListPageSize(size);
    setPage(1);
  }, [setPage]);

  const skipInitialFetchRef = useRef(Boolean(initialRows?.length));
  const skipInitialPageResetRef = useRef(true);

  const buildListQuery = useCallback((): CandidatesListQuery => {
    const uploadFrom = uploadDateRangeFilter?.start.toString();
    const uploadTo = uploadDateRangeFilter?.end.toString();
    const q = debouncedQuery.trim() || undefined;

    if (listMode === "all") {
      return {
        all: true,
        uploadFrom,
        uploadTo,
        q,
      };
    }

    return {
      limit: listPageSize,
      offset: (page - 1) * listPageSize,
      uploadFrom,
      uploadTo,
      q,
    };
  }, [debouncedQuery, listMode, page, uploadDateRangeFilter, listPageSize]);

  const fetchCandidates = useCallback(async () => {
    setDbLoadState((s) => (s === "ok" ? "ok" : "loading"));
    try {
      let url: string;
      if (deduped) {
        const listQuery = buildListQuery();
        const params = new URLSearchParams();
        params.set("limit", String(listQuery.limit ?? CANDIDATES_LIST_DEFAULT_LIMIT));
        params.set("offset", String(listQuery.offset ?? 0));
        if (listQuery.q) params.set("q", listQuery.q);
        if (listQuery.uploadFrom) params.set("uploadFrom", listQuery.uploadFrom);
        if (listQuery.uploadTo) params.set("uploadTo", listQuery.uploadTo);
        url = `/api/admin/candidates/deduped?${params}`;
      } else {
        const params = buildCandidatesListSearchParams(buildListQuery());
        url = `/api/admin/candidates?${params}`;
      }
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        setDbLoadState("error");
        return;
      }
      const json = (await res.json()) as {
        candidates?: CandidateDbRow[];
        pagination?: { total: number };
      };
      setDbRows(json.candidates ?? []);
      setListTotal(json.pagination?.total ?? json.candidates?.length ?? 0);
      setDbLoadState("ok");
    } catch {
      setDbLoadState("error");
    }
  }, [buildListQuery, deduped]);

  // Each row can belong to a different job with a different custom pipeline
  // (unlike the JD-scoped pipeline table, which only ever needs one job's
  // config) -- fetch every distinct job's stage/sub-stage config the
  // currently-loaded rows actually reference, in one batched request, and
  // skip ids already cached from a prior fetch.
  const jobIdsOnPage = useMemo(
    () => [...new Set(dbRows.map((r) => r.job_opening_id).filter((id): id is string => !!id))],
    [dbRows],
  );

  useEffect(() => {
    const missing = jobIdsOnPage.filter((id) => !(id in pipelineConfigByJob));
    if (missing.length === 0) return;
    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/candidates/pipeline-config?jobIds=${missing.map(encodeURIComponent).join(",")}`,
          { credentials: "include", signal: ac.signal },
        );
        if (!res.ok) return;
        const json = (await res.json()) as { configs?: Record<string, PipelineConfigForJob> };
        if (!json.configs) return;
        setPipelineConfigByJob((prev) => ({ ...prev, ...json.configs }));
      } catch {
        // ignore abort / network — the stage dropdown just stays disabled for these rows
      }
    })();
    return () => ac.abort();
  }, [jobIdsOnPage, pipelineConfigByJob]);

  const listFilterKey = useMemo(
    () =>
      JSON.stringify({
        listMode,
        query: debouncedQuery,
        uploadFrom: uploadDateRangeFilter?.start.toString() ?? null,
        uploadTo: uploadDateRangeFilter?.end.toString() ?? null,
        listPageSize,
      }),
    [debouncedQuery, listMode, uploadDateRangeFilter, listPageSize],
  );

  useEffect(() => {
    if (skipInitialPageResetRef.current) {
      skipInitialPageResetRef.current = false;
      return;
    }
    setPage(1);
  }, [listFilterKey]);

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return;
    }
    void fetchCandidates();
  }, [fetchCandidates, listFilterKey, page]);

  useEffect(() => {
    if (uploadDateRangeFilter?.start) {
      setCalendarFocusedDate(uploadDateRangeFilter.start);
    }
  }, [uploadDateRangeFilter]);

  const fetchCvHistoryForCandidate = useCallback(
    async (
      candidateId: string,
      opts?: { showLoading?: boolean; signal?: AbortSignal },
    ) => {
      const showLoading = opts?.showLoading !== false;
      if (showLoading) {
        setCvHistoryLoading(true);
        setCvHistoryError(null);
      }
      try {
        const res = await fetch(`/api/admin/candidates/${candidateId}/cv-history`, {
          credentials: "include",
          signal: opts?.signal,
        });
        const json = (await res.json()) as {
          error?: string;
          history?: CandidateCvHistoryRow[];
          versions?: CvManagementVersionListItem[];
        };
        if (!res.ok) {
          throw new Error(json.error ?? "Could not load CV history.");
        }
        if (opts?.signal?.aborted) return;
        setCvHistoryRows(json.history ?? []);
        setCvVersions(json.versions ?? []);
        setCvHistoryError(null);
      } catch (error) {
        if (opts?.signal?.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setCvHistoryRows([]);
        setCvVersions([]);
        setCvHistoryError(
          error instanceof Error ? error.message : "Could not load CV history.",
        );
      } finally {
        if (showLoading) {
          setCvHistoryLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!activeRow) {
      setCvHistoryRows([]);
      setCvVersions([]);
      setCvHistoryError(null);
      setCvHistoryLoading(false);
      return;
    }
    const ac = new AbortController();
    void fetchCvHistoryForCandidate(activeRow.id, {
      showLoading: true,
      signal: ac.signal,
    });
    return () => {
      ac.abort();
    };
  }, [activeRow, fetchCvHistoryForCandidate]);

  /** List queries omit `parsed_payload`; load full row when the drawer opens. */
  useEffect(() => {
    if (!activeRow || !drawerOpen) return;
    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/admin/candidates/${activeRow.id}`, {
          credentials: "include",
          signal: ac.signal,
        });
        if (!res.ok) return;
        const json = (await res.json()) as { candidate?: CandidateDbRow };
        const c = json.candidate;
        if (!c || ac.signal.aborted) return;
        setDbRows((prev) =>
          prev.map((r) => {
            if (r.id !== c.id) return r;
            // The deduped list computes experience_years as the max across all
            // CVs for a person. The single-row detail API returns the raw DB
            // value for this specific CV, which may be lower (or null). Preserve
            // the higher value so the table column doesn't reset after opening
            // the drawer.
            const existingExp =
              r.experience_years == null || r.experience_years === ""
                ? 0
                : Number(r.experience_years);
            const newExp =
              c.experience_years == null || c.experience_years === ""
                ? 0
                : Number(c.experience_years);
            return {
              ...c,
              experience_years:
                Number.isFinite(existingExp) && existingExp > newExp
                  ? existingExp
                  : c.experience_years,
            };
          }),
        );
        setActiveRow((prev) =>
          prev?.id === c.id ? candidateDbRowToTableRow(c) : prev,
        );
      } catch {
        // ignore abort / network
      }
    })();
    return () => ac.abort();
  }, [activeRow?.id, drawerOpen]);

  const refreshCvHistoryForCandidate = useCallback(
    async (candidateId: string) => {
      await fetchCvHistoryForCandidate(candidateId, { showLoading: false });
    },
    [fetchCvHistoryForCandidate],
  );

  const tableSourceRows = useMemo(() => {
    if (dbLoadState === "error") {
      const rows = [...CANDIDATE_ROWS];
      rows.sort((a, b) => {
        const as = a.jdMatchScore ?? -1;
        const bs = b.jdMatchScore ?? -1;
        if (bs !== as) return bs - as;
        return a.name.localeCompare(b.name);
      });
      return rows;
    }
    if (dbLoadState !== "ok") {
      return [];
    }
    const sortedDb = [...dbRows].sort((a, b) => {
      const ta = new Date(a.cv_uploaded_at ?? a.created_at).getTime();
      const tb = new Date(b.cv_uploaded_at ?? b.created_at).getTime();
      return tb - ta;
    });
    return sortedDb.map(candidateDbRowToTableRow);
  }, [dbLoadState, dbRows]);

  const filteredRows = useMemo(() => tableSourceRows, [tableSourceRows]);

  const activeDbRow = useMemo(() => {
    if (!activeRow) return null;
    return dbRows.find((r) => r.id === activeRow.id) ?? null;
  }, [activeRow, dbRows]);

  const noResultsForUploadDate =
    uploadDateRangeFilter != null &&
    dbLoadState === "ok" &&
    filteredRows.length === 0;

  const openRow = useCallback((row: CandidateRow) => {
    setStageUpdateError(null);
    setActiveRow(row);
    setDrawerOpen(true);
  }, []);

  const activeJobPipelineConfig = activeDbRow?.job_opening_id
    ? (pipelineConfigByJob[activeDbRow.job_opening_id] ?? null)
    : null;

  const resolvedActivePipeline: ResolvedActivePipeline | null = useMemo(() => {
    if (!activeDbRow || !activeJobPipelineConfig) return null;
    const { stageMappings, subStages } = activeJobPipelineConfig;
    const { stageMappingId, subStateId } = resolveCandidatePipelineIds(
      activeDbRow,
      stageMappings,
      subStages,
    );
    return {
      stageMappingId,
      subStateId,
      stageMapping: stageMappings.find((sm) => sm.id === stageMappingId) ?? null,
      subStage: subStages.find((ss) => ss.id === subStateId) ?? null,
      orphaned: wasCandidateStageOrphaned(activeDbRow, stageMappings, subStages),
    };
  }, [activeDbRow, activeJobPipelineConfig]);

  const drawerStageOptions = useMemo(() => {
    if (!activeJobPipelineConfig || !resolvedActivePipeline) return [];
    const { stageMappingId, subStateId } = resolvedActivePipeline;
    if (!stageMappingId || !subStateId) return [];
    return allowedStageTargets(
      stageMappingId,
      subStateId,
      activeJobPipelineConfig.stageMappings,
      activeJobPipelineConfig.subStages,
    );
  }, [activeJobPipelineConfig, resolvedActivePipeline]);

  const patchCandidateStage = useCallback(
    async (
      campaignAppliedId: string,
      target: { toStageMappingId: string; toSubStateId: string },
    ) => {
      setStageUpdateError(null);
      setStageUpdateBusy(true);
      try {
        const res = await fetch(`/api/admin/candidates/${campaignAppliedId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current_job_stage_mapping_id: target.toStageMappingId,
            current_sub_state_id: target.toSubStateId,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setStageUpdateError(body.error ?? "Could not update pipeline stage.");
          return;
        }
        const json = (await res.json()) as {
          candidate?: {
            current_job_stage_mapping_id: string | null;
            current_sub_state_id: string | null;
          };
        };
        const c = json.candidate;
        if (!c) {
          await fetchCandidates();
          return;
        }
        setDbRows((prev) =>
          prev.map((r) =>
            r.id === campaignAppliedId
              ? {
                  ...r,
                  current_job_stage_mapping_id: c.current_job_stage_mapping_id,
                  current_sub_state_id: c.current_sub_state_id,
                }
              : r,
          ),
        );
      } catch {
        setStageUpdateError("Could not update pipeline stage.");
      } finally {
        setStageUpdateBusy(false);
      }
    },
    [fetchCandidates],
  );

  const confirmDeleteCandidate = useCallback(async () => {
    if (!rowPendingDelete) return;
    setDeleteError(null);
    setDeleteInProgress(true);
    try {
      const res = await fetch(`/api/admin/candidates/${rowPendingDelete.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setDeleteError(body.error ?? "Could not delete candidate.");
        return;
      }
      if (activeRow?.id === rowPendingDelete.id) {
        setDrawerOpen(false);
        setActiveRow(null);
      }
      setDeleteDialogOpen(false);
      setRowPendingDelete(null);
      await fetchCandidates();
    } catch {
      setDeleteError("Could not delete candidate.");
    } finally {
      setDeleteInProgress(false);
    }
  }, [activeRow, fetchCandidates, rowPendingDelete]);

  return {
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
    dbRows,
    dbLoadState,
    fetchCandidates,
    listTotal,
    listPageSize,
    changeListPageSize,
    listMode,
    tableSourceRows,
    filteredRows,
    activeDbRow,
    noResultsForUploadDate,
    openRow,
    resolvedActivePipeline,
    drawerStageOptions,
    patchCandidateStage,
    confirmDeleteCandidate,
  };
}
