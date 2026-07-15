"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOverlayTriggerState } from "react-stately";

import {
  Button,
  Card,
  Chip,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  Table,
  TextField,
} from "@heroui/react";

import type { CandidateDbRow, ParsingStatus } from "@/lib/candidates/db-row";
import type {
  DuplicateCandidateHit,
  DuplicateNewUploadPreview,
} from "@/lib/candidates/duplicate-detection";
import { CANDIDATE_SOURCE_VALUES } from "@/lib/candidates/source-constants";
import {
  MAX_CV_BYTES,
  isAllowedCvFilename,
} from "@/lib/candidates/upload-constants";
import { DuplicateCandidateModal } from "@/components/admin/candidates/duplicate-candidate-modal";
import {
  CvReviewSubModal,
  type CvReviewConfirmResult,
} from "@/components/admin/candidates/cv-review-sub-modal";
import { extractCvSignalsClientSide } from "@/lib/candidates/client-cv-extract";

type JobOpening = {
  id: string;
  title: string;
  status: string;
  /** Matches `job_descriptions.position` when linked; falls back to `title`. */
  displayTitle: string;
};

type UploadPhase =
  | "signing"
  | "uploading"
  | "awaiting-review"
  | "invoking"
  | "uploaded"
  | "error";

type QueueRow = {
  /** Client-side stable id -- a `campaign_applied` row (and `candidateId`)
   * only exists once the per-row review sub-modal's confirm succeeds. */
  rowId: string;
  candidateId?: string;
  tempKey?: string;
  mimeType: string | null;
  filename: string;
  size: number;
  addedAt: number;
  uploadPhase: UploadPhase;
  uploadError?: string;
  parsing_status: ParsingStatus;
  parsing_error?: string | null;
  prefillName?: string | null;
  prefillEmail?: string | null;
  prefillPhone?: string | null;
};

type DuplicateFlowState = {
  rowId: string;
  /** Null while blocked pre-confirm (no row created yet) -- set once the row
   * exists, either because this is the post-AI-parse safety-net hit or
   * because a bypass-confirm already created it. */
  candidateId: string | null;
  email: string | null;
  phone: string | null;
  hits: DuplicateCandidateHit[];
  newUpload: DuplicateNewUploadPreview;
};

type CommitAndProcessResult = {
  candidateId: string;
  duplicateCandidates: DuplicateCandidateHit[];
  duplicateNewUpload: DuplicateNewUploadPreview | null;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ts));
}

function progressForRow(row: QueueRow): { pct: number; label: string } {
  if (row.uploadPhase === "error") return { pct: 0, label: row.uploadError ?? "Upload failed" };
  if (row.uploadPhase === "signing")
    return { pct: 8, label: "Preparing upload…" };
  if (row.uploadPhase === "uploading")
    return { pct: 25, label: "Uploading file…" };
  if (row.uploadPhase === "awaiting-review")
    return { pct: 35, label: "Awaiting review…" };
  if (row.uploadPhase === "invoking")
    return { pct: 45, label: "Starting AI scan…" };
  if (row.parsing_status === "failed")
    return { pct: 100, label: "Parse failed" };
  if (row.parsing_status === "completed") return { pct: 100, label: "Done" };
  if (row.parsing_status === "processing") {
    return { pct: 72, label: "Parsing skills & experience…" };
  }
  return { pct: 45, label: "Queued for processing…" };
}

function statusChip(row: QueueRow): {
  label: string;
  color: "accent" | "success" | "danger" | "default";
} {
  if (row.uploadPhase === "error") {
    return { label: "Error", color: "danger" };
  }
  if (row.parsing_status === "failed") {
    return { label: "Error", color: "danger" };
  }
  if (row.parsing_status === "completed") {
    return { label: "Completed", color: "success" };
  }
  if (row.uploadPhase === "awaiting-review") {
    return { label: "Review needed", color: "default" };
  }
  return { label: "Scanning", color: "accent" };
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

/**
 * - `undefined` — Candidates page: choose a campaign before uploading.
 * - `{ jobOpeningId, title }` — Job description pipeline: uploads are tied to this opening (JD match + AI).
 * - `"no_opening_linked"` — JD context but no `job_openings` row points at this JD yet.
 */
export type JdPipelineCampaignOption =
  | { jobOpeningId: string; title: string }
  | "no_opening_linked";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCandidatesChanged?: () => void;
  /** After merging duplicate upload into an existing row (PUT update-with-history). */
  onDuplicateMergedToExisting?: (
    existingCandidateId: string,
    updatedCandidate?: CandidateDbRow,
    /** Staging row id merged away (removed from active list). */
    stagedNewCandidateId?: string,
  ) => void | Promise<void>;
  /** When set, target campaign is fixed (or uploads blocked until a campaign is linked). */
  jdPipelineCampaign?: JdPipelineCampaignOption;
};

export function AddCandidateModal({
  open,
  onOpenChange,
  onCandidatesChanged,
  onDuplicateMergedToExisting,
  jdPipelineCampaign,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<QueueRow[]>([]);
  const duplicatePayloadRef = useRef<DuplicateFlowState | null>(null);
  /** Candidate ids currently being merged via "Update CV" — the modal's own
   * parsing-status realtime effect should not independently trigger a list
   * refresh for these; `onDuplicateMergedToExisting` already handles it once
   * the merge finishes, so both firing at once causes double re-renders. */
  const duplicateMergeIdsRef = useRef<Set<string>>(new Set());
  /** DOM nodes for each queue row, keyed by `rowId` -- lets `ingestFile`
   * scroll a freshly-added row into view the moment it lands in the queue,
   * so the user sees confirmation their drop/selection actually registered. */
  const rowElRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  /** Row ids already scrolled-to-on-add, so re-renders of an existing row
   * (progress ticking, status changes) never re-trigger the scroll. */
  const scrolledRowIdsRef = useRef<Set<string>>(new Set());

  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [jobKey, setJobKey] = useState<string | null>(null);
  const [sourceKey, setSourceKey] = useState<string>(
    CANDIDATE_SOURCE_VALUES[0],
  );
  const [sourceOther, setSourceOther] = useState("");
  const [expectedSalary, setExpectedSalary] = useState("");
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [reviewingRowId, setReviewingRowId] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [duplicateFlow, setDuplicateFlow] = useState<DuplicateFlowState | null>(
    null,
  );
  const [duplicateSubmitting, setDuplicateSubmitting] = useState(false);

  const isJdPipeline = jdPipelineCampaign != null;
  const isCampaignLocked =
    isJdPipeline && typeof jdPipelineCampaign === "object";
  const isCampaignBlocked = jdPipelineCampaign === "no_opening_linked";

  /**
   * A row is "unconfirmed" once it's been temp-uploaded but hasn't gone
   * through `temp-upload/confirm` yet (no `candidateId`) -- closing now
   * would abandon it with no `campaign_applied` row ever created. Rows that
   * errored out before confirm have nothing left to lose by closing.
   */
  const handleModalOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        const hasUnconfirmed = queueRef.current.some(
          (r) => !r.candidateId && r.uploadPhase !== "error",
        );
        if (hasUnconfirmed && !confirm(
          "Some uploaded CVs haven't been confirmed yet and will be discarded from this session if you close now. Close anyway?",
        )) {
          return;
        }
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  const modalState = useOverlayTriggerState({
    isOpen: open,
    onOpenChange: handleModalOpenChange,
  });

  const selectedJobId =
    isCampaignLocked && typeof jdPipelineCampaign === "object"
      ? jdPipelineCampaign.jobOpeningId
      : jobKey;

  const isCampaignMissing = !isCampaignLocked && selectedJobId == null;
  const isUploadDisabled = isCampaignBlocked || isCampaignMissing;

  const selectableRows = queue.filter((r) => r.uploadPhase === "awaiting-review");
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selectedRowIds.has(r.rowId));

  /** Unmounts the duplicate modal right away so the upload queue/progress
   * underneath becomes visible while the merge/discard keeps running. */
  const closeDuplicateModal = useCallback(() => {
    setDuplicateFlow(null);
  }, []);

  /**
   * Marks a row processing and calls `POST .../[id]/process` (AI parse + JD
   * match + post-parse dedupe safety net) -- shared by the normal per-row
   * confirm path and the bypass-merge path, since both need this same call
   * once a row exists.
   */
  const triggerProcessing = useCallback(
    async (rowId: string, candidateId: string, runJdMatch: boolean) => {
      setQueue((q) =>
        q.map((r) =>
          r.rowId === rowId ? { ...r, uploadPhase: "invoking" as const } : r,
        ),
      );
      try {
        const procRes = await fetch(
          `/api/admin/candidates/${candidateId}/process`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runJdMatch }),
          },
        );
        const procJson = (await procRes.json()) as {
          error?: string;
          duplicateCandidates?: DuplicateCandidateHit[];
          duplicateNewUpload?: DuplicateNewUploadPreview | null;
        };
        if (!procRes.ok) {
          throw new Error(procJson.error ?? "Failed to start processing");
        }

        const hits = procJson.duplicateCandidates ?? [];
        if (hits.length > 0) {
          const newUpload: DuplicateNewUploadPreview =
            procJson.duplicateNewUpload ?? {
              email: null,
              phone: null,
              parsedRole: null,
              cvUploadedAt: null,
            };
          const flow: DuplicateFlowState = {
            rowId,
            candidateId,
            email: null,
            phone: null,
            hits,
            newUpload,
          };
          duplicatePayloadRef.current = flow;
          setDuplicateFlow(flow);
          return;
        }

        setQueue((q) =>
          q.map((r) =>
            r.rowId === rowId ? { ...r, uploadPhase: "uploaded" as const } : r,
          ),
        );
        onCandidatesChanged?.();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setQueue((q) =>
          q.map((r) =>
            r.rowId === rowId ? { ...r, uploadPhase: "error", uploadError: msg } : r,
          ),
        );
      }
    },
    [onCandidatesChanged],
  );

  /**
   * Bypass-confirms (skips the dedupe gate, since the user already saw the
   * duplicate warning) a row that's sitting at `awaiting-review`, then
   * processes it -- the "Update CV" path needs the row created *and parsed*
   * before it can be merged/linked, mirroring how the old sign-upload-based
   * flow always parsed before merging.
   */
  const commitAndProcessViaBypass = useCallback(
    async (
      row: QueueRow,
      email: string | null,
      phone: string | null,
    ): Promise<CommitAndProcessResult> => {
      if (!row.tempKey) throw new Error("Missing uploaded file reference.");
      const confirmRes = await fetch(
        "/api/admin/candidates/temp-upload/confirm",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tempKey: row.tempKey,
            filename: row.filename,
            mimeType: row.mimeType,
            jobId: selectedJobId,
            source: sourceKey,
            sourceOther: sourceKey === "Other" ? sourceOther.trim() : null,
            expectedSalary: expectedSalary.trim() || null,
            email,
            phone,
            bypassDuplicateCheck: true,
          }),
        },
      );
      const confirmJson = (await confirmRes.json()) as {
        error?: string;
        campaignAppliedId?: string;
        cvVersionId?: string;
      };
      if (!confirmRes.ok || !confirmJson.campaignAppliedId) {
        throw new Error(confirmJson.error ?? "Could not confirm this upload.");
      }
      const candidateId = confirmJson.campaignAppliedId;

      setQueue((q) =>
        q.map((r) =>
          r.rowId === row.rowId ? { ...r, candidateId } : r,
        ),
      );

      const procRes = await fetch(
        `/api/admin/candidates/${candidateId}/process`,
        { method: "POST", credentials: "include" },
      );
      const procJson = (await procRes.json()) as {
        error?: string;
        duplicateCandidates?: DuplicateCandidateHit[];
        duplicateNewUpload?: DuplicateNewUploadPreview | null;
      };
      if (!procRes.ok) {
        throw new Error(procJson.error ?? "Failed to start processing");
      }

      return {
        candidateId,
        duplicateCandidates: procJson.duplicateCandidates ?? [],
        duplicateNewUpload: procJson.duplicateNewUpload ?? null,
      };
    },
    [selectedJobId, sourceKey, sourceOther, expectedSalary],
  );

  const runDuplicateMerge = useCallback(async () => {
    const payload = duplicatePayloadRef.current;
    if (!payload) return;
    closeDuplicateModal();
    setDuplicateSubmitting(true);
    let candidateId = payload.candidateId;
    try {
      if (!candidateId) {
        const row = queueRef.current.find((r) => r.rowId === payload.rowId);
        if (!row) throw new Error("Missing uploaded file reference.");
        const result = await commitAndProcessViaBypass(
          row,
          payload.email,
          payload.phone,
        );
        candidateId = result.candidateId;
      }
      if (!candidateId) {
        throw new Error("Missing uploaded candidate to merge.");
      }

      const sameJobHit = payload.hits.find(
        (h) => h.jobOpeningId === selectedJobId,
      );

      if (!sameJobHit) {
        // Cross-job duplicate: keep this application (it's for a different
        // job), but repoint it onto the existing person instead of leaving
        // it under the throwaway blank candidate created for it.
        const existingCandidateId = payload.hits[0]?.candidateId;
        if (existingCandidateId) {
          const linkRes = await fetch(
            `/api/admin/candidates/${candidateId}/link-to-candidate`,
            {
              method: "PUT",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ existingCandidateId }),
            },
          );
          if (!linkRes.ok) {
            const linkJson = (await linkRes.json()) as { error?: string };
            throw new Error(
              linkJson.error ?? "Failed to link candidate profile",
            );
          }
        }
        setQueue((q) =>
          q.map((r) =>
            r.rowId === payload.rowId
              ? { ...r, uploadPhase: "uploaded" as const }
              : r,
          ),
        );
        onCandidatesChanged?.();
        return;
      }

      duplicateMergeIdsRef.current.add(candidateId);
      const repRes = await fetch(
        `/api/admin/candidates/${sameJobHit.id}/update-with-history`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCandidateId: candidateId,
            matchedOn: sameJobHit.matchedOn,
          }),
        },
      );
      const repJson = (await repRes.json()) as {
        error?: string;
        candidate?: CandidateDbRow;
      };
      if (!repRes.ok) {
        throw new Error(
          repJson.error ?? "Failed to merge duplicate into existing profile",
        );
      }
      if (onDuplicateMergedToExisting) {
        await onDuplicateMergedToExisting(
          sameJobHit.id,
          repJson.candidate,
          candidateId,
        );
      } else {
        onCandidatesChanged?.();
      }
      setQueue((q) =>
        q.map((r) =>
          r.rowId === payload.rowId
            ? { ...r, uploadPhase: "uploaded" as const }
            : r,
        ),
      );
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "Failed to update candidate profile",
      );
    } finally {
      if (candidateId) duplicateMergeIdsRef.current.delete(candidateId);
      setDuplicateSubmitting(false);
    }
  }, [
    closeDuplicateModal,
    onCandidatesChanged,
    onDuplicateMergedToExisting,
    commitAndProcessViaBypass,
    selectedJobId,
  ]);

  const runDiscardDuplicate = useCallback(async () => {
    const payload = duplicatePayloadRef.current;
    if (!payload) return;
    closeDuplicateModal();
    if (!payload.candidateId) {
      // Pre-confirm block: nothing was ever created, so there's nothing to
      // delete -- the abandoned temp object is left in place (cleanup
      // deferred, see CV9X7R vault notes).
      setQueue((q) =>
        q.map((r) =>
          r.rowId === payload.rowId
            ? { ...r, uploadPhase: "error", uploadError: "Discarded (duplicate)" }
            : r,
        ),
      );
      return;
    }
    setDuplicateSubmitting(true);
    try {
      const delRes = await fetch(
        `/api/admin/candidates/${payload.candidateId}/discard-duplicate`,
        { method: "DELETE", credentials: "include" },
      );
      if (!delRes.ok) {
        const delJson = (await delRes.json()) as { error?: string };
        throw new Error(
          delJson.error ?? "Failed to discard new duplicate candidate record",
        );
      }
      setQueue((prev) =>
        prev.map((r) =>
          r.rowId === payload.rowId
            ? {
                ...r,
                uploadPhase: "error",
                uploadError: "Removed due to duplicates",
              }
            : r,
        ),
      );
      onCandidatesChanged?.();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Đã có lỗi xảy ra");
    } finally {
      setDuplicateSubmitting(false);
    }
  }, [closeDuplicateModal, onCandidatesChanged]);

  const loadJobs = useCallback(async () => {
    const res = await fetch("/api/admin/job-openings", {
      credentials: "include",
    });
    if (!res.ok) return;
    const json = (await res.json()) as { jobOpenings?: JobOpening[] };
    const list = json.jobOpenings ?? [];
    setJobs(
      list.map((j) => ({
        ...j,
        displayTitle: j.displayTitle ?? j.title,
      })),
    );
  }, []);

  useEffect(() => {
    if (open && !isCampaignLocked) void loadJobs();
  }, [open, loadJobs, isCampaignLocked]);

  useEffect(() => {
    if (!open) return;
    if (isCampaignLocked && typeof jdPipelineCampaign === "object") {
      setJobKey(jdPipelineCampaign.jobOpeningId);
    }
  }, [open, isCampaignLocked, jdPipelineCampaign]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  /**
   * A row leaves "awaiting-review" (confirmed via the per-row button, via the
   * Review sub-modal, discarded, errored, merged as a duplicate...) from
   * several different code paths. Pruning `selectedRowIds` here in one place
   * -- rather than at each of those call sites -- keeps the bulk "Confirm &
   * Start AI Check" button in sync: without this, confirming one bulk-checked
   * row individually via the Review sub-modal left its id in the set, so the
   * button kept showing a stale count, enabled, with no spinner, for a row
   * that was already being processed.
   */
  useEffect(() => {
    setSelectedRowIds((prev) => {
      if (prev.size === 0) return prev;
      const stillSelectable = new Set(
        queue
          .filter((r) => r.uploadPhase === "awaiting-review")
          .map((r) => r.rowId),
      );
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (stillSelectable.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [queue]);

  /**
   * Scrolls a newly-added row into view as soon as it appears in the queue --
   * ref callbacks run before effects in the same commit, so by the time this
   * runs the row's `<tr>` is already mounted. Diffing against
   * `scrolledRowIdsRef` (rather than e.g. "last row in the array") means
   * later re-renders of that same row (progress %, status chip) never
   * re-trigger a scroll once it's already been shown.
   */
  useEffect(() => {
    const newRows = queue.filter((r) => !scrolledRowIdsRef.current.has(r.rowId));
    if (newRows.length === 0) return;
    for (const r of newRows) scrolledRowIdsRef.current.add(r.rowId);
    const target = rowElRefs.current.get(newRows[newRows.length - 1].rowId);
    target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [queue]);

  /**
   * Polls parsing status for queue rows still in flight. No realtime
   * push channel is available post-Supabase, so this fills that gap;
   * 3s is frequent enough to feel live without hammering the API.
   */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const poll = async () => {
      const pendingIds = queueRef.current
        .filter(
          (r) =>
            r.candidateId &&
            (r.parsing_status === "pending" || r.parsing_status === "processing"),
        )
        .map((r) => r.candidateId!);
      if (pendingIds.length === 0) return;

      await Promise.all(
        pendingIds.map(async (id) => {
          try {
            const res = await fetch(`/api/admin/candidates/${id}`, {
              credentials: "include",
            });
            if (!res.ok || cancelled) return;
            const json = (await res.json()) as {
              candidate?: {
                cv_parsing_status?: ParsingStatus;
                cv_parsing_error?: string | null;
              };
            };
            const next = json.candidate;
            if (!next || cancelled) return;
            setQueue((prev) =>
              prev.map((r) =>
                r.candidateId !== id
                  ? r
                  : {
                      ...r,
                      parsing_status: next.cv_parsing_status ?? r.parsing_status,
                      parsing_error:
                        next.cv_parsing_error ?? r.parsing_error,
                    },
              ),
            );
            if (
              (next.cv_parsing_status === "completed" ||
                next.cv_parsing_status === "failed") &&
              !duplicateMergeIdsRef.current.has(id)
            ) {
              onCandidatesChanged?.();
            }
          } catch {
            // best-effort; retried on next tick
          }
        }),
      );
    };

    const interval = setInterval(() => void poll(), 3000);
    void poll();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open, onCandidatesChanged]);

  const handleRowConfirmed = useCallback(
    (rowId: string, result: CvReviewConfirmResult) => {
      setReviewingRowId(null);
      setQueue((q) =>
        q.map((r) =>
          r.rowId === rowId ? { ...r, candidateId: result.campaignAppliedId } : r,
        ),
      );
      void triggerProcessing(rowId, result.campaignAppliedId, result.runJdMatch);
    },
    [triggerProcessing],
  );

  const handleRowDuplicateFound = useCallback(
    (
      rowId: string,
      hits: DuplicateCandidateHit[],
      newUpload: DuplicateNewUploadPreview | null,
      email: string | null,
      phone: string | null,
    ) => {
      setReviewingRowId(null);
      const flow: DuplicateFlowState = {
        rowId,
        candidateId: null,
        email,
        phone,
        hits,
        newUpload: newUpload ?? {
          email,
          phone,
          parsedRole: null,
          cvUploadedAt: null,
        },
      };
      duplicatePayloadRef.current = flow;
      setDuplicateFlow(flow);
    },
    [],
  );

  /**
   * Confirms a row without going through the review sub-modal -- used by
   * both the plain per-row "Confirm" action and the bulk "Confirm & Start AI
   * Check" action. `email`/`phone` here are only ever the unreviewed
   * client-side heuristic guess, so `basicInfoReviewed` is deliberately left
   * false/unset: `process/route.ts` then hands basic-info fully over to AI
   * instead of locking in a guess nobody actually checked. `runJdMatch` is
   * the caller's choice since the two buttons have different semantics (see
   * their `onPress` handlers below).
   */
  const confirmAndProcessRow = useCallback(
    async (
      rowId: string,
      tempKey: string,
      filename: string,
      mimeType: string | null,
      email: string | null,
      phone: string | null,
      runJdMatch: boolean,
    ) => {
      setQueue((q) =>
        q.map((r) =>
          r.rowId === rowId ? { ...r, uploadPhase: "invoking" as const } : r,
        ),
      );
      try {
        const confirmRes = await fetch(
          "/api/admin/candidates/temp-upload/confirm",
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tempKey,
              filename,
              mimeType,
              jobId: selectedJobId,
              source: sourceKey,
              sourceOther: sourceKey === "Other" ? sourceOther.trim() : null,
              expectedSalary: expectedSalary.trim() || null,
              email: email || null,
              phone: phone || null,
            }),
          },
        );
        const confirmJson = (await confirmRes.json()) as {
          error?: string;
          campaignAppliedId?: string;
          cvVersionId?: string;
          duplicateCandidates?: DuplicateCandidateHit[];
          duplicateNewUpload?: DuplicateNewUploadPreview | null;
        };

        if (confirmRes.status === 409) {
          setQueue((q) =>
            q.map((r) =>
              r.rowId === rowId
                ? { ...r, uploadPhase: "awaiting-review" as const }
                : r,
            ),
          );
          handleRowDuplicateFound(
            rowId,
            confirmJson.duplicateCandidates ?? [],
            confirmJson.duplicateNewUpload ?? null,
            email,
            phone,
          );
          return;
        }

        if (!confirmRes.ok || !confirmJson.campaignAppliedId) {
          throw new Error(confirmJson.error ?? "Could not confirm this upload.");
        }

        const candidateId = confirmJson.campaignAppliedId;
        setQueue((q) =>
          q.map((r) =>
            r.rowId === rowId ? { ...r, candidateId } : r,
          ),
        );

        await triggerProcessing(rowId, candidateId, runJdMatch);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setQueue((q) =>
          q.map((r) =>
            r.rowId === rowId ? { ...r, uploadPhase: "error", uploadError: msg } : r,
          ),
        );
      }
    },
    [
      selectedJobId,
      sourceKey,
      sourceOther,
      expectedSalary,
      handleRowDuplicateFound,
      triggerProcessing,
    ],
  );

  const handleBulkConfirm = useCallback(async () => {
    const ids = Array.from(selectedRowIds);
    if (ids.length === 0) return;

    setSelectedRowIds(new Set());

    await Promise.all(
      ids.map(async (rowId) => {
        const row = queueRef.current.find((r) => r.rowId === rowId);
        if (row && row.tempKey && row.uploadPhase === "awaiting-review") {
          await confirmAndProcessRow(
            row.rowId,
            row.tempKey,
            row.filename,
            row.mimeType,
            row.prefillEmail ?? null,
            row.prefillPhone ?? null,
            // This button is explicitly labeled "...& Start AI Check", so
            // unlike the plain per-row "Confirm" action, JD-match is expected.
            true,
          );
        }
      })
    );
  }, [selectedRowIds, confirmAndProcessRow]);

  const ingestFile = async (file: File) => {
    if (isCampaignBlocked) {
      window.alert(
        "Link a job campaign to this job first (Jobs list → publish / link opening), then try again.",
      );
      return;
    }
    if (isCampaignMissing) {
      window.alert("Select a target campaign before uploading CVs.");
      return;
    }
    if (!isAllowedCvFilename(file.name)) {
      window.alert("Only PDF or DOCX files are supported.");
      return;
    }
    if (file.size > MAX_CV_BYTES) {
      window.alert("File exceeds 25MB limit.");
      return;
    }
    if (sourceKey === "Other" && !sourceOther.trim()) {
      window.alert("Please describe where this candidate was sourced (Other).");
      return;
    }

    const rowId = crypto.randomUUID();

    // Best-effort client-side extraction, purely to prefill the review
    // sub-modal's email/phone fields instantly -- the server re-derives its
    // own heuristic at confirm time regardless, so a failure here just means
    // an empty prefill, not a blocked upload.
    let prefillName: string | null = null;
    let prefillEmail: string | null = null;
    let prefillPhone: string | null = null;
    try {
      const signals = await extractCvSignalsClientSide(file);
      prefillName = signals.name;
      prefillEmail = signals.email;
      prefillPhone = signals.phone;
    } catch {
      // ignore
    }

    setQueue((q) => [
      ...q,
      {
        rowId,
        mimeType: file.type || null,
        filename: file.name,
        size: file.size,
        addedAt: Date.now(),
        uploadPhase: "signing",
        parsing_status: "pending",
        prefillName,
        prefillEmail,
        prefillPhone,
      },
    ]);

    try {
      const signRes = await fetch("/api/admin/candidates/temp-upload", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type || null }),
      });
      const signJson = (await signRes.json()) as {
        error?: string;
        tempKey?: string;
        signedUrl?: string;
      };
      if (!signRes.ok || !signJson.tempKey || !signJson.signedUrl) {
        throw new Error(signJson.error ?? "Could not start upload");
      }

      setQueue((q) =>
        q.map((r) =>
          r.rowId === rowId
            ? { ...r, uploadPhase: "uploading" as const, tempKey: signJson.tempKey }
            : r,
        ),
      );

      const putRes = await fetch(signJson.signedUrl, {
        method: "PUT",
        body: file,
        headers: file.type ? { "Content-Type": file.type } : undefined,
      });
      if (!putRes.ok) {
        throw new Error("Could not upload file to storage.");
      }

      setQueue((q) =>
        q.map((r) =>
          r.rowId === rowId ? { ...r, uploadPhase: "awaiting-review" as const } : r,
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setQueue((q) =>
        q.map((r) =>
          r.rowId === rowId ? { ...r, uploadPhase: "error", uploadError: msg } : r,
        ),
      );
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    await Promise.all(list.map((f) => ingestFile(f)));
  };

  const reviewingRow = reviewingRowId
    ? (queue.find((r) => r.rowId === reviewingRowId) ?? null)
    : null;

  return (
    <>
      <Modal state={modalState}>
        <Modal.Backdrop className="bg-black/40 backdrop-blur-sm">
          <Modal.Container className="w-full">
            <Modal.Dialog className="!max-w-4xl max-h-[90vh] w-full min-w-0 overflow-hidden p-0">
              <Modal.CloseTrigger />
              <Modal.Header className="border-b border-divider px-6 py-5">
                <Modal.Heading className="text-xl">
                  Add candidates
                </Modal.Heading>
                <p className="mt-1 text-sm text-muted">
                  {isCampaignLocked
                    ? "CVs are linked to this job description’s campaign for parsing and JD match scoring."
                    : "Upload CVs to private storage; AI extracts profile fields in the background."}
                </p>
              </Modal.Header>
              <Modal.Body className="max-h-[min(78vh,880px)] space-y-5 overflow-y-auto px-6 py-5">
                {isCampaignBlocked ? (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
                    <p className="font-semibold text-amber-900 dark:text-amber-100">
                      No campaign linked yet
                    </p>
                    <p className="mt-1 text-muted">
                      Create or link a job opening to this job description from{" "}
                      <span className="font-medium text-foreground">
                        Jobs list
                      </span>{" "}
                      so uploads can be tied to the JD (required for AI match
                      scoring).
                    </p>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:grid-rows-1 md:items-stretch md:gap-6">
                  <div className="flex min-h-0 min-w-0 flex-col gap-4 md:h-full">
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Target campaign
                        {!isCampaignLocked ? (
                          <span className="ml-1 text-danger">*</span>
                        ) : null}
                      </Label>
                      {isCampaignLocked &&
                      typeof jdPipelineCampaign === "object" ? (
                        <div className="mt-2 rounded-xl border border-divider bg-surface-secondary px-3 py-2.5 text-sm text-foreground">
                          <span className="font-medium">
                            {jdPipelineCampaign.title}
                          </span>
                          <p className="mt-1 text-xs text-muted">
                            Fixed for this job description — candidates are
                            eligible for JD-based AI evaluation.
                          </p>
                        </div>
                      ) : (
                        <Select
                          placeholder="Select a campaign…"
                          value={jobKey}
                          onChange={(key) => {
                            if (typeof key === "string") setJobKey(key);
                          }}
                          className="mt-2"
                        >
                          <Select.Trigger className="w-full min-w-0">
                            <Select.Value />
                            <Select.Indicator />
                          </Select.Trigger>
                          <Select.Popover>
                            <ListBox>
                              {jobs.map((j) => (
                                <ListBox.Item
                                  key={j.id}
                                  id={j.id}
                                  textValue={j.displayTitle}
                                >
                                  {j.displayTitle}
                                  <ListBox.ItemIndicator />
                                </ListBox.Item>
                              ))}
                            </ListBox>
                          </Select.Popover>
                        </Select>
                      )}
                      {isCampaignMissing ? (
                        <p className="mt-1.5 text-xs text-muted">
                          Required before you can upload CVs.
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Sourced from
                      </Label>
                      <Select
                        value={sourceKey}
                        onChange={(k) => {
                          const next = String(k ?? CANDIDATE_SOURCE_VALUES[0]);
                          setSourceKey(next);
                          if (next !== "Other") setSourceOther("");
                        }}
                        className="mt-2"
                      >
                        <Select.Trigger className="w-full min-w-0">
                          <Select.Value />
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            {CANDIDATE_SOURCE_VALUES.map((s) => (
                              <ListBox.Item key={s} id={s} textValue={s}>
                                {s}
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                      {sourceKey === "Other" ? (
                        <TextField className="mt-3">
                          <Label className="text-xs text-muted">
                            Describe the source
                          </Label>
                          <Input
                            value={sourceOther}
                            onChange={(e) => setSourceOther(e.target.value)}
                            placeholder="e.g. University career fair, referral name…"
                            className="mt-1"
                          />
                        </TextField>
                      ) : null}
                    </div>

                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Expected salary{" "}
                        <span className="font-normal normal-case text-muted/70">
                          (optional)
                        </span>
                      </Label>
                      <TextField className="mt-2">
                        <Input
                          value={expectedSalary}
                          onChange={(e) => setExpectedSalary(e.target.value)}
                          placeholder="e.g. 18-20 triệu, negotiable…"
                        />
                      </TextField>
                      <p className="mt-1.5 text-xs text-muted">
                        Only visible to HR and the chapter head in the
                        evaluation view.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Card variant="secondary">
                        <Card.Content className="gap-1 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                            Queue total
                          </p>
                          <p className="text-2xl font-semibold tabular-nums text-foreground">
                            {queue.length}
                          </p>
                        </Card.Content>
                      </Card>
                      <Card variant="secondary">
                        <Card.Content className="gap-1 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                            Storage
                          </p>
                          <p className="text-2xl font-semibold tabular-nums text-foreground">
                            —
                          </p>
                          <p className="text-[10px] text-muted">
                            Per-project metrics
                          </p>
                        </Card.Content>
                      </Card>
                    </div>
                  </div>

                  <div className="flex min-h-[220px] flex-col md:h-full md:min-h-0">
                    <div
                      className={`flex h-full min-h-[220px] flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors md:min-h-0 md:py-8 ${
                        isUploadDisabled
                          ? "border-divider bg-content2/20 opacity-50"
                          : dragOver
                            ? "border-accent bg-accent/5"
                            : "border-divider bg-content2/30"
                      }`}
                      onDragEnter={(e) => {
                        if (isUploadDisabled) return;
                        e.preventDefault();
                        setDragOver(true);
                      }}
                      onDragOver={(e) => {
                        if (isUploadDisabled) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "copy";
                        setDragOver(true);
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        if (isUploadDisabled) return;
                        e.preventDefault();
                        setDragOver(false);
                        void handleFiles(e.dataTransfer.files);
                      }}
                    >
                      <p className="text-sm font-semibold text-foreground">
                        {isCampaignMissing
                          ? "Select a target campaign first"
                          : "Drop CVs here to start ingestion"}
                      </p>
                      <p className="mt-2 max-w-sm text-xs text-muted">
                        {isCampaignMissing
                          ? "Choose a campaign on the left, then upload PDF or DOCX files (max 25MB each)."
                          : "Files land in a private staging area; review and confirm each one before AI parsing starts. Select or drop one or more PDF or DOCX files (max 25MB each)."}
                      </p>
                      <div className="mt-4 flex justify-center">
                        <Button
                          variant="primary"
                          onPress={() => fileInputRef.current?.click()}
                          isDisabled={isUploadDisabled}
                        >
                          Select files
                        </Button>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files;
                          if (f?.length) void handleFiles(f);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Active upload queue
                      </h3>
                      <p className="text-xs text-muted">
                        Files awaiting review need your confirmation before AI
                        parsing starts.
                      </p>
                    </div>
                    {selectedRowIds.size > 0 && (
                      <Button
                        size="sm"
                        variant="primary"
                        onPress={handleBulkConfirm}
                      >
                        Confirm & Start AI Check ({selectedRowIds.size})
                      </Button>
                    )}
                  </div>

                  <Card variant="secondary" className="overflow-hidden">
                    <Card.Content className="gap-0 p-0">
                      <Table>
                        <Table.ScrollContainer>
                          <Table.Content
                            aria-label="Upload queue"
                            className="min-w-[640px]"
                          >
                            <Table.Header>
                              <Table.Column width={40}>
                                <input
                                  type="checkbox"
                                  className="size-3.5 rounded border-divider accent-accent cursor-pointer"
                                  checked={allSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedRowIds(new Set(selectableRows.map((r) => r.rowId)));
                                    } else {
                                      setSelectedRowIds(new Set());
                                    }
                                  }}
                                />
                              </Table.Column>
                              <Table.Column isRowHeader>File</Table.Column>
                              <Table.Column>Upload date</Table.Column>
                              <Table.Column>Progress</Table.Column>
                              <Table.Column>Status</Table.Column>
                            </Table.Header>
                            <Table.Body>
                              {queue.length === 0 ? (
                                <Table.Row id="empty">
                                  <Table.Cell
                                    colSpan={5}
                                    className="text-center text-sm text-muted"
                                  >
                                    No files in this session yet.
                                  </Table.Cell>
                                </Table.Row>
                              ) : (
                                queue.map((row) => {
                                  const { pct, label } = progressForRow(row);
                                  const chip = statusChip(row);
                                  return (
                                    <Table.Row key={row.rowId} id={row.rowId}>
                                      <Table.Cell
                                        ref={(el: HTMLTableCellElement | null) => {
                                          // `Table.Row` (react-aria-components) doesn't
                                          // forward a plain `ref` prop to its rendered
                                          // `<tr>` -- `Table.Cell`'s HeroUI wrapper does
                                          // forward it, so anchor here and walk up.
                                          const tr = el?.closest("tr") ?? null;
                                          if (tr) rowElRefs.current.set(row.rowId, tr);
                                          else rowElRefs.current.delete(row.rowId);
                                        }}
                                      >
                                        {row.uploadPhase === "awaiting-review" ? (
                                          <input
                                            type="checkbox"
                                            className="size-3.5 rounded border-divider accent-accent cursor-pointer"
                                            checked={selectedRowIds.has(row.rowId)}
                                            onChange={(e) => {
                                              const next = new Set(selectedRowIds);
                                              if (e.target.checked) {
                                                next.add(row.rowId);
                                              } else {
                                                next.delete(row.rowId);
                                              }
                                              setSelectedRowIds(next);
                                            }}
                                          />
                                        ) : (
                                          <div className="w-3.5" />
                                        )}
                                      </Table.Cell>
                                      <Table.Cell>
                                        <div className="flex items-center gap-3">
                                          <FileIcon className="size-8 shrink-0 text-muted" />
                                          <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-foreground">
                                              {row.filename}
                                            </p>
                                            <p className="text-[10px] text-muted">
                                              {formatBytes(row.size)}
                                              {row.uploadError &&
                                              row.uploadPhase === "error"
                                                ? ` · ${row.uploadError}`
                                                : ""}
                                            </p>
                                          </div>
                                        </div>
                                      </Table.Cell>
                                      <Table.Cell className="text-sm text-muted">
                                        {formatDate(row.addedAt)}
                                      </Table.Cell>
                                      <Table.Cell>
                                        <div className="max-w-[200px] space-y-1">
                                          <div className="h-1.5 overflow-hidden rounded-full bg-content3">
                                            <div
                                              className="h-full rounded-full bg-accent transition-[width] duration-300"
                                              style={{ width: `${pct}%` }}
                                            />
                                          </div>
                                          <p className="text-[10px] font-bold uppercase tracking-tight text-muted">
                                            {label}
                                          </p>
                                        </div>
                                      </Table.Cell>
                                      <Table.Cell>
                                        {row.uploadPhase === "awaiting-review" ? (
                                          <div className="flex items-center gap-2">
                                            <Button
                                              size="sm"
                                              variant="secondary"
                                              onPress={() => setReviewingRowId(row.rowId)}
                                            >
                                              Review
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="primary"
                                              onPress={() => {
                                                if (row.tempKey) {
                                                  void confirmAndProcessRow(
                                                    row.rowId,
                                                    row.tempKey,
                                                    row.filename,
                                                    row.mimeType,
                                                    row.prefillEmail ?? null,
                                                    row.prefillPhone ?? null,
                                                    // Plain "Confirm" doesn't
                                                    // advertise an AI check --
                                                    // matches the review
                                                    // sub-modal's opt-in
                                                    // default of false.
                                                    false,
                                                  );
                                                }
                                              }}
                                            >
                                              Confirm
                                            </Button>
                                          </div>
                                        ) : (
                                          <Chip
                                            size="sm"
                                            variant="soft"
                                            color={chip.color}
                                            className="text-[10px] font-bold uppercase"
                                          >
                                            {chip.label}
                                          </Chip>
                                        )}
                                      </Table.Cell>
                                    </Table.Row>
                                  );
                                })
                              )}
                            </Table.Body>
                          </Table.Content>
                        </Table.ScrollContainer>
                      </Table>
                    </Card.Content>
                  </Card>
                </div>
              </Modal.Body>
              <Modal.Footer className="border-t border-divider px-6 py-4">
                <Button slot="close" variant="secondary">
                  Close
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      {reviewingRow && reviewingRow.tempKey ? (
        <CvReviewSubModal
          key={reviewingRow.rowId}
          open
          tempKey={reviewingRow.tempKey}
          filename={reviewingRow.filename}
          mimeType={reviewingRow.mimeType}
          prefillName={reviewingRow.prefillName ?? null}
          prefillEmail={reviewingRow.prefillEmail ?? null}
          prefillPhone={reviewingRow.prefillPhone ?? null}
          jobId={selectedJobId ?? ""}
          source={sourceKey}
          sourceOther={sourceKey === "Other" ? sourceOther.trim() : null}
          expectedSalary={expectedSalary.trim() || null}
          onConfirmed={(result) => handleRowConfirmed(reviewingRow.rowId, result)}
          onDuplicateFound={(hits, newUpload, email, phone) =>
            handleRowDuplicateFound(reviewingRow.rowId, hits, newUpload, email, phone)
          }
          onDiscard={() => {
            setReviewingRowId(null);
            setQueue((q) =>
              q.map((r) =>
                r.rowId === reviewingRow.rowId
                  ? { ...r, uploadPhase: "error", uploadError: "Discarded" }
                  : r,
              ),
            );
          }}
          onCancel={() => setReviewingRowId(null)}
        />
      ) : null}
      {duplicateFlow ? (
        <DuplicateCandidateModal
          key={duplicateFlow.rowId}
          open
          onOpenChange={() => {}}
          hits={duplicateFlow.hits}
          newUpload={duplicateFlow.newUpload}
          currentJobTitle={
            jobs.find((j) => j.id === selectedJobId)?.displayTitle ||
            (isCampaignLocked && typeof jdPipelineCampaign === "object"
              ? jdPipelineCampaign.title
              : "") ||
            "Chiến dịch hiện tại"
          }
          isSubmitting={duplicateSubmitting}
          willMergeIntoExisting={duplicateFlow.hits.some(
            (h) => h.jobOpeningId === selectedJobId,
          )}
          onUpdateProfile={runDuplicateMerge}
          onDiscard={runDiscardDuplicate}
        />
      ) : null}
    </>
  );
}
