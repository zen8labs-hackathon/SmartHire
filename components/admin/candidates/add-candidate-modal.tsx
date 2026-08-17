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

import type {
  CandidateDbRow,
  JdMatchStatus,
  ParsingStatus,
} from "@/lib/candidates/db-row";
import type {
  DuplicateCandidateHit,
  DuplicateMatchedOn,
  DuplicateNewUploadPreview,
} from "@/lib/candidates/duplicate-detection";
import { CANDIDATE_SOURCE_VALUES } from "@/lib/candidates/source-constants";

import {
  MAX_CV_BYTES,
  isAllowedCvFilename,
} from "@/lib/candidates/upload-constants";
import { extractCvSignalsClientSide } from "@/lib/candidates/client-cv-extract";
import { useToast } from "@/components/admin/toast-provider";
import { CvUploadHistorySubModal } from "@/components/admin/candidates/cv-upload-history-sub-modal";

type JobOpening = {
  id: string;
  title: string;
  status: string;
  /** Matches `job_descriptions.position` when linked; falls back to `title`. */
  displayTitle: string;
};

type UploadPhase = "signing" | "uploading" | "invoking" | "uploaded" | "error";

type QueueRow = {
  /** Client-side stable id -- a `campaign_applied` row (and `candidateId`)
   * only exists once the upload auto-confirms, right after the S3 PUT
   * succeeds. */
  rowId: string;
  candidateId?: string;
  /** Set once this row's upload is auto-merged as a new version onto an
   * *existing* application for the same job (see `autoResolveDuplicate`) --
   * at that point `candidateId` points at the now-deleted throwaway row, so
   * CV history must be looked up by this id instead. */
  mergedApplicationId?: string;
  tempKey?: string;
  /** Kept so a failed row can be retried without asking the user to
   * re-select the file. */
  file: File;
  mimeType: string | null;
  filename: string;
  size: number;
  addedAt: number;
  uploadPhase: UploadPhase;
  uploadError?: string;
  parsing_status: ParsingStatus;
  parsing_error?: string | null;
  /** JD-match is a second, independent LLM call that runs after parsing
   * succeeds -- it can fail on its own even when `parsing_status` is
   * `"completed"`, so it needs its own failure tracking rather than being
   * folded into `parsing_status`. `null`/`undefined` means it hasn't run
   * (skipped, not requested, or not reached yet) rather than failed. */
  jdMatchStatus?: JdMatchStatus | null;
  jdMatchError?: string | null;
  /** Best-known name/email/phone for this CV -- seeded from the client-side
   * heuristic guess at ingest time, then overwritten with the authoritative
   * AI-parsed values once `/process` finishes (see `refreshRowContactInfo`).
   * Displayed as columns in the upload queue table. */
  prefillName?: string | null;
  prefillEmail?: string | null;
  prefillPhone?: string | null;
  /**
   * True when dedupe found an existing person by email and/or phone (CV
   * bytes/content may differ). Drives the Exists column + amber row highlight
   * so recruiters see "this candidate is already in the system" after parse.
   */
  existsByContact?: boolean;
  /** Which contact signal(s) triggered `existsByContact`, for the Exists chip. */
  existsMatchedOn?: Extract<
    DuplicateMatchedOn,
    "email" | "phone" | "email_or_phone"
  >;
};

type CommitAndProcessResult = {
  candidateId: string;
  duplicateCandidates: DuplicateCandidateHit[];
  duplicateNewUpload: DuplicateNewUploadPreview | null;
  jdMatchError: string | null;
};

/** Shape of the `jdMatch` field on `/api/admin/candidates/[id]/process`'s
 * response body -- present on every response since the parse step (which
 * *can* fail the request outright) always runs first. */
type ProcessJdMatchResult =
  | { skipped: true; reason: string }
  | { skipped: false; score: number }
  | { error: string };

function jdMatchErrorFromResponse(
  jdMatch: ProcessJdMatchResult | undefined,
): string | null {
  return jdMatch && "error" in jdMatch ? jdMatch.error : null;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function dash(v: string | null | undefined): string {
  if (v == null || v.trim() === "") return "—";
  return v;
}

/** Contact-only duplicate (not file/content hash): person already in system. */
function contactExistsMatchedOn(
  hits: DuplicateCandidateHit[],
): Extract<DuplicateMatchedOn, "email" | "phone" | "email_or_phone"> | null {
  for (const hit of hits) {
    if (
      hit.matchedOn === "email" ||
      hit.matchedOn === "phone" ||
      hit.matchedOn === "email_or_phone"
    ) {
      return hit.matchedOn;
    }
  }
  return null;
}

/** Caps how many `/process` calls (AI resume parsing + JD-match, both LLM
 * calls) run at once. Every CV now auto-triggers processing the moment its
 * upload finishes with no manual per-row/bulk confirm step to naturally
 * pace it, so dropping many files at once used to fire one `/process` call
 * per file in parallel and trip the LLM provider's rate limit -- this
 * throttles just that fetch, not the (unrelated) sign/upload/confirm steps. */
const AI_PROCESS_CONCURRENCY = 3;

function createSemaphore(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  function acquire(): Promise<void> {
    if (active < limit) {
      active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => queue.push(resolve));
  }

  function release() {
    const next = queue.shift();
    if (next) {
      next();
    } else {
      active--;
    }
  }

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}

const aiProcessSemaphore = createSemaphore(AI_PROCESS_CONCURRENCY);

/** Single source of truth for "this row needs attention/retry" -- covers
 * every stage that can independently fail: the upload/confirm/process
 * request itself, CV parsing, and JD-match (a second, separate LLM call
 * that can fail even when parsing succeeded, since it isn't folded into
 * `parsing_status`). Used by the status chip, the "Failed" count, the
 * end-of-queue toast, and "Retry all failed" -- previously these each had
 * their own slightly different (and drifted) definition of "failed", so
 * e.g. a JD-match failure showed an "Error" chip and was counted in
 * "Retry all failed (N)" but was silently never actually retried by it.
 */
function isRowFailed(row: QueueRow): boolean {
  return (
    row.uploadPhase === "error" ||
    row.parsing_status === "failed" ||
    row.jdMatchStatus === "failed"
  );
}

/** The message to show under the filename for a failed row -- whichever
 * stage actually failed. */
function rowErrorMessage(row: QueueRow): string | null {
  if (row.uploadPhase === "error") return row.uploadError ?? null;
  if (row.parsing_status === "failed") return row.parsing_error ?? null;
  if (row.jdMatchStatus === "failed") return row.jdMatchError ?? null;
  return null;
}

function statusChip(row: QueueRow): {
  label: string;
  color: "accent" | "success" | "danger" | "default";
} {
  if (isRowFailed(row)) {
    return { label: "Error", color: "danger" };
  }
  if (row.uploadPhase === "uploaded") {
    return { label: "Completed", color: "success" };
  }
  return { label: "Scanning", color: "accent" };
}

/** True while upload/parse/dedupe is still in flight — not completed and not
 * failed. Drives close-button lock and running borders on queue panels. */
function isQueueRowInProgress(row: QueueRow): boolean {
  return row.uploadPhase !== "uploaded" && !isRowFailed(row);
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

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 12a9 9 0 1 0 2.64-6.36" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

/**
 * - `undefined` — Candidates page: a campaign is optional. Uploading with no
 *   job selected banks the CV in the unassigned candidate pool (CJ4X9M) --
 *   it can be assigned to a job later from the candidate's profile.
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
  const [runJdMatchOnUpload, setRunJdMatchOnUpload] = useState(true);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  /** Row ids currently being auto-resolved as a duplicate (merged as a new
   * CV version onto an existing application for this job, or linked onto an
   * existing person as a new application for this job) -- no modal, no user
   * choice; kept only so the status chip can read "Resolving duplicate…"
   * while the request is in flight. */
  const [resolvingDuplicateRowIds, setResolvingDuplicateRowIds] = useState<
    Set<string>
  >(new Set());
  const [allSuccessToastShown, setAllSuccessToastShown] = useState(false);
  /** Application id whose CV upload history the sub-modal is showing, or
   * `null` when it's closed. */
  const [historyApplicationId, setHistoryApplicationId] = useState<
    string | null
  >(null);
  /** True while "Retry all failed" is in flight, purely to disable the
   * button and show a busy label -- each row it kicks off is otherwise a
   * normal `retryRow` call. */
  const [isRetryingAll, setIsRetryingAll] = useState(false);
  const { success: triggerSuccess, error: triggerError } = useToast();

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
        // Hard-block close while any CV is still uploading/parsing — mirrors
        // the disabled Close / X controls so Escape / outside click can't
        // bypass them.
        if (queueRef.current.some(isQueueRowInProgress)) {
          return;
        }
        const hasUnconfirmed = queueRef.current.some(
          (r) => !r.candidateId && r.uploadPhase !== "error",
        );
        if (
          hasUnconfirmed &&
          !confirm(
            "Some uploaded CVs haven't been confirmed yet and will be discarded from this session if you close now. Close anyway?",
          )
        ) {
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
  // CJ4X9M: outside the JD-pipeline flow a job is optional -- a CV uploaded
  // with no job selected banks in the candidate pool. Only the JD-pipeline's
  // hard "no_opening_linked" block still disables uploads.
  const isUploadDisabled = isCampaignBlocked;

  /** Fetches this row's own latest name/email/phone (already AI-parsed by
   * the time this is called, since `/process` awaits parsing before
   * responding) and stores it on the queue row for the Name/Email/Phone
   * columns -- called before any auto-resolve merge/link, since a same-job
   * merge deletes this row's own `campaign_applied`/`candidates` rows and a
   * later fetch would just 404. */
  const refreshRowContactInfo = useCallback(
    async (rowId: string, candidateId: string) => {
      try {
        const res = await fetch(`/api/admin/candidates/${candidateId}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { candidate?: CandidateDbRow };
        const c = json.candidate;
        if (!c) return;
        setQueue((q) =>
          q.map((r) =>
            r.rowId === rowId
              ? {
                  ...r,
                  prefillName: c.name ?? r.prefillName,
                  prefillEmail: c.parsed_contact_email ?? r.prefillEmail,
                  prefillPhone: c.parsed_contact_phone ?? r.prefillPhone,
                }
              : r,
          ),
        );
      } catch {
        // best-effort; the columns just keep showing the last-known values
      }
    },
    [],
  );

  /**
   * Auto-resolves a dedupe hit with no modal/user choice: if any hit is for
   * *this same job*, the new CV is saved as a new version on that existing
   * application (mirrors the old "Update CV" action); otherwise the person
   * doesn't have an application in this job yet, so the freshly-created
   * application is repointed onto their existing identity, becoming a new
   * CV for this job. Errors leave the row flagged in the queue.
   */
  const autoResolveDuplicate = useCallback(
    async (
      rowId: string,
      candidateId: string,
      hits: DuplicateCandidateHit[],
    ) => {
      if (hits.length === 0) return;
      const existsMatchedOn = contactExistsMatchedOn(hits);
      if (existsMatchedOn) {
        setQueue((q) =>
          q.map((r) =>
            r.rowId === rowId
              ? {
                  ...r,
                  existsByContact: true,
                  existsMatchedOn,
                }
              : r,
          ),
        );
      }
      setResolvingDuplicateRowIds((prev) => new Set(prev).add(rowId));
      try {
        const sameJobHit = hits.find((h) => h.jobOpeningId === selectedJobId);

        if (!sameJobHit) {
          // Cross-job duplicate: keep this application (it's for a different
          // job), but repoint it onto the existing person instead of leaving
          // it under the throwaway blank candidate created for it.
          const existingCandidateId = hits[0]?.candidateId;
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
              r.rowId === rowId
                ? {
                    ...r,
                    uploadPhase: "uploaded" as const,
                    parsing_status: "completed" as const,
                  }
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

        // Since we copy the duplicate's completed JD-match score/status
        // to the existing application inside the merge database transaction
        // (see mergeDuplicateApplicationIntoExisting), we do not need to
        // run JD-match scoring a second time here.
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
            r.rowId === rowId
              ? {
                  ...r,
                  uploadPhase: "uploaded" as const,
                  parsing_status: "completed" as const,
                  mergedApplicationId: sameJobHit.id,
                }
              : r,
          ),
        );
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : "Failed to resolve duplicate candidate";
        setQueue((q) =>
          q.map((r) =>
            r.rowId === rowId
              ? { ...r, uploadPhase: "error", uploadError: msg }
              : r,
          ),
        );
        triggerError(msg);
      } finally {
        duplicateMergeIdsRef.current.delete(candidateId);
        setResolvingDuplicateRowIds((prev) => {
          const next = new Set(prev);
          next.delete(rowId);
          return next;
        });
      }
    },
    [
      selectedJobId,
      runJdMatchOnUpload,
      onCandidatesChanged,
      onDuplicateMergedToExisting,
      triggerError,
    ],
  );

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
          r.rowId === rowId
            ? {
                ...r,
                uploadPhase: "invoking" as const,
                // Reset any stale failure from a previous attempt -- without
                // this, retrying a row whose CV parsing (or JD-match) had
                // failed left `parsing_status`/`jdMatchStatus` stuck at
                // "failed" for the whole retry, and forever after if the
                // retry itself threw before reaching the success branch
                // below (the polling effect only refreshes rows sitting at
                // "pending"/"processing", never "failed").
                parsing_status: "processing" as const,
                parsing_error: null,
                jdMatchStatus: null,
                jdMatchError: null,
              }
            : r,
        ),
      );
      try {
        const procRes = await aiProcessSemaphore.run(() =>
          fetch(`/api/admin/candidates/${candidateId}/process`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runJdMatch }),
          }),
        );
        const procJson = (await procRes.json()) as {
          error?: string;
          duplicateCandidates?: DuplicateCandidateHit[];
          duplicateNewUpload?: DuplicateNewUploadPreview | null;
          jdMatch?: ProcessJdMatchResult;
        };
        if (!procRes.ok) {
          throw new Error(procJson.error ?? "Failed to start processing");
        }

        // `runCvParsing` inside `/process` is awaited synchronously before
        // the response is sent, so a 2xx here means parsing (and, if
        // requested, JD-match) has definitively already finished -- no need
        // to wait for the next poll tick to learn that.
        const jdMatchError = jdMatchErrorFromResponse(procJson.jdMatch);
        setQueue((q) =>
          q.map((r) =>
            r.rowId === rowId
              ? {
                  ...r,
                  parsing_status: "completed" as const,
                  parsing_error: null,
                  jdMatchStatus: jdMatchError ? ("failed" as const) : null,
                  jdMatchError,
                }
              : r,
          ),
        );

        const hits = procJson.duplicateCandidates ?? [];
        // Contact info is only ever readable while this row's own
        // application/candidate rows still exist -- capture it now, before
        // a same-job auto-merge below deletes them.
        await refreshRowContactInfo(rowId, candidateId);
        if (hits.length > 0) {
          await autoResolveDuplicate(rowId, candidateId, hits);
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
            r.rowId === rowId
              ? {
                  ...r,
                  uploadPhase: "error",
                  uploadError: msg,
                  parsing_status: "failed" as const,
                }
              : r,
          ),
        );
      }
    },
    [onCandidatesChanged, refreshRowContactInfo, autoResolveDuplicate],
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
      rowId: string,
      tempKey: string,
      filename: string,
      mimeType: string | null,
      email: string | null,
      phone: string | null,
      runJdMatch: boolean,
    ): Promise<CommitAndProcessResult> => {
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
        q.map((r) => (r.rowId === rowId ? { ...r, candidateId } : r)),
      );

      const procRes = await aiProcessSemaphore.run(() =>
        fetch(`/api/admin/candidates/${candidateId}/process`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runJdMatch }),
        }),
      );
      const procJson = (await procRes.json()) as {
        error?: string;
        duplicateCandidates?: DuplicateCandidateHit[];
        duplicateNewUpload?: DuplicateNewUploadPreview | null;
        jdMatch?: ProcessJdMatchResult;
      };
      if (!procRes.ok) {
        throw new Error(procJson.error ?? "Failed to start processing");
      }

      return {
        candidateId,
        duplicateCandidates: procJson.duplicateCandidates ?? [],
        duplicateNewUpload: procJson.duplicateNewUpload ?? null,
        jdMatchError: jdMatchErrorFromResponse(procJson.jdMatch),
      };
    },
    [selectedJobId, sourceKey, sourceOther],
  );

  const loadJobs = useCallback(async () => {
    const res = await fetch("/api/admin/job-openings", {
      credentials: "include",
      cache: "no-store",
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

  const hasIncompleteCvs = queue.some(isQueueRowInProgress);

  /**
   * Scrolls a newly-added row into view as soon as it appears in the queue --
   * ref callbacks run before effects in the same commit, so by the time this
   * runs the row's `<tr>` is already mounted. Diffing against
   * `scrolledRowIdsRef` (rather than e.g. "last row in the array") means
   * later re-renders of that same row (progress %, status chip) never
   * re-trigger a scroll once it's already been shown.
   */
  useEffect(() => {
    const newRows = queue.filter(
      (r) => !scrolledRowIdsRef.current.has(r.rowId),
    );
    if (newRows.length === 0) return;
    for (const r of newRows) scrolledRowIdsRef.current.add(r.rowId);
    const target = rowElRefs.current.get(newRows[newRows.length - 1].rowId);
    target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [queue]);

  useEffect(() => {
    if (!open) {
      setQueue([]);
      setAllSuccessToastShown(false);
    }
  }, [open]);

  useEffect(() => {
    if (queue.length === 0) return;
    const allTerminal = queue.every(
      (r) => r.uploadPhase === "uploaded" || r.uploadPhase === "error",
    );
    if (allTerminal && !allSuccessToastShown) {
      setAllSuccessToastShown(true);
      const failCount = queue.filter(isRowFailed).length;
      const successCount = queue.length - failCount;

      if (failCount > 0) {
        triggerError(
          `CV upload completed: ${successCount} succeeded, ${failCount} failed.`,
        );
      } else {
        triggerSuccess("All CVs uploaded and processed successfully!");
      }
    }
  }, [queue, allSuccessToastShown, triggerSuccess, triggerError]);

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
            (r.parsing_status === "pending" ||
              r.parsing_status === "processing"),
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
                      parsing_status:
                        next.cv_parsing_status ?? r.parsing_status,
                      parsing_error: next.cv_parsing_error ?? r.parsing_error,
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

  /**
   * Confirms a row and kicks off AI processing automatically, right after
   * its S3 upload finishes -- there is no manual review/confirm step.
   * `email`/`phone` here are only ever the unreviewed client-side heuristic
   * guess, so `basicInfoReviewed` is deliberately left false/unset:
   * `process/route.ts` then hands basic-info fully over to AI instead of
   * locking in a guess nobody actually checked. `runJdMatch` reflects the
   * "Run AI JD-match scoring" toggle in the upload settings panel.
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
          // A dedupe hit before any row exists -- bypass the gate (the hit
          // itself is the confirmation) to create the row, then auto-resolve
          // it against the same hits, with no user interaction.
          const hits = confirmJson.duplicateCandidates ?? [];
          const result = await commitAndProcessViaBypass(
            rowId,
            tempKey,
            filename,
            mimeType,
            email,
            phone,
            runJdMatch,
          );
          // `commitAndProcessViaBypass` already awaited `/process` above, so
          // parsing has definitively completed -- and JD-match, if it
          // failed, needs to be reflected here since `autoResolveDuplicate`
          // below only ever touches `uploadPhase`/`parsing_status`, not
          // JD-match (the two are independent LLM calls).
          setQueue((q) =>
            q.map((r) =>
              r.rowId === rowId
                ? {
                    ...r,
                    parsing_status: "completed" as const,
                    parsing_error: null,
                    jdMatchStatus: result.jdMatchError
                      ? ("failed" as const)
                      : null,
                    jdMatchError: result.jdMatchError,
                  }
                : r,
            ),
          );
          await refreshRowContactInfo(rowId, result.candidateId);
          await autoResolveDuplicate(rowId, result.candidateId, hits);
          return;
        }

        if (!confirmRes.ok || !confirmJson.campaignAppliedId) {
          throw new Error(
            confirmJson.error ?? "Could not confirm this upload.",
          );
        }

        const candidateId = confirmJson.campaignAppliedId;
        setQueue((q) =>
          q.map((r) => (r.rowId === rowId ? { ...r, candidateId } : r)),
        );

        await triggerProcessing(rowId, candidateId, runJdMatch);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setQueue((q) =>
          q.map((r) =>
            r.rowId === rowId
              ? { ...r, uploadPhase: "error", uploadError: msg }
              : r,
          ),
        );
      }
    },
    [
      selectedJobId,
      sourceKey,
      sourceOther,
      commitAndProcessViaBypass,
      refreshRowContactInfo,
      autoResolveDuplicate,
      triggerProcessing,
    ],
  );

  /**
   * Signs a temp upload URL, PUTs the file to S3, then hands off to
   * `confirmAndProcessRow` -- shared by the initial ingest and by retrying a
   * row that failed before it ever got a `candidateId` (i.e. before
   * `temp-upload/confirm` ever created a `campaign_applied` row for it, so
   * redoing the whole thing from scratch can't create a duplicate).
   */
  const uploadAndConfirmRow = useCallback(
    async (
      rowId: string,
      file: File,
      prefillEmail: string | null,
      prefillPhone: string | null,
    ): Promise<boolean> => {
      try {
        const signRes = await fetch("/api/admin/candidates/temp-upload", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type || null,
          }),
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
              ? {
                  ...r,
                  uploadPhase: "uploading" as const,
                  tempKey: signJson.tempKey,
                }
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

        // No manual review/confirm step -- the CV goes straight to AI parsing
        // (and JD-match scoring, if the toggle is on) as soon as it lands in
        // storage.
        void confirmAndProcessRow(
          rowId,
          signJson.tempKey,
          file.name,
          file.type || null,
          prefillEmail,
          prefillPhone,
          runJdMatchOnUpload,
        );
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setQueue((q) =>
          q.map((r) =>
            r.rowId === rowId
              ? { ...r, uploadPhase: "error", uploadError: msg }
              : r,
          ),
        );
        return false;
      }
    },
    [confirmAndProcessRow, runJdMatchOnUpload],
  );

  /**
   * Retries a row stuck at `uploadPhase: "error"`. Whether that means
   * re-doing the upload from scratch or just re-triggering AI processing
   * depends on whether `temp-upload/confirm` ever ran successfully for it:
   * once it has (`candidateId` is set), the `campaign_applied`/`candidates`
   * rows already exist, so re-running confirm would create a second,
   * duplicate application -- re-running `/process` alone is safe and
   * sufficient (it's cheap to call again: parsing is a no-op if already
   * `completed`, and it re-checks/re-resolves duplicates regardless).
   */
  const retryRow = useCallback(
    async (rowId: string) => {
      const row = queueRef.current.find((r) => r.rowId === rowId);
      if (!row) return;

      if (row.candidateId) {
        await triggerProcessing(rowId, row.candidateId, runJdMatchOnUpload);
        return;
      }

      setQueue((q) =>
        q.map((r) =>
          r.rowId === rowId
            ? { ...r, uploadPhase: "signing" as const, uploadError: undefined }
            : r,
        ),
      );
      await uploadAndConfirmRow(
        rowId,
        row.file,
        row.prefillEmail ?? null,
        row.prefillPhone ?? null,
      );
    },
    [triggerProcessing, uploadAndConfirmRow, runJdMatchOnUpload],
  );

  /**
   * Retries every row currently failed (`isRowFailed`: upload/confirm error,
   * failed CV parse, or failed JD-match) at once, rather than making the
   * user click each one individually. Each row still goes through
   * `retryRow`'s own branching (re-upload from scratch vs. re-process
   * only), and any row that needs a fresh `/process` call still goes
   * through `aiProcessSemaphore` -- firing N retries in parallel here
   * doesn't bypass the concurrency cap, it just queues them the same way N
   * fresh uploads would.
   */
  const retryAllFailed = useCallback(async () => {
    const failedRowIds = queueRef.current
      .filter(isRowFailed)
      .map((r) => r.rowId);
    if (failedRowIds.length === 0) return;
    setIsRetryingAll(true);
    try {
      await Promise.all(failedRowIds.map((id) => retryRow(id)));
    } finally {
      setIsRetryingAll(false);
    }
  }, [retryRow]);

  const ingestFile = async (file: File): Promise<boolean> => {
    if (isCampaignBlocked) {
      triggerError(
        "Link a job campaign to this job first (Jobs list → publish / link opening), then try again.",
      );
      return false;
    }
    if (!isAllowedCvFilename(file.name)) {
      triggerError("Only PDF or DOCX files are supported.");
      return false;
    }
    if (file.size > MAX_CV_BYTES) {
      triggerError("File exceeds 25MB limit.");
      return false;
    }
    if (sourceKey === "Other" && !sourceOther.trim()) {
      triggerError("Please describe where this candidate was sourced (Other).");
      return false;
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
        file,
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

    return uploadAndConfirmRow(rowId, file, prefillEmail, prefillPhone);
  };

  const handleFiles = async (files: FileList | File[]) => {
    setAllSuccessToastShown(false);
    const list = Array.from(files);
    const results = await Promise.all(list.map((f) => ingestFile(f)));
    const successCount = results.filter(Boolean).length;
    if (successCount > 0) {
      triggerSuccess(
        successCount === 1
          ? "CV uploaded successfully — sending to AI…"
          : `${successCount} CVs uploaded successfully — sending to AI…`,
      );
    }
  };

  return (
    <>
      <Modal state={modalState}>
        <Modal.Backdrop
          className="bg-black/40 backdrop-blur-sm"
          isDismissable={!hasIncompleteCvs}
          isKeyboardDismissDisabled={hasIncompleteCvs}
        >
          <Modal.Container className="w-full">
            <Modal.Dialog className="!max-w-4xl max-h-[90vh] w-full min-w-0 overflow-hidden p-0">
              <Modal.CloseTrigger
                isDisabled={hasIncompleteCvs}
                aria-label={
                  hasIncompleteCvs
                    ? "Close unavailable while CVs are processing"
                    : "Close"
                }
              />
              <Modal.Header className="border-b border-divider px-6 py-4">
                <Modal.Heading className="text-xl">
                  Add candidates
                </Modal.Heading>
                <p className="mt-1 text-sm text-muted">
                  {isCampaignLocked
                    ? "CVs are linked to this job description’s campaign for parsing and JD match scoring."
                    : "Upload CVs to private storage; AI extracts profile fields in the background."}
                </p>
              </Modal.Header>
              <Modal.Body className="max-h-[min(78vh,880px)] space-y-4 overflow-y-auto px-6 py-4">
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
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Target campaign
                        {!isCampaignLocked && isJdPipeline ? (
                          <span className="ml-1 text-danger">*</span>
                        ) : null}
                        {!isCampaignLocked && !isJdPipeline ? (
                          <span className="ml-1 font-normal normal-case text-muted/70">
                            (optional)
                          </span>
                        ) : null}
                      </Label>
                      {isCampaignLocked &&
                      typeof jdPipelineCampaign === "object" ? (
                        <div className="mt-1.5 flex h-10 items-center rounded-xl border border-divider bg-surface-secondary px-3 text-sm font-medium text-foreground">
                          {jdPipelineCampaign.title}
                        </div>
                      ) : (
                        <Select
                          placeholder={
                            isJdPipeline
                              ? "Select a campaign…"
                              : "No job — add to candidate pool"
                          }
                          value={jobKey}
                          onChange={(key) => {
                            if (typeof key === "string") setJobKey(key);
                          }}
                          className="mt-1.5"
                        >
                          <Select.Trigger className="h-10 w-full min-w-0">
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
                      {isCampaignLocked &&
                      typeof jdPipelineCampaign === "object" ? (
                        <p className="mt-1 text-xs text-muted">
                          Fixed for this job — eligible for JD-based AI
                          evaluation.
                        </p>
                      ) : isCampaignMissing ? (
                        isJdPipeline ? (
                          <p className="mt-1 text-xs text-muted">
                            Required before you can upload CVs.
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-muted">
                            No job selected — CVs go to the candidate pool.
                          </p>
                        )
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
                        className="mt-1.5"
                      >
                        <Select.Trigger className="h-10 w-full min-w-0">
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
                        <TextField className="mt-2">
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
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 cursor-pointer rounded border-divider accent-accent"
                        checked={runJdMatchOnUpload}
                        onChange={(e) =>
                          setRunJdMatchOnUpload(e.target.checked)
                        }
                      />
                      Run AI JD-match scoring
                    </label>
                    <p className="mt-1 text-xs text-muted">
                      Runs after parsing for every CV in this session.
                    </p>
                  </div>

                  <div
                    className={`flex flex-col gap-2 rounded-xl border-2 border-dashed px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
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
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {isCampaignMissing && isJdPipeline
                          ? "Select a target campaign first"
                          : "Drop CVs here to start ingestion"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {isCampaignMissing && isJdPipeline
                          ? "Choose a campaign above, then upload PDF or DOCX (max 25MB each)."
                          : "PDF or DOCX, max 25MB each. Parsing starts as soon as files upload."}
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      className="shrink-0"
                      onPress={() => fileInputRef.current?.click()}
                      isDisabled={isUploadDisabled}
                    >
                      Select files
                    </Button>
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

                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Active upload queue
                      </h3>
                      <p className="text-xs text-muted">
                        CVs are sent to AI parsing automatically as soon as they
                        finish uploading. Duplicates are resolved automatically:
                        matched against an existing person, a CV becomes a new
                        version for this job if they already applied here, or a
                        new application if they haven't. Rows matched by email or
                        phone show Exists = Yes and are highlighted.
                      </p>
                    </div>
                  </div>

                  {queue.length > 0
                    ? (() => {
                        const totalCount = queue.length;
                        const failedCount = queue.filter(isRowFailed).length;
                        const successCount = queue.filter(
                          (r) => r.uploadPhase === "uploaded" && !isRowFailed(r),
                        ).length;
                        const inProgressCount =
                          totalCount - successCount - failedCount;
                        const successPct = (successCount / totalCount) * 100;
                        const inProgressPct =
                          (inProgressCount / totalCount) * 100;
                        const failedPct = (failedCount / totalCount) * 100;

                        return (
                          <div
                            className={
                              hasIncompleteCvs
                                ? "cv-processing-highlight mb-3"
                                : "mb-3"
                            }
                          >
                            <Card variant="secondary">
                              <Card.Content className="px-2 flex flex-col gap-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-muted">
                                    <span className="flex items-center gap-1.5">
                                      <span className="size-2 rounded-full bg-success" />
                                      Completed{" "}
                                      <span className="tabular-nums text-foreground">
                                        {successCount}
                                      </span>
                                    </span>
                                    {failedCount > 0 ? (
                                      <span className="flex items-center gap-1.5 text-danger">
                                        <span className="size-2 rounded-full bg-danger" />
                                        Failed{" "}
                                        <span className="tabular-nums">
                                          {failedCount}
                                        </span>
                                      </span>
                                    ) : null}
                                    {inProgressCount > 0 ? (
                                      <span className="flex items-center gap-1.5">
                                        <span className="size-2 animate-pulse rounded-full bg-accent" />
                                        In progress{" "}
                                        <span className="tabular-nums text-foreground">
                                          {inProgressCount}
                                        </span>
                                      </span>
                                    ) : null}
                                    <span className="text-muted/70">
                                      {totalCount} total
                                    </span>
                                  </div>
                                  {failedCount > 0 ? (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      isDisabled={isRetryingAll}
                                      onPress={() => void retryAllFailed()}
                                    >
                                      {isRetryingAll
                                        ? "Retrying…"
                                        : `Retry all failed (${failedCount})`}
                                    </Button>
                                  ) : null}
                                </div>
                                <div className="flex h-2 overflow-hidden rounded-full bg-content3">
                                  <div
                                    className="h-full bg-success transition-[width] duration-300"
                                    style={{ width: `${successPct}%` }}
                                  />
                                  <div
                                    className="h-full bg-accent animate-pulse transition-[width] duration-300"
                                    style={{ width: `${inProgressPct}%` }}
                                  />
                                  <div
                                    className="h-full bg-danger transition-[width] duration-300"
                                    style={{ width: `${failedPct}%` }}
                                  />
                                </div>
                              </Card.Content>
                            </Card>
                          </div>
                        );
                      })()
                    : null}

                  <div
                    className={
                      hasIncompleteCvs ? "cv-processing-highlight" : undefined
                    }
                  >
                    <Card variant="secondary" className="overflow-hidden">
                      <Card.Content className="gap-0 p-0">
                        <Table>
                          <Table.ScrollContainer>
                            <Table.Content
                              aria-label="Upload queue"
                              className="min-w-[640px]"
                            >
                              <Table.Header>
                                <Table.Column isRowHeader>File</Table.Column>
                                <Table.Column>Name</Table.Column>
                                <Table.Column>Email</Table.Column>
                                <Table.Column>Phone</Table.Column>
                                <Table.Column>Exists</Table.Column>
                                <Table.Column>Status</Table.Column>
                                <Table.Column>Actions</Table.Column>
                              </Table.Header>
                              <Table.Body>
                                {queue.length === 0 ? (
                                  <Table.Row id="empty">
                                    <Table.Cell
                                      colSpan={7}
                                      className="text-center text-sm text-muted"
                                    >
                                      No files in this session yet.
                                    </Table.Cell>
                                  </Table.Row>
                                ) : (
                                  queue.map((row) => {
                                    // A row auto-resolving a dedupe hit never
                                    // leaves `uploadPhase: "invoking"` -- AI
                                    // parsing has already finished by then
                                    // (that's how the hit was found), but
                                    // `statusChip` would otherwise keep showing
                                    // "Scanning" for the whole merge/link call,
                                    // reading as a stuck/slow parse.
                                    const isResolvingDuplicate =
                                      resolvingDuplicateRowIds.has(row.rowId);
                                    const chip = isResolvingDuplicate
                                      ? ({
                                          label: "Resolving duplicate",
                                          color: "default",
                                        } as const)
                                      : statusChip(row);
                                    const existsRowClass = row.existsByContact
                                      ? "bg-amber-500/15"
                                      : undefined;
                                    const existsMatchTitle =
                                      row.existsMatchedOn === "email"
                                        ? "Matching email already exists in the system"
                                        : row.existsMatchedOn === "phone"
                                          ? "Matching phone already exists in the system"
                                          : row.existsMatchedOn ===
                                              "email_or_phone"
                                            ? "Matching email and phone already exist in the system"
                                            : undefined;
                                    return (
                                      <Table.Row
                                        key={row.rowId}
                                        id={row.rowId}
                                      >
                                        <Table.Cell
                                          ref={(
                                            el: HTMLTableCellElement | null,
                                          ) => {
                                            // `Table.Row` (react-aria-components) doesn't
                                            // forward a plain `ref` prop to its rendered
                                            // `<tr>` -- `Table.Cell`'s HeroUI wrapper does
                                            // forward it, so anchor here and walk up.
                                            // Also paint the row highlight on the `<tr>`
                                            // here: Row `className` is unreliable for
                                            // background, while the cell ref always sees
                                            // the live DOM node.
                                            const tr =
                                              el?.closest("tr") ?? null;
                                            if (tr) {
                                              rowElRefs.current.set(
                                                row.rowId,
                                                tr,
                                              );
                                              tr.classList.toggle(
                                                "bg-amber-500/15",
                                                Boolean(row.existsByContact),
                                              );
                                              tr.style.boxShadow =
                                                row.existsByContact
                                                  ? "inset 4px 0 0 0 rgb(245 158 11)"
                                                  : "";
                                            } else
                                              rowElRefs.current.delete(
                                                row.rowId,
                                              );
                                          }}
                                          className={[
                                            "max-w-[200px]",
                                            existsRowClass,
                                          ]
                                            .filter(Boolean)
                                            .join(" ")}
                                        >
                                          <div className="flex items-center gap-3">
                                            <FileIcon className="size-8 shrink-0 text-muted" />
                                            <div className="min-w-0">
                                              <p className="truncate text-sm font-medium text-foreground">
                                                {row.filename}
                                              </p>
                                              <p className="text-[10px] text-muted">
                                                {formatBytes(row.size)}
                                                {rowErrorMessage(row)
                                                  ? ` · ${rowErrorMessage(row)}`
                                                  : ""}
                                              </p>
                                            </div>
                                          </div>
                                        </Table.Cell>
                                        <Table.Cell
                                          className={[
                                            "max-w-[160px] truncate text-sm text-foreground",
                                            existsRowClass,
                                          ]
                                            .filter(Boolean)
                                            .join(" ")}
                                        >
                                          {dash(row.prefillName)}
                                        </Table.Cell>
                                        <Table.Cell
                                          className={[
                                            "max-w-[200px] truncate text-sm text-muted",
                                            existsRowClass,
                                          ]
                                            .filter(Boolean)
                                            .join(" ")}
                                        >
                                          {dash(row.prefillEmail)}
                                        </Table.Cell>
                                        <Table.Cell
                                          className={[
                                            "text-sm text-muted",
                                            existsRowClass,
                                          ]
                                            .filter(Boolean)
                                            .join(" ")}
                                        >
                                          {dash(row.prefillPhone)}
                                        </Table.Cell>
                                        <Table.Cell
                                          className={existsRowClass}
                                        >
                                          {row.existsByContact ? (
                                            <Chip
                                              size="sm"
                                              variant="soft"
                                              color="warning"
                                              className="text-[10px] font-bold uppercase"
                                              title={existsMatchTitle}
                                            >
                                              Yes
                                            </Chip>
                                          ) : (
                                            <span className="text-sm text-muted">
                                              No
                                            </span>
                                          )}
                                        </Table.Cell>
                                        <Table.Cell
                                          className={existsRowClass}
                                        >
                                          <Chip
                                            size="sm"
                                            variant="soft"
                                            color={chip.color}
                                            className="text-[10px] font-bold uppercase"
                                          >
                                            {chip.label}
                                          </Chip>
                                        </Table.Cell>

                                        <Table.Cell
                                          className={existsRowClass}
                                        >
                                          {(() => {
                                            const historyId =
                                              row.mergedApplicationId ??
                                              row.candidateId;
                                            if (
                                              historyId == null ||
                                              row.uploadPhase !== "uploaded"
                                            ) {
                                              return <p className="text-sm text-muted text-center">—</p>;
                                            }
                                            return (
                                              <Button
                                                size="sm"
                                                variant="tertiary"
                                                aria-label="View CV upload history"
                                                className="size-8 min-w-0 p-0"
                                                onPress={() =>
                                                  setHistoryApplicationId(
                                                    historyId,
                                                  )
                                                }
                                              >
                                                <HistoryIcon className="size-4" />
                                              </Button>
                                            );
                                          })()}
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
                </div>
              </Modal.Body>
              <Modal.Footer className="border-t border-divider px-6 py-4">
                <Button
                  slot="close"
                  variant="secondary"
                  isDisabled={hasIncompleteCvs}
                >
                  Done
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <CvUploadHistorySubModal
        open={historyApplicationId != null}
        onOpenChange={(o) => {
          if (!o) setHistoryApplicationId(null);
        }}
        applicationId={historyApplicationId}
      />
    </>
  );
}
