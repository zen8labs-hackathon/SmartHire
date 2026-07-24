import type { CvDetailRollbackSnapshot } from "@/lib/candidates/cv-detail-version-snapshot";
import type { CandidateCvHistoryRow } from "@/lib/candidates/cv-history-types";

export type CvManagementVersionKind =
  | "active"
  | "archived_cv"
  | "snapshot_event";

/** Canonical version card for the CV detail drawer (GET cv-history `versions`). */
export type CvManagementVersionListItem = {
  kind: CvManagementVersionKind;
  /** ISO string used for merge sort (newest first). */
  sortAt: string;
  isLatest: boolean;
  /** When kind === `archived_cv` */
  historyRow?: CandidateCvHistoryRow;
  /** When kind === `snapshot_event` — restore applies stored snapshot. */
  versionEventId?: string;
  eventType?: "profile_edit" | "pre_restore" | "full_restore";
  changeSummary?: string | null;
  snapshot?: CvDetailRollbackSnapshot;
  /** Active row id (same as request id when kind === `active`). */
  candidateId?: string;
};

function parseTs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Merges active row, replacement-chain CV history, and version events into
 * one timeline (newest first), then assigns isLatest.
 */
export function buildCvManagementVersionList(params: {
  activeCandidateId: string;
  activeSortAt: string;
  historyRowsNewestFirst: CandidateCvHistoryRow[];
  eventsNewestFirst: {
    id: number;
    version: number;
    eventType: "profile_edit" | "pre_restore" | "full_restore";
    changeSummary: string | null;
    createdAt: string;
    snapshot: CvDetailRollbackSnapshot;
  }[];
}): CvManagementVersionListItem[] {
  const { activeCandidateId, activeSortAt, historyRowsNewestFirst, eventsNewestFirst } =
    params;

  const raw: Omit<CvManagementVersionListItem, "isLatest">[] = [];

  raw.push({
    kind: "active",
    sortAt: activeSortAt,
    candidateId: activeCandidateId,
  });

  for (const h of historyRowsNewestFirst) {
    raw.push({
      kind: "archived_cv",
      sortAt: h.replacedAt ?? h.previousCvUploadedAt ?? "",
      historyRow: h,
    });
  }

  for (const ev of eventsNewestFirst) {
    raw.push({
      kind: "snapshot_event",
      sortAt: ev.createdAt,
      versionEventId: String(ev.id),
      eventType: ev.eventType,
      changeSummary: ev.changeSummary,
      snapshot: ev.snapshot,
    });
  }

  raw.sort((a, b) => parseTs(b.sortAt) - parseTs(a.sortAt));

  return raw.map((item, idx) => ({
    ...item,
    isLatest: idx === 0,
  }));
}
