import { useState, useEffect, useCallback, useRef, use } from "react";
import { useOverlayState } from "@heroui/react";
import type { CalendarDate } from "@internationalized/date";
import type { RangeValue } from "react-aria-components";
import { coerceJdStatus, type JobDescription, type JdStatus } from "@/lib/jd/types";
import {
  JD_LIST_PAGE_SIZE,
  type JobDescriptionListRow,
  type JobDescriptionsListPagination,
} from "@/lib/jd/list-with-enrichment";
import { jdRowDate } from "../helpers";
import { utcDateStringToday } from "@/lib/jd/normalize-text";
import { useToast } from "@/components/admin/toast-provider";

const EMPTY_STATUS_COUNTS: Record<JdStatus, number> = {
  Pending: 0,
  Hiring: 0,
  Done: 0,
  Closed: 0,
};

const EMPTY_PAGINATION: JobDescriptionsListPagination = {
  total: 0,
  limit: JD_LIST_PAGE_SIZE,
  offset: 0,
};

export type JdListInitialData = {
  jobDescriptions: JobDescriptionListRow[];
  pagination: JobDescriptionsListPagination;
  statusCounts: Record<JdStatus, number>;
};

export type JdListFilters = {
  page: number;
  debouncedJdListSearch: string;
  jdListStatusKey: string;
  jdStartDateRange: RangeValue<CalendarDate> | null;
  pageSize: number;
};

/** Normalizes a raw JD row (server- or client-fetched) into display shape. */
function normalizeJdRow<T extends JobDescription>(row: T): T {
  return {
    ...row,
    status: coerceJdStatus(String(row.status)),
    start_date: jdRowDate(row.start_date),
    end_date: jdRowDate(row.end_date),
  };
}

function buildJdListSearchParams(filters: JdListFilters): URLSearchParams {
  const params = new URLSearchParams();
  const q = filters.debouncedJdListSearch.trim();
  if (q) params.set("q", q);
  if (filters.jdListStatusKey !== "all") {
    params.set("status", filters.jdListStatusKey);
  }
  if (filters.jdStartDateRange) {
    params.set("startFrom", filters.jdStartDateRange.start.toString());
    params.set("startTo", filters.jdStartDateRange.end.toString());
  }
  params.set("limit", String(filters.pageSize));
  params.set("offset", String((filters.page - 1) * filters.pageSize));
  return params;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export function useJdListState(
  filters: JdListFilters,
  initialDataPromise?: Promise<JdListInitialData>,
) {
  const toast = useToast();

  // The GET route throws on error rather than resolving with `{ error }`
  // populated (see app/admin/jd/page.tsx), so this gives `use()` a real
  // rejection to propagate to the `SuspenseErrorBoundary` wrapping this
  // hook's caller. `use()` may be called conditionally (unlike other hooks),
  // so callers that don't have a promise yet (e.g. tests) still work via the
  // client-fetch fallback below.
  const initialData = initialDataPromise ? use(initialDataPromise) : undefined;

  const [rows, setRows] = useState<JobDescription[]>(() =>
    (initialData?.jobDescriptions ?? []).map(normalizeJdRow),
  );
  const [pagination, setPagination] = useState<JobDescriptionsListPagination>(() => ({
    total: initialData?.pagination?.total ?? 0,
    limit: initialData?.pagination?.limit ?? filters.pageSize,
    offset: initialData?.pagination?.offset ?? 0,
  }));
  const [statusCounts, setStatusCounts] = useState<Record<JdStatus, number>>(
    initialData?.statusCounts ?? EMPTY_STATUS_COUNTS,
  );
  const [loading, setLoading] = useState(!initialData);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const skipInitialFetchRef = useRef(Boolean(initialData));

  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  });

  const deleteModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        setDeletingId(null);
        setDeleteError(null);
      }
    },
  });

  const authHeaders = useCallback(async () => JSON_HEADERS, []);

  const loadDescriptions = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setFetchError(null);
    setStatusUpdateError(null);
    try {
      const params = buildJdListSearchParams(filtersRef.current);
      const res = await fetch(`/api/admin/job-descriptions?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        jobDescriptions?: JobDescription[];
        pagination?: JobDescriptionsListPagination;
        statusCounts?: Record<JdStatus, number>;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load.");
      setRows((json.jobDescriptions ?? []).map(normalizeJdRow));
      setPagination(json.pagination ?? { total: 0, limit: filters.pageSize, offset: 0 });
      setStatusCounts(json.statusCounts ?? EMPTY_STATUS_COUNTS);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return;
    }
    void loadDescriptions();
  }, [
    loadDescriptions,
    filters.page,
    filters.debouncedJdListSearch,
    filters.jdListStatusKey,
    filters.jdStartDateRange,
    filters.pageSize,
  ]);

  const updateJdStatus = useCallback(
    async (id: string, next: JdStatus, onUpdateActiveRow?: (normalized: JobDescription) => void) => {
      let prevStatus: JdStatus | null = null;
      let prevEndDate: string | null = null;
      setRows((rs) => {
        const row = rs.find((r) => r.id === id);
        if (!row || row.status === next) return rs;
        prevStatus = row.status;
        prevEndDate = row.end_date;
        const prevTerminal =
          row.status === "Done" || row.status === "Closed";
        const nextTerminal = next === "Done" || next === "Closed";
        let endDate = row.end_date;
        if (nextTerminal && !prevTerminal) {
          endDate = utcDateStringToday();
        } else if (!nextTerminal && prevTerminal) {
          endDate = null;
        }
        return rs.map((r) =>
          r.id === id ? { ...r, status: next, end_date: endDate } : r,
        );
      });
      if (prevStatus === null) return;

      setStatusUpdatingId(id);
      setStatusUpdateError(null);
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/admin/job-descriptions/${id}`, {
          method: "PUT",
          credentials: "include",
          headers,
          body: JSON.stringify({ status: next }),
        });
        const json = (await res.json()) as {
          error?: string;
          jobDescription?: JobDescription;
        };
        if (!res.ok) throw new Error(json.error ?? "Update failed.");
        if (json.jobDescription) {
          const jd = json.jobDescription;
          const normalized = normalizeJdRow(jd);
          setRows((rs) => rs.map((r) => (r.id === id ? normalized : r)));
          if (onUpdateActiveRow) onUpdateActiveRow(normalized);
        }
        toast.success(`Status updated to ${next}.`);
        // Status counts / totals may shift (e.g. status filter active); resync
        // quietly so the table doesn't flash a loading state for a change the
        // user already sees applied to the row.
        await loadDescriptions({ silent: true });
      } catch (e) {
        setRows((rs) =>
          rs.map((r) =>
            r.id === id
              ? { ...r, status: prevStatus!, end_date: prevEndDate }
              : r,
          ),
        );
        const msg = e instanceof Error ? e.message : "Status update failed.";
        setStatusUpdateError(msg);
        toast.error(msg);
      } finally {
        setStatusUpdatingId(null);
      }
    },
    [authHeaders, toast, loadDescriptions],
  );

  const confirmDelete = useCallback(async (onDeletedActiveRow?: () => void) => {
    if (!deletingId) return;
    setDeleteError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/job-descriptions/${deletingId}`, {
        method: "DELETE",
        credentials: "include",
        headers,
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Delete failed.");
      }
      if (onDeletedActiveRow) onDeletedActiveRow();
      deleteModal.close();
      await loadDescriptions();
      toast.success("Job description deleted successfully.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error.";
      setDeleteError(msg);
      toast.error(msg);
    }
  }, [authHeaders, deletingId, deleteModal, loadDescriptions, toast]);

  return {
    rows,
    pagination,
    statusCounts,
    loading,
    fetchError,
    statusUpdateError,
    statusUpdatingId,
    deletingId,
    deleteError,
    setDeletingId,
    deleteModal,
    authHeaders,
    loadDescriptions,
    updateJdStatus,
    confirmDelete,
  };
}
