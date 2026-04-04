"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOverlayTriggerState } from "react-stately";

import {
  Button,
  Card,
  Chip,
  Label,
  ListBox,
  Modal,
  Select,
  Table,
} from "@heroui/react";

import type { ParsingStatus } from "@/lib/candidates/db-row";
import {
  CV_BUCKET,
  MAX_CV_BYTES,
  isAllowedCvFilename,
} from "@/lib/candidates/upload-constants";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";

type JobOpening = { id: string; title: string; status: string };

type UploadPhase =
  | "signing"
  | "uploading"
  | "invoking"
  | "uploaded"
  | "error";

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
  if (row.uploadPhase === "signing") return { pct: 8, label: "Preparing upload…" };
  if (row.uploadPhase === "uploading") return { pct: 25, label: "Uploading file…" };
  if (row.uploadPhase === "invoking") return { pct: 40, label: "Starting AI scan…" };
  if (row.parsing_status === "failed") return { pct: 100, label: "Parse failed" };
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

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCandidatesChanged?: () => void;
};

export function AddCandidateModal({ open, onOpenChange, onCandidatesChanged }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queueIdsRef = useRef<Set<string>>(new Set());

  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [jobKey, setJobKey] = useState<string>("__none__");
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [processAllBusy, setProcessAllBusy] = useState(false);

  const modalState = useOverlayTriggerState({
    isOpen: open,
    onOpenChange,
  });

  const selectedJobId = jobKey === "__none__" ? null : jobKey;

  const sessionAuthHeaders = useCallback(
    () => getSessionAuthorizationHeaders(supabase),
    [supabase],
  );

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
    setJobs(json.jobOpenings ?? []);
  }, [sessionAuthHeaders]);

  useEffect(() => {
    if (open) void loadJobs();
  }, [open, loadJobs]);

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
                    parsing_status: (next.parsing_status as ParsingStatus) ??
                      r.parsing_status,
                    parsing_error: (next.parsing_error as string | null) ??
                      r.parsing_error,
                  },
            ),
          );
          if (next.parsing_status === "completed" || next.parsing_status === "failed") {
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
    if (!isAllowedCvFilename(file.name)) {
      window.alert("Only PDF or DOCX files are supported.");
      return;
    }
    if (file.size > MAX_CV_BYTES) {
      window.alert("File exceeds 25MB limit.");
      return;
    }

    let candidateId = "";
    try {
      const auth = await sessionAuthHeaders();
      if (!auth.Authorization) {
        window.alert("Session expired. Sign in again.");
        return;
      }
      const signRes = await fetch("/api/admin/candidates/sign-upload", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({
          jobOpeningId: selectedJobId,
          filename: file.name,
          mimeType: file.type || null,
        }),
      });
      const signJson = (await signRes.json()) as {
        error?: string;
        candidateId?: string;
        path?: string;
        token?: string;
      };
      if (!signRes.ok || !signJson.candidateId || !signJson.path || !signJson.token) {
        throw new Error(signJson.error ?? "Could not start upload");
      }
      candidateId = signJson.candidateId;
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

      const { error: upErr } = await supabase.storage
        .from(CV_BUCKET)
        .uploadToSignedUrl(signJson.path, signJson.token, file, {
          contentType: file.type || undefined,
        });

      if (upErr) {
        throw new Error(upErr.message);
      }

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
      const procJson = (await procRes.json()) as { error?: string };
      if (!procRes.ok) {
        throw new Error(procJson.error ?? "Failed to start processing");
      }

      setQueue((q) =>
        q.map((r) =>
          r.candidateId === candidateId
            ? { ...r, uploadPhase: "uploaded" as const }
            : r,
        ),
      );
      onCandidatesChanged?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (candidateId) {
        queueIdsRef.current.add(candidateId);
        setQueue((q) =>
          q.map((r) =>
            r.candidateId === candidateId
              ? { ...r, uploadPhase: "error", uploadError: msg }
              : r,
          ),
        );
      } else {
        window.alert(msg);
      }
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const f of list) {
      await ingestFile(f);
    }
  };

  const processAll = async () => {
    setProcessAllBusy(true);
    try {
      const pending = queue.filter(
        (r) =>
          r.uploadPhase === "uploaded" &&
          (r.parsing_status === "pending" || r.parsing_status === "failed"),
      );
      const batchAuth = await sessionAuthHeaders();
      if (!batchAuth.Authorization) {
        window.alert("Session expired. Sign in again.");
        return;
      }
      for (const r of pending) {
        const res = await fetch(`/api/admin/candidates/${r.candidateId}/process`, {
          method: "POST",
          credentials: "include",
          headers: { ...batchAuth },
        });
        if (!res.ok) {
          const j = (await res.json()) as { error?: string };
          window.alert(j.error ?? "Process failed");
        }
      }
    } finally {
      setProcessAllBusy(false);
    }
  };

  const jobTitle =
    selectedJobId == null
      ? null
      : jobs.find((j) => j.id === selectedJobId)?.title ?? null;

  return (
    <Modal state={modalState}>
      <Modal.Backdrop className="bg-black/40 backdrop-blur-sm">
        <Modal.Container className="max-w-5xl">
          <Modal.Dialog className="max-h-[90vh] w-full overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider px-6 py-5">
              <Modal.Heading className="text-xl">Add candidates</Modal.Heading>
              <p className="mt-1 text-sm text-muted">
                Upload CVs to private storage; AI extracts profile fields in the
                background.
              </p>
            </Modal.Header>
            <Modal.Body className="max-h-[min(70vh,720px)] space-y-6 overflow-y-auto px-6 py-6">
              <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Target campaign
                    </Label>
                    <Select
                      value={jobKey}
                      onChange={(k) => setJobKey(String(k ?? "__none__"))}
                      className="mt-2"
                    >
                      <Select.Trigger className="w-full min-w-0">
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          <ListBox.Item
                            id="__none__"
                            textValue="Unassigned"
                            key="none"
                          >
                            Unassigned
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                          {jobs.map((j) => (
                            <ListBox.Item
                              key={j.id}
                              id={j.id}
                              textValue={j.title}
                            >
                              {j.title}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  </div>

                  {jobTitle ? (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-foreground">
                      <span className="font-semibold text-emerald-800 dark:text-emerald-200">
                        AI suggestion:{" "}
                      </span>
                      Linking uploads to{" "}
                      <span className="font-medium">{jobTitle}</span> helps match
                      candidates to that pipeline.
                    </div>
                  ) : null}

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
                        <p className="text-[10px] text-muted">Per-project metrics</p>
                      </Card.Content>
                    </Card>
                  </div>
                </div>

                <div
                  className={`flex min-h-[200px] flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                    dragOver
                      ? "border-accent bg-accent/5"
                      : "border-divider bg-content2/30"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    void handleFiles(e.dataTransfer.files);
                  }}
                >
                  <p className="text-sm font-semibold text-foreground">
                    Drop CVs here to start ingestion
                  </p>
                  <p className="mt-2 max-w-sm text-xs text-muted">
                    AI will parse contact info, skills, and experience. PDF or
                    DOCX, max 25MB per file.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button
                      variant="primary"
                      className="bg-gradient-to-br from-[#002542] to-[#1b3b5a]"
                      onPress={() => fileInputRef.current?.click()}
                    >
                      Select files
                    </Button>
                    <Button variant="secondary" isDisabled>
                      Connect cloud
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

              <div>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Active upload queue
                    </h3>
                    <p className="text-xs text-muted">
                      Manage and monitor background processing tasks.
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    className="bg-gradient-to-br from-[#002542] to-[#1b3b5a]"
                    onPress={() => void processAll()}
                    isDisabled={processAllBusy}
                  >
                    <PlayIcon className="mr-1 size-4" />
                    Process all batch
                  </Button>
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
                                <Table.Cell colSpan={4} className="text-center text-sm text-muted">
                                  No files in this session yet.
                                </Table.Cell>
                              </Table.Row>
                            ) : (
                              queue.map((row) => {
                                const { pct, label } = progressForRow(row);
                                const chip = statusChip(row);
                                return (
                                  <Table.Row key={row.candidateId} id={row.candidateId}>
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
  );
}
