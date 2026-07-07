"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  CV_BUCKET,
  MAX_CV_BYTES,
  isAllowedCvFilename,
} from "@/lib/candidates/upload-constants";
import { DuplicateCandidateModal } from "@/components/admin/candidates/duplicate-candidate-modal";
import { extractCvSignalsClientSide } from "@/lib/candidates/client-cv-extract";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";

type JobOpening = {
  id: string;
  title: string;
  status: string;
  /** Matches `job_descriptions.position` when linked; falls back to `title`. */
  displayTitle: string;
};

type UploadPhase = "signing" | "uploading" | "invoking" | "uploaded" | "error";

type QueueRow = {
  candidateId: string;
  filename: string;
  size: number;
  addedAt: number;
  uploadPhase: UploadPhase;
  uploadError?: string;
  parsing_status: ParsingStatus;
  parsing_error?: string | null;
};

type DuplicateFlowState = {
  /** Null while the flow was triggered by the pre-upload check — no row exists yet. */
  newCandidateId: string | null;
  /** Set only for the pre-upload flow: the file to actually upload if the user picks "Update CV". */
  pendingFile?: File;
  hits: DuplicateCandidateHit[];
  newUpload: DuplicateNewUploadPreview;
};

type CommitUploadResult = {
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
  if (row.uploadPhase === "error") return { pct: 0, label: "Upload failed" };
  if (row.uploadPhase === "signing")
    return { pct: 8, label: "Preparing upload…" };
  if (row.uploadPhase === "uploading")
    return { pct: 25, label: "Uploading file…" };
  if (row.uploadPhase === "invoking")
    return { pct: 40, label: "Starting AI scan…" };
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
  if (
    row.parsing_status === "processing" ||
    row.uploadPhase === "uploading" ||
    row.uploadPhase === "signing" ||
    row.uploadPhase === "invoking"
  ) {
    return { label: "Scanning", color: "accent" };
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
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queueIdsRef = useRef<Set<string>>(new Set());
  const duplicateResolveRef = useRef<
    ((outcome: "skip" | "replaced") => void) | null
  >(null);
  const duplicatePayloadRef = useRef<DuplicateFlowState | null>(null);
  /** Candidate ids currently being merged via "Update CV" — the modal's own
   * parsing-status realtime effect should not independently trigger a list
   * refresh for these; `onDuplicateMergedToExisting` already handles it once
   * the merge finishes, so both firing at once causes double re-renders. */
  const duplicateMergeIdsRef = useRef<Set<string>>(new Set());

  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [jobKey, setJobKey] = useState<string | null>(null);
  const [sourceKey, setSourceKey] = useState<string>(
    CANDIDATE_SOURCE_VALUES[0],
  );
  const [sourceOther, setSourceOther] = useState("");
  const [expectedSalary, setExpectedSalary] = useState("");
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [duplicateFlow, setDuplicateFlow] = useState<DuplicateFlowState | null>(
    null,
  );
  const [duplicateSubmitting, setDuplicateSubmitting] = useState(false);

  const isJdPipeline = jdPipelineCampaign != null;
  const isCampaignLocked =
    isJdPipeline && typeof jdPipelineCampaign === "object";
  const isCampaignBlocked = jdPipelineCampaign === "no_opening_linked";

  const modalState = useOverlayTriggerState({
    isOpen: open,
    onOpenChange,
  });

  const selectedJobId =
    isCampaignLocked && typeof jdPipelineCampaign === "object"
      ? jdPipelineCampaign.jobOpeningId
      : jobKey;

  const isCampaignMissing = !isCampaignLocked && selectedJobId == null;
  const isUploadDisabled = isCampaignBlocked || isCampaignMissing;

  const sessionAuthHeaders = useCallback(
    () => getSessionAuthorizationHeaders(supabase),
    [supabase],
  );

  /** Unmounts the duplicate modal right away so the upload queue/progress
   * underneath becomes visible while the merge/discard keeps running. */
  const closeDuplicateModal = useCallback(() => {
    setDuplicateFlow(null);
  }, []);

  /** Unblocks whichever `ingestFile` call is awaiting the duplicate-flow
   * outcome. Modal visibility is handled separately by `closeDuplicateModal`. */
  const resolveDuplicateFlow = useCallback((outcome: "skip" | "replaced") => {
    if (!duplicateResolveRef.current) return;
    const resolve = duplicateResolveRef.current;
    duplicateResolveRef.current = null;
    duplicatePayloadRef.current = null;
    resolve(outcome);
  }, []);

  /**
   * Sign-upload → Storage upload → invoke `/process` (AI parse + JD match +
   * post-parse dedupe safety net). Shared by the normal ingest path and by
   * "Update CV" when a duplicate was already caught by the pre-upload check
   * (that flow still needs a real, parsed row to merge from).
   */
  const commitUploadAndProcess = useCallback(
    async (file: File): Promise<CommitUploadResult> => {
      const auth = await sessionAuthHeaders();
      if (!auth.Authorization) {
        throw new Error("Session expired. Sign in again.");
      }
      const signRes = await fetch("/api/admin/candidates/sign-upload", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({
          jobOpeningId: selectedJobId,
          filename: file.name,
          mimeType: file.type || null,
          source: sourceKey,
          sourceOther: sourceKey === "Other" ? sourceOther.trim() : null,
          expectedSalary: expectedSalary.trim() || null,
        }),
      });
      const signJson = (await signRes.json()) as {
        error?: string;
        candidateId?: string;
        path?: string;
        token?: string;
      };
      if (
        !signRes.ok ||
        !signJson.candidateId ||
        !signJson.path ||
        !signJson.token
      ) {
        throw new Error(signJson.error ?? "Could not start upload");
      }
      const candidateId = signJson.candidateId;
      queueIdsRef.current.add(candidateId);

      setQueue((q) => [
        ...q,
        {
          candidateId,
          filename: file.name,
          size: file.size,
          addedAt: Date.now(),
          uploadPhase: "uploading",
          parsing_status: "pending",
        },
      ]);

      try {
        const { error: upErr } = await supabase.storage
          .from(CV_BUCKET)
          .uploadToSignedUrl(signJson.path, signJson.token, file, {
            contentType: file.type || undefined,
          });
        if (upErr) throw new Error(upErr.message);

        setQueue((q) =>
          q.map((r) =>
            r.candidateId === candidateId
              ? { ...r, uploadPhase: "invoking" as const }
              : r,
          ),
        );

        const procAuth = await sessionAuthHeaders();
        const procRes = await fetch(
          `/api/admin/candidates/${candidateId}/process`,
          {
            method: "POST",
            credentials: "include",
            headers: { ...procAuth },
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

        return {
          candidateId,
          duplicateCandidates: procJson.duplicateCandidates ?? [],
          duplicateNewUpload: procJson.duplicateNewUpload ?? null,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setQueue((q) =>
          q.map((r) =>
            r.candidateId === candidateId
              ? { ...r, uploadPhase: "error", uploadError: msg }
              : r,
          ),
        );
        throw e;
      }
    },
    [
      sessionAuthHeaders,
      selectedJobId,
      sourceKey,
      sourceOther,
      expectedSalary,
      supabase,
    ],
  );

  const runDuplicateUpdateWithHistory = useCallback(async () => {
    const payload = duplicatePayloadRef.current;
    if (!payload) return;
    closeDuplicateModal();
    setDuplicateSubmitting(true);
    let newCandidateId = payload.newCandidateId;
    try {
      if (payload.pendingFile) {
        const result = await commitUploadAndProcess(payload.pendingFile);
        newCandidateId = result.candidateId;
        payload.newCandidateId = newCandidateId;
        payload.pendingFile = undefined;
      }
      if (!newCandidateId) {
        throw new Error("Missing uploaded candidate to merge.");
      }

      const sameJobHit = payload.hits.find(
        (h) => h.jobOpeningId === selectedJobId,
      );

      if (!sameJobHit) {
        resolveDuplicateFlow("replaced");
        setQueue((q) =>
          q.map((r) =>
            r.candidateId === newCandidateId
              ? { ...r, uploadPhase: "uploaded" as const }
              : r,
          ),
        );
        onCandidatesChanged?.();
        return;
      }

      duplicateMergeIdsRef.current.add(newCandidateId);
      const procAuth = await sessionAuthHeaders();
      const repRes = await fetch(
        `/api/admin/candidates/${sameJobHit.id}/update-with-history`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...procAuth },
          body: JSON.stringify({
            newCandidateId,
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
      resolveDuplicateFlow("replaced");
      if (onDuplicateMergedToExisting) {
        await onDuplicateMergedToExisting(
          sameJobHit.id,
          repJson.candidate,
          newCandidateId,
        );
      } else {
        onCandidatesChanged?.();
      }
    } catch (e) {
      resolveDuplicateFlow("skip");
      window.alert(
        e instanceof Error ? e.message : "Failed to update candidate profile",
      );
    } finally {
      if (newCandidateId) duplicateMergeIdsRef.current.delete(newCandidateId);
      setDuplicateSubmitting(false);
    }
  }, [
    sessionAuthHeaders,
    closeDuplicateModal,
    resolveDuplicateFlow,
    onCandidatesChanged,
    onDuplicateMergedToExisting,
    commitUploadAndProcess,
    selectedJobId,
  ]);

  const runDiscardDuplicate = useCallback(async () => {
    const payload = duplicatePayloadRef.current;
    if (!payload) return;
    if (payload.pendingFile) {
      closeDuplicateModal();
      resolveDuplicateFlow("skip");
      return;
    }
    closeDuplicateModal();
    setDuplicateSubmitting(true);
    try {
      const procAuth = await sessionAuthHeaders();
      const delRes = await fetch(
        `/api/admin/candidates/${payload.newCandidateId}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: { ...procAuth },
        },
      );
      if (!delRes.ok) {
        const delJson = (await delRes.json()) as { error?: string };
        throw new Error(
          delJson.error ?? "Failed to discard new duplicate candidate record",
        );
      }
      resolveDuplicateFlow("skip");
      setQueue((prev) =>
        prev.map((r) =>
          r.candidateId === payload.newCandidateId
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
      resolveDuplicateFlow("skip");
      window.alert(e instanceof Error ? e.message : "Đã có lỗi xảy ra");
    } finally {
      setDuplicateSubmitting(false);
    }
  }, [
    sessionAuthHeaders,
    closeDuplicateModal,
    resolveDuplicateFlow,
    onCandidatesChanged,
  ]);

  const loadJobs = useCallback(async () => {
    const auth = await sessionAuthHeaders();
    const res = await fetch("/api/admin/job-openings", {
      credentials: "include",
      headers: {
        ...(auth.Authorization ? { Authorization: auth.Authorization } : {}),
      },
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
  }, [sessionAuthHeaders]);

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
    if (!open) return;

    const channel = supabase
      .channel("candidates-admin-modal")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "candidates" },
        (payload) => {
          const id =
            (payload.new as { id?: string } | null)?.id ??
            (payload.old as { id?: string } | null)?.id;
          if (!id || !queueIdsRef.current.has(id)) return;
          const next = payload.new as Record<string, unknown> | null;
          if (!next) return;
          setQueue((prev) =>
            prev.map((r) =>
              r.candidateId !== id
                ? r
                : {
                    ...r,
                    parsing_status:
                      (next.parsing_status as ParsingStatus) ??
                      r.parsing_status,
                    parsing_error:
                      (next.parsing_error as string | null) ?? r.parsing_error,
                  },
            ),
          );
          if (
            (next.parsing_status === "completed" ||
              next.parsing_status === "failed") &&
            !duplicateMergeIdsRef.current.has(id)
          ) {
            onCandidatesChanged?.();
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, supabase, onCandidatesChanged]);

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

    // Client-side pre-check: parse text + hash + regex-extract contact, then
    // ask the server for duplicates, all before this file touches Storage or
    // costs an AI call. Best-effort — any failure here just falls through to
    // the normal upload pipeline, whose post-parse dedupe is the safety net.
    let preCheckHits: DuplicateCandidateHit[] = [];
    let preCheckNewUpload: DuplicateNewUploadPreview | null = null;
    try {
      const signals = await extractCvSignalsClientSide(file);
      const auth = await sessionAuthHeaders();
      if (auth.Authorization) {
        const preRes = await fetch("/api/admin/candidates/check-duplicate", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...auth },
          body: JSON.stringify({
            jobOpeningId: selectedJobId,
            cvFileSha256: signals.cvFileSha256,
            cvContentSha256: signals.cvContentSha256,
            email: signals.email,
            phone: signals.phone,
          }),
        });
        if (preRes.ok) {
          const preJson = (await preRes.json()) as {
            duplicateCandidates?: DuplicateCandidateHit[];
            duplicateNewUpload?: DuplicateNewUploadPreview | null;
          };
          preCheckHits = preJson.duplicateCandidates ?? [];
          preCheckNewUpload = preJson.duplicateNewUpload ?? null;
        }
      }
    } catch {
      preCheckHits = [];
      preCheckNewUpload = null;
    }

    if (preCheckHits.length > 0) {
      const newUpload: DuplicateNewUploadPreview = preCheckNewUpload ?? {
        email: null,
        phone: null,
        parsedRole: null,
        cvUploadedAt: null,
      };
      const flow: DuplicateFlowState = {
        newCandidateId: null,
        pendingFile: file,
        hits: preCheckHits,
        newUpload,
      };
      duplicatePayloadRef.current = flow;
      const outcome = await new Promise<"skip" | "replaced">((resolve) => {
        duplicateResolveRef.current = resolve;
        setDuplicateFlow(flow);
      });
      if (outcome === "replaced") onCandidatesChanged?.();
      return;
    }

    try {
      const result = await commitUploadAndProcess(file);

      if (result.duplicateCandidates.length > 0) {
        const newUpload: DuplicateNewUploadPreview =
          result.duplicateNewUpload ?? {
            email: null,
            phone: null,
            parsedRole: null,
            cvUploadedAt: null,
          };
        const flow: DuplicateFlowState = {
          newCandidateId: result.candidateId,
          hits: result.duplicateCandidates,
          newUpload,
        };
        duplicatePayloadRef.current = flow;
        await new Promise<"skip" | "replaced">((resolve) => {
          duplicateResolveRef.current = resolve;
          setDuplicateFlow(flow);
        });
      }

      setQueue((q) =>
        q.map((r) =>
          r.candidateId === result.candidateId
            ? { ...r, uploadPhase: "uploaded" as const }
            : r,
        ),
      );
      onCandidatesChanged?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      window.alert(msg);
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const f of list) {
      await ingestFile(f);
    }
  };

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
                          : "AI will parse contact info, skills, and experience. Select or drop one or more PDF or DOCX files (max 25MB each)."}
                      </p>
                      <div className="mt-4 flex justify-center">
                        <Button
                          variant="primary"
                          className="bg-gradient-to-br from-[#002542] to-[#1b3b5a]"
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
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      Active upload queue
                    </h3>
                    <p className="text-xs text-muted">
                      Processing starts automatically after each upload; monitor
                      progress here.
                    </p>
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
                              <Table.Column isRowHeader>File</Table.Column>
                              <Table.Column>Upload date</Table.Column>
                              <Table.Column>Progress</Table.Column>
                              <Table.Column>Status</Table.Column>
                            </Table.Header>
                            <Table.Body>
                              {queue.length === 0 ? (
                                <Table.Row id="empty">
                                  <Table.Cell
                                    colSpan={4}
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
                                    <Table.Row
                                      key={row.candidateId}
                                      id={row.candidateId}
                                    >
                                      <Table.Cell>
                                        <div className="flex items-center gap-3">
                                          <FileIcon className="size-8 shrink-0 text-muted" />
                                          <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-foreground">
                                              {row.filename}
                                            </p>
                                            <p className="text-[10px] text-muted">
                                              {formatBytes(row.size)}
                                              {row.uploadError
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
                                        <Chip
                                          size="sm"
                                          variant="soft"
                                          color={chip.color}
                                          className="text-[10px] font-bold uppercase"
                                        >
                                          {chip.label}
                                        </Chip>
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
      {duplicateFlow ? (
        <DuplicateCandidateModal
          key={
            duplicateFlow.newCandidateId ??
            `pre-${duplicateFlow.pendingFile?.name}-${duplicateFlow.pendingFile?.lastModified}`
          }
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
          onUpdateProfile={runDuplicateUpdateWithHistory}
          onDiscard={runDiscardDuplicate}
        />
      ) : null}
    </>
  );
}
