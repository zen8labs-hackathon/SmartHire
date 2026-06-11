import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";
import { parseViewerEmailInput } from "@/lib/admin/jd-viewer-sync";
import type { JobDescription } from "@/lib/jd/types";

export function useJdDrawerState(canManageJds: boolean) {
  const supabase = useMemo(() => createClient(), []);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<JobDescription | null>(null);
  
  const [drawerStatusCounts, setDrawerStatusCounts] = useState<Record<string, number> | null>(null);
  const [drawerStatusCountsError, setDrawerStatusCountsError] = useState<string | null>(null);

  const [drawerViewerDraft, setDrawerViewerDraft] = useState("");
  const [drawerViewerChapterIds, setDrawerViewerChapterIds] = useState<string[]>([]);
  const [drawerViewersLoading, setDrawerViewersLoading] = useState(false);
  const [drawerViewersBusy, setDrawerViewersBusy] = useState(false);
  const [drawerViewersError, setDrawerViewersError] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const h = await getSessionAuthorizationHeaders(supabase);
    return { "Content-Type": "application/json", ...h };
  }, [supabase]);

  // Load viewers
  useEffect(() => {
    if (!drawerOpen || !activeRow?.id || !canManageJds) {
      setDrawerViewerDraft("");
      setDrawerViewerChapterIds([]);
      setDrawerViewersError(null);
      setDrawerViewersLoading(false);
      return;
    }
    let cancelled = false;
    setDrawerViewersLoading(true);
    setDrawerViewersError(null);
    void (async () => {
      try {
        const h = await getSessionAuthorizationHeaders(supabase);
        const res = await fetch(
          `/api/admin/job-descriptions/${activeRow.id}`,
          { credentials: "include", headers: { ...h } },
        );
        const json = (await res.json()) as {
          viewerEmails?: string[];
          viewerChapterIds?: string[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setDrawerViewersError(json.error ?? "Could not load viewers.");
          setDrawerViewerDraft("");
          setDrawerViewerChapterIds([]);
          return;
        }
        setDrawerViewerDraft((json.viewerEmails ?? []).join("\n"));
        setDrawerViewerChapterIds(json.viewerChapterIds ?? []);
      } catch {
        if (!cancelled) {
          setDrawerViewersError("Could not load viewers.");
          setDrawerViewerDraft("");
          setDrawerViewerChapterIds([]);
        }
      } finally {
        if (!cancelled) setDrawerViewersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, activeRow?.id, canManageJds, supabase]);

  // Load status counts
  useEffect(() => {
    if (!drawerOpen || !activeRow) {
      setDrawerStatusCounts(null);
      setDrawerStatusCountsError(null);
      return;
    }
    let cancelled = false;
    setDrawerStatusCounts(null);
    setDrawerStatusCountsError(null);
    void (async () => {
      try {
        const h = await getSessionAuthorizationHeaders(supabase);
        const res = await fetch(
          `/api/admin/job-descriptions/${activeRow.id}/candidate-status-counts`,
          { credentials: "include", headers: { ...h } },
        );
        const json = (await res.json()) as {
          counts?: Record<string, number>;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setDrawerStatusCountsError(
            json.error ?? "Could not load applicant counts.",
          );
          return;
        }
        setDrawerStatusCounts(json.counts ?? null);
      } catch {
        if (!cancelled) {
          setDrawerStatusCountsError("Could not load applicant counts.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, activeRow?.id, supabase]);

  const saveDrawerViewers = useCallback(async () => {
    if (!activeRow) return;
    setDrawerViewersBusy(true);
    setDrawerViewersError(null);
    try {
      const headers = await authHeaders();
      const emails = parseViewerEmailInput(drawerViewerDraft);
      const res = await fetch(`/api/admin/job-descriptions/${activeRow.id}`, {
        method: "PUT",
        credentials: "include",
        headers,
        body: JSON.stringify({
          viewerEmails: emails,
          viewerChapterIds: drawerViewerChapterIds,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        viewerEmails?: string[];
        viewerChapterIds?: string[];
      };
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      if (json.viewerEmails) {
        setDrawerViewerDraft(json.viewerEmails.join("\n"));
      }
      if (json.viewerChapterIds) {
        setDrawerViewerChapterIds(json.viewerChapterIds);
      }
    } catch (e) {
      setDrawerViewersError(
        e instanceof Error ? e.message : "Save failed.",
      );
    } finally {
      setDrawerViewersBusy(false);
    }
  }, [activeRow, authHeaders, drawerViewerChapterIds, drawerViewerDraft]);

  return {
    drawerOpen,
    setDrawerOpen,
    activeRow,
    setActiveRow,
    drawerStatusCounts,
    drawerStatusCountsError,
    drawerViewerDraft,
    setDrawerViewerDraft,
    drawerViewerChapterIds,
    setDrawerViewerChapterIds,
    drawerViewersLoading,
    drawerViewersBusy,
    drawerViewersError,
    saveDrawerViewers,
  };
}
