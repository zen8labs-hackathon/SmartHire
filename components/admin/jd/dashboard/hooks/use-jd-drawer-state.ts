import { useState, useEffect } from "react";
import type { JobDescription } from "@/lib/jd/types";
import type { CampaignAppliedStageCountRow } from "@/lib/db/campaign-applied-list";

export type StageSubStageCount = CampaignAppliedStageCountRow;

export function useJdDrawerState() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<JobDescription | null>(null);

  const [drawerStatusCounts, setDrawerStatusCounts] = useState<
    StageSubStageCount[] | null
  >(null);
  const [drawerStatusCountsError, setDrawerStatusCountsError] = useState<
    string | null
  >(null);

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

  return {
    drawerOpen,
    setDrawerOpen,
    activeRow,
    setActiveRow,
    drawerStatusCounts,
    drawerStatusCountsError,
  };
}
