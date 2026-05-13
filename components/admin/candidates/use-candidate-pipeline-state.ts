"use client";

import { getLocalTimeZone, today, type CalendarDate } from "@internationalized/date";
import type { Key } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { RangeValue } from "react-aria-components";

import type { CandidateCvHistoryRow } from "@/lib/candidates/cv-history-types";
import type { CvManagementVersionListItem } from "@/lib/candidates/cv-management-version-list";
import {
  type CandidateDbRow,
  candidateDbRowToTableRow,
} from "@/lib/candidates/db-row";
import { CANDIDATE_ROWS } from "@/lib/candidates/mock-data";
import {
  PIPELINE_STATUS_DISPLAY_ORDER,
  candidateStatusSearchHaystack,
  candidateStatusUiLabel,
} from "@/lib/candidates/pipeline-phase";
import {
  allowedTargetsFromStatus,
  isPipelineTransitionAllowed,
} from "@/lib/candidates/pipeline-allowed-transitions";
import type { CandidateRow, CandidateStatus } from "@/lib/candidates/types";
import { createClient } from "@/lib/supabase/client";

type JobOpeningFilterOption = {
  id: string;
  label: string;
};

type JobOpeningApiRow = {
  id: string;
  title: string;
  displayTitle?: string | null;
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

export function useCandidatePipelineState(initialRows?: CandidateDbRow[]) {
  const supabase = useMemo(() => createClient(), []);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [statusKey, setStatusKey] = useState<Key | null>("all");
  const [jdFilterKey, setJdFilterKey] = useState<Key | null>("all");
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
  const [statusUpdateBusy, setStatusUpdateBusy] = useState(false);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);
  const [cvHistoryRows, setCvHistoryRows] = useState<CandidateCvHistoryRow[]>([]);
  const [cvVersions, setCvVersions] = useState<CvManagementVersionListItem[]>([]);
  const [cvHistoryLoading, setCvHistoryLoading] = useState(false);
  const [cvHistoryError, setCvHistoryError] = useState<string | null>(null);
  const [dbRows, setDbRows] = useState<CandidateDbRow[]>(initialRows ?? []);
  const [jobOpeningOptions, setJobOpeningOptions] = useState<JobOpeningFilterOption[]>([]);
  const [jobOpeningsLoadState, setJobOpeningsLoadState] =
    useState<"loading" | "error" | "ok">("loading");
  const [dbLoadState, setDbLoadState] = useState<"loading" | "error" | "ok">(
    initialRows ? "ok" : "loading",
  );

  const fetchCandidates = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/candidates", { credentials: "include" });
      if (!res.ok) {
        setDbLoadState("error");
        return;
      }
      const json = (await res.json()) as { candidates?: CandidateDbRow[] };
      setDbRows(json.candidates ?? []);
      setDbLoadState("ok");
    } catch {
      setDbLoadState("error");
    }
  }, []);

  const fetchJobOpenings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/job-openings", { credentials: "include" });
      if (!res.ok) {
        setJobOpeningsLoadState("error");
        return;
      }
      const json = (await res.json()) as { jobOpenings?: JobOpeningApiRow[] };
      const rows = json.jobOpenings ?? [];
      const baseItems = rows.map((row) => ({
        id: row.id,
        label: (row.displayTitle ?? row.title ?? "—").trim() || "—",
      }));
      const labelCounts = new Map<string, number>();
      for (const item of baseItems) {
        const key = item.label.toLocaleLowerCase();
        labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
      }
      const mapped = baseItems
        .map((item) => {
          const key = item.label.toLocaleLowerCase();
          const duplicated = (labelCounts.get(key) ?? 0) > 1;
          return {
            id: item.id,
            label: duplicated ? `${item.label} (${item.id.slice(0, 6)})` : item.label,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
      setJobOpeningOptions(mapped);
      setJobOpeningsLoadState("ok");
    } catch {
      setJobOpeningsLoadState("error");
    }
  }, []);

  useEffect(() => {
    if (!initialRows) {
      void fetchCandidates();
    }
    void fetchJobOpenings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("candidates-admin-table")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "candidates" },
        () => {
          void fetchCandidates();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, fetchCandidates]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [jdFilterKey]);

  useEffect(() => {
    setPage(1);
  }, [uploadDateRangeFilter]);

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

  const refreshCvHistoryForCandidate = useCallback(
    async (candidateId: string) => {
      await fetchCvHistoryForCandidate(candidateId, { showLoading: false });
    },
    [fetchCvHistoryForCandidate],
  );

  const allowedJobOpeningIds = useMemo(
    () => new Set(jobOpeningOptions.map((opt) => opt.id)),
    [jobOpeningOptions],
  );

  const tableSourceRows = useMemo(() => {
    const isAllowedJob = (jobOpeningId: string | null) => {
      if (!jobOpeningId) return false;
      if (jobOpeningsLoadState !== "ok") return true;
      return allowedJobOpeningIds.has(jobOpeningId);
    };

    if (dbLoadState === "error") {
      const rows = [...CANDIDATE_ROWS];
      rows.sort((a, b) => {
        const as = a.jdMatchScore ?? -1;
        const bs = b.jdMatchScore ?? -1;
        if (bs !== as) return bs - as;
        return a.name.localeCompare(b.name);
      });
      return rows.filter((row) => isAllowedJob(row.jobOpeningId));
    }
    if (dbLoadState !== "ok") {
      return [];
    }
    const sortedDb = [...dbRows].sort((a, b) => {
      const ta = new Date(a.cv_uploaded_at ?? a.created_at).getTime();
      const tb = new Date(b.cv_uploaded_at ?? b.created_at).getTime();
      return tb - ta;
    });
    return sortedDb
      .map(candidateDbRowToTableRow)
      .filter((row) => isAllowedJob(row.jobOpeningId));
  }, [allowedJobOpeningIds, dbLoadState, dbRows, jobOpeningsLoadState]);

  const statusFilterOptions = useMemo(() => {
    const available = new Set<CandidateStatus>();
    for (const row of tableSourceRows) {
      available.add(row.status);
    }
    return [
      { id: "all", label: "Status: All" },
      ...PIPELINE_STATUS_DISPLAY_ORDER.filter((status) => available.has(status)).map((status) => ({
        id: status,
        label: candidateStatusUiLabel(status),
      })),
    ];
  }, [tableSourceRows]);

  const jdFilterOptions = useMemo(
    () => [{ id: "all", label: "JD: All" }, ...jobOpeningOptions],
    [jobOpeningOptions],
  );

  useEffect(() => {
    if (statusKey == null || statusKey === "all") return;
    const isValid = statusFilterOptions.some((opt) => opt.id === statusKey);
    if (!isValid) setStatusKey("all");
  }, [statusFilterOptions, statusKey]);

  useEffect(() => {
    if (jdFilterKey == null || jdFilterKey === "all") return;
    const isValid = jdFilterOptions.some((opt) => opt.id === jdFilterKey);
    if (!isValid) setJdFilterKey("all");
  }, [jdFilterKey, jdFilterOptions]);

  const filteredRows = useMemo(() => {
    const keywords = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    return tableSourceRows.filter((row) => {
      if (statusKey != null && statusKey !== "all" && row.status !== statusKey) {
        return false;
      }
      if (jdFilterKey != null && jdFilterKey !== "all" && row.jobOpeningId !== String(jdFilterKey)) {
        return false;
      }
      if (uploadDateRangeFilter) {
        const key = uploadDateKeyLocal(row.cvUploadedAtIso);
        if (!key) return false;
        const from = uploadDateRangeFilter.start.toString();
        const to = uploadDateRangeFilter.end.toString();
        if (key < from || key > to) return false;
      }
      if (keywords.length === 0) return true;
      const hay = [
        row.name,
        row.role,
        ...row.skills,
        row.degree,
        row.school,
        row.sourceLabel,
        row.jdMatchLabel,
        row.jdCampaignLabel,
        candidateStatusSearchHaystack(row.status),
      ]
        .join(" ")
        .toLowerCase();
      return keywords.every((kw) => hay.includes(kw));
    });
  }, [jdFilterKey, query, statusKey, tableSourceRows, uploadDateRangeFilter]);

  const activeDbRow = useMemo(() => {
    if (!activeRow) return null;
    return dbRows.find((r) => r.id === activeRow.id) ?? null;
  }, [activeRow, dbRows]);

  const noResultsForUploadDate =
    uploadDateRangeFilter != null &&
    dbLoadState === "ok" &&
    filteredRows.length === 0 &&
    tableSourceRows.length > 0;

  function openRow(row: CandidateRow) {
    setStatusUpdateError(null);
    setActiveRow(row);
    setDrawerOpen(true);
  }

  const drawerStatusOptions = useMemo(() => {
    if (!activeRow) return [];
    return allowedTargetsFromStatus(activeRow.status);
  }, [activeRow]);

  const patchCandidateStatus = useCallback(
    async (candidateId: string, next: CandidateStatus) => {
      const current = dbRows.find((r) => r.id === candidateId);
      if (!current) return;
      const currentStatus = candidateDbRowToTableRow(current).status;
      if (currentStatus === next) return;

      if (!isPipelineTransitionAllowed(currentStatus, next)) {
        setStatusUpdateError(
          "That move is not allowed. Try another column or switch phase tabs.",
        );
        return;
      }

      setStatusUpdateError(null);
      setStatusUpdateBusy(true);
      try {
        const res = await fetch(`/api/admin/candidates/${candidateId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setStatusUpdateError(body.error ?? "Could not update status.");
          return;
        }
        const json = (await res.json()) as { candidate?: CandidateDbRow };
        const c = json.candidate;
        if (!c) {
          await fetchCandidates();
          return;
        }
        setDbRows((prev) => prev.map((r) => (r.id === c.id ? c : r)));
        setActiveRow((prev) =>
          prev?.id === c.id ? candidateDbRowToTableRow(c) : prev,
        );
      } catch {
        setStatusUpdateError("Could not update status.");
      } finally {
        setStatusUpdateBusy(false);
      }
    },
    [dbRows, fetchCandidates],
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
  }, [activeRow?.id, fetchCandidates, rowPendingDelete]);

  return {
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
    dbRows,
    jobOpeningOptions,
    jobOpeningsLoadState,
    dbLoadState,
    fetchCandidates,
    tableSourceRows,
    statusFilterOptions,
    jdFilterOptions,
    filteredRows,
    activeDbRow,
    noResultsForUploadDate,
    openRow,
    drawerStatusOptions,
    patchCandidateStatus,
    confirmDeleteCandidate,
  };
}
