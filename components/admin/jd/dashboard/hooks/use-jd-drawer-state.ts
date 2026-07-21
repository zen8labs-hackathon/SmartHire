import { useState, useEffect, useCallback } from "react";
import type { JobDescription } from "@/lib/jd/types";
import type { CampaignAppliedStageCountRow } from "@/lib/db/campaign-applied-list";
import { useToast } from "@/components/admin/toast-provider";

const JSON_HEADERS = { "Content-Type": "application/json" };

export type StageSubStageCount = CampaignAppliedStageCountRow;

export function useJdDrawerState(canManageJds: boolean) {
  const toast = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<JobDescription | null>(null);
  
  const [drawerStatusCounts, setDrawerStatusCounts] = useState<
    StageSubStageCount[] | null
  >(null);
  const [drawerStatusCountsError, setDrawerStatusCountsError] = useState<string | null>(null);

  const [drawerViewerEmails, setDrawerViewerEmails] = useState<string[]>([]);
  const [drawerViewerChapterIds, setDrawerViewerChapterIds] = useState<string[]>([]);
  const [drawerViewersLoading, setDrawerViewersLoading] = useState(false);
  const [drawerViewersBusy, setDrawerViewersBusy] = useState(false);
  const [drawerViewersError, setDrawerViewersError] = useState<string | null>(null);

  const authHeaders = useCallback(async () => JSON_HEADERS, []);

  // Load viewers
  useEffect(() => {
    if (!drawerOpen || !activeRow?.id || !canManageJds) {
      setDrawerViewerEmails([]);
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
        const res = await fetch(
          `/api/admin/job-descriptions/${activeRow.id}`,
          { credentials: "include" },
        );
        const json = (await res.json()) as {
          viewerEmails?: string[];
          viewerChapterIds?: string[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setDrawerViewersError(json.error ?? "Could not load viewers.");
          setDrawerViewerEmails([]);
          setDrawerViewerChapterIds([]);
          return;
        }
        setDrawerViewerEmails(json.viewerEmails ?? []);
        setDrawerViewerChapterIds(json.viewerChapterIds ?? []);
      } catch {
        if (!cancelled) {
          setDrawerViewersError("Could not load viewers.");
          setDrawerViewerEmails([]);
          setDrawerViewerChapterIds([]);
        }
      } finally {
        if (!cancelled) setDrawerViewersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, activeRow?.id, canManageJds]);

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
        const res = await fetch(
          `/api/admin/job-descriptions/${activeRow.id}/candidate-status-counts`,
          { credentials: "include" },
        );
        const json = (await res.json()) as {
          counts?: StageSubStageCount[];
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
  }, [drawerOpen, activeRow?.id]);

  const saveDrawerViewers = useCallback(async () => {
    if (!activeRow) return;
    setDrawerViewersBusy(true);
    setDrawerViewersError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/job-descriptions/${activeRow.id}`, {
        method: "PUT",
        credentials: "include",
        headers,
        body: JSON.stringify({
          viewerEmails: drawerViewerEmails,
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
        setDrawerViewerEmails(json.viewerEmails);
      }
      if (json.viewerChapterIds) {
        setDrawerViewerChapterIds(json.viewerChapterIds);
      }
      toast.success("Saved successfully.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed.";
      setDrawerViewersError(msg);
      toast.error(msg);
    } finally {
      setDrawerViewersBusy(false);
    }
  }, [activeRow, authHeaders, drawerViewerChapterIds, drawerViewerEmails, toast]);

  return {
    drawerOpen,
    setDrawerOpen,
    activeRow,
    setActiveRow,
    drawerStatusCounts,
    drawerStatusCountsError,
    drawerViewerEmails,
    setDrawerViewerEmails,
    drawerViewerChapterIds,
    setDrawerViewerChapterIds,
    drawerViewersLoading,
    drawerViewersBusy,
    drawerViewersError,
    saveDrawerViewers,
  };
}
