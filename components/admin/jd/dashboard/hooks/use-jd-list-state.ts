import { useState, useEffect, useCallback, useMemo } from "react";
import { useOverlayState } from "@heroui/react";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";
import { coerceJdStatus, type JobDescription, type JdStatus } from "@/lib/jd/types";
import { jdRowDate } from "../helpers";
import { utcDateStringToday } from "@/lib/jd/normalize-text";

export function useJdListState() {
  const supabase = useMemo(() => createClient(), []);
  
  const [rows, setRows] = useState<JobDescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        setDeletingId(null);
        setDeleteError(null);
      }
    },
  });

  const authHeaders = useCallback(async () => {
    const h = await getSessionAuthorizationHeaders(supabase);
    return { "Content-Type": "application/json", ...h };
  }, [supabase]);

  const loadDescriptions = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    setStatusUpdateError(null);
    try {
      const h = await getSessionAuthorizationHeaders(supabase);
      const res = await fetch("/api/admin/job-descriptions", {
        credentials: "include",
        headers: { ...h },
      });
      const json = (await res.json()) as {
        jobDescriptions?: JobDescription[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load.");
      setRows(
        (json.jobDescriptions ?? []).map((r) => {
          const row = r as JobDescription;
          return {
            ...row,
            status: coerceJdStatus(String(row.status)),
            start_date: jdRowDate(row.start_date),
            end_date: jdRowDate(row.end_date),
          };
        }),
      );
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadDescriptions();
  }, [loadDescriptions]);

  const updateJdStatus = useCallback(
    async (id: number, next: JdStatus, onUpdateActiveRow?: (normalized: JobDescription) => void) => {
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
          const normalized: JobDescription = {
            ...jd,
            status: coerceJdStatus(String(jd.status)),
            start_date: jdRowDate(jd.start_date),
            end_date: jdRowDate(jd.end_date),
          };
          setRows((rs) => rs.map((r) => (r.id === id ? normalized : r)));
          if (onUpdateActiveRow) onUpdateActiveRow(normalized);
        }
      } catch (e) {
        setRows((rs) =>
          rs.map((r) =>
            r.id === id
              ? { ...r, status: prevStatus!, end_date: prevEndDate }
              : r,
          ),
        );
        setStatusUpdateError(
          e instanceof Error ? e.message : "Status update failed.",
        );
      } finally {
        setStatusUpdatingId(null);
      }
    },
    [authHeaders],
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
      await loadDescriptions();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Unknown error.");
    }
  }, [authHeaders, deletingId, loadDescriptions]);

  return {
    rows,
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
