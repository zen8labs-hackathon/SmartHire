"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOverlayTriggerState } from "react-stately";
import { Eye, Loader2, Pencil, RotateCcw } from "lucide-react";
import dayjs from "dayjs";

import { Button, Card, Chip, Disclosure, Modal, Spinner } from "@heroui/react";

import type { CandidateApplicationSummary } from "@/app/api/admin/upload-files/[id]/candidate-applications/route";
import { DataTablePagination } from "@/components/admin/shell/table-system";
import { ManualEntryFromUploadModal } from "@/components/admin/jd/manual-entry-from-upload-modal";
import { PipelineStatusBadge } from "@/components/admin/candidates/pipeline-status-badge";
import { uploadCvService } from "@/lib/service/upload-files.service";
import {
  FILE_UPLOAD_STATUS,
  type FileUploadRow,
  type FileUploadStatus,
} from "@/lib/db/upload-history";
import { formatDisplayDate } from "@/lib/format-date";
import { useToast } from "@/components/admin/toast-provider";

/** Mirrors `uploadCvService.retryFiles`'s own eligibility filter -- a row
 * that filter would silently skip shouldn't show a Retry button in the
 * first place (clicking it would look like it did nothing). Also gates the
 * "Manual entry" action below: both are only sensible for a row that isn't
 * already done and isn't actively being worked by the queue right now. */
const STALE_MS = 1000 * 60 * 2;
function isRetryEligible(row: FileUploadRow): boolean {
  if (row.status === FILE_UPLOAD_STATUS.Completed) return false;
  if (row.status === FILE_UPLOAD_STATUS.Failed) return true;
  return new Date(row.updated_at).getTime() + STALE_MS <= Date.now();
}

function statusChipColor(
  status: FileUploadStatus,
): "success" | "danger" | "accent" | "default" {
  switch (status) {
    case FILE_UPLOAD_STATUS.Completed:
      return "success";
    case FILE_UPLOAD_STATUS.Failed:
      return "danger";
    case FILE_UPLOAD_STATUS.Processing:
      return "accent";
    default:
      return "default";
  }
}

/** Row order within a batch: problems first, then active work, then queued, then done. */
const STATUS_SORT_PRIORITY: Record<FileUploadStatus, number> = {
  [FILE_UPLOAD_STATUS.Failed]: 0,
  [FILE_UPLOAD_STATUS.Processing]: 1,
  [FILE_UPLOAD_STATUS.Pending]: 2,
  [FILE_UPLOAD_STATUS.Completed]: 3,
};

function statusLabel(status: FileUploadStatus): string {
  switch (status) {
    case FILE_UPLOAD_STATUS.Completed:
      return "Completed";
    case FILE_UPLOAD_STATUS.Failed:
      return "Failed";
    case FILE_UPLOAD_STATUS.Processing:
      return "Processing";
    default:
      return "Pending";
  }
}

type BatchGroup = {
  batchId: string;
  createdAt: string;
  files: FileUploadRow[];
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
};

/** Collapses the flat `file_uploads` list into one entry per `batch_id`,
 * newest batch first, with each batch's files pre-sorted by status. */
function groupByBatch(rows: FileUploadRow[]): BatchGroup[] {
  const byId = new Map<string, FileUploadRow[]>();
  for (const row of rows) {
    const list = byId.get(row.batch_id);
    if (list) list.push(row);
    else byId.set(row.batch_id, [row]);
  }

  const groups: BatchGroup[] = [];
  for (const [batchId, files] of byId) {
    const sorted = [...files].sort((a, b) => {
      const priorityDiff =
        STATUS_SORT_PRIORITY[a.status] - STATUS_SORT_PRIORITY[b.status];
      if (priorityDiff !== 0) return priorityDiff;
      return a.file_name.localeCompare(b.file_name);
    });
    const createdAt = files.reduce(
      (earliest, f) =>
        new Date(f.created_at).getTime() < new Date(earliest).getTime()
          ? (f.created_at as unknown as string)
          : earliest,
      files[0].created_at as unknown as string,
    );
    const completed = files.filter(
      (f) => f.status === FILE_UPLOAD_STATUS.Completed,
    ).length;
    const failed = files.filter(
      (f) => f.status === FILE_UPLOAD_STATUS.Failed,
    ).length;
    groups.push({
      batchId,
      createdAt,
      files: sorted,
      total: files.length,
      completed,
      failed,
      inProgress: files.length - completed - failed,
    });
  }

  return groups.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

type Props = {
  jobId: string | null;
  jobTitle?: string;
};

export function UploadHistoryPanel({ jobId, jobTitle }: Props) {
  const { success: triggerSuccess, error: triggerError } = useToast();

  const [rows, setRows] = useState<FileUploadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dupInfoRow, setDupInfoRow] = useState<FileUploadRow | null>(null);
  const [manualEntryRow, setManualEntryRow] = useState<FileUploadRow | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const rowsRef = useRef<FileUploadRow[]>([]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setLoadError(null);
      try {
        const { rows: fetched } = await uploadCvService.getUploadList(jobId, {
          limit: 500,
        });
        setRows(fetched);
      } catch (e) {
        setLoadError(
          e instanceof Error ? e.message : "Could not load upload history.",
        );
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [jobId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Polls while any row is still in flight, so status/progress update live
  // without the user needing to leave and revisit this tab.
  useEffect(() => {
    const hasInFlight = rows.some(
      (r) =>
        r.status === FILE_UPLOAD_STATUS.Pending ||
        r.status === FILE_UPLOAD_STATUS.Processing,
    );
    if (!hasInFlight) return;
    const interval = setInterval(() => void load(true), 5000);
    return () => clearInterval(interval);
  }, [rows, load]);

  const retryRow = useCallback(
    async (row: FileUploadRow) => {
      setRetryingIds((prev) => new Set(prev).add(row.id));
      try {
        const result = await uploadCvService.retryFiles([row]);
        if (!result.ok) {
          triggerError(result.error ?? "Could not retry this file.");
          return;
        }
        triggerSuccess(`Retrying ${row.file_name}…`);
        await load(true);
      } finally {
        setRetryingIds((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      }
    },
    [load, triggerError, triggerSuccess],
  );

  const batches = useMemo(() => groupByBatch(rows), [rows]);

  const total = rows.length;
  const completedCount = rows.filter(
    (r) => r.status === FILE_UPLOAD_STATUS.Completed,
  ).length;
  const failedCount = rows.filter(
    (r) => r.status === FILE_UPLOAD_STATUS.Failed,
  ).length;
  const inProgressCount = total - completedCount - failedCount;

  const totalPages = Math.max(1, Math.ceil(batches.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = batches.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageBatches = batches.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const endIdx = startIdx === 0 ? 0 : startIdx - 1 + pageBatches.length;

  const toggleBatch = useCallback((batchId: string, isOpen: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (isOpen) next.add(batchId);
      else next.delete(batchId);
      return next;
    });
  }, []);

  return (
    <Card>
      <Card.Content className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              CV upload progress
            </h2>
            <p className="mt-1 text-sm text-muted">
              {jobId
                ? "Files being uploaded and already processed for this job."
                : "Files being uploaded and already processed for the candidate pool."}
            </p>
          </div>
          {total > 0 ? (
            <div className="text-right">
              <p className="text-2xl font-semibold tabular-nums text-foreground">
                {total}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                files uploaded
              </p>
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : loadError ? (
          <p className="text-sm text-danger">{loadError}</p>
        ) : (
          <>
            {total > 0 ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-success" />
                  Completed{" "}
                  <span className="tabular-nums text-foreground">
                    {completedCount}
                  </span>
                </span>
                {failedCount > 0 ? (
                  <span className="flex items-center gap-1.5 text-danger">
                    <span className="size-2 rounded-full bg-danger" />
                    Failed <span className="tabular-nums">{failedCount}</span>
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
                  {batches.length} batch{batches.length === 1 ? "" : "es"}
                </span>
              </div>
            ) : null}

            {pageBatches.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                No files uploaded for this job yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {pageBatches.map((batch) => (
                  <BatchDisclosure
                    key={batch.batchId}
                    batch={batch}
                    isExpanded={expanded.has(batch.batchId)}
                    onExpandedChange={(open) =>
                      toggleBatch(batch.batchId, open)
                    }
                    retryingIds={retryingIds}
                    onRetry={retryRow}
                    onViewDuplicate={setDupInfoRow}
                    onManualEntry={setManualEntryRow}
                  />
                ))}
              </div>
            )}

            {batches.length > 0 ? (
              <DataTablePagination
                page={safePage}
                totalPages={totalPages}
                setPage={setPage}
                startIdx={startIdx}
                endIdx={endIdx}
                totalCount={batches.length}
                itemTypeLabel="batches"
                pageSize={pageSize}
                setPageSize={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            ) : null}
          </>
        )}
      </Card.Content>

      <CandidateApplicationsModal
        row={dupInfoRow}
        onClose={() => setDupInfoRow(null)}
      />

      <ManualEntryFromUploadModal
        row={manualEntryRow}
        jobTitle={jobTitle}
        onClose={() => setManualEntryRow(null)}
        onSaved={() => void load(true)}
      />
    </Card>
  );
}

type BatchDisclosureProps = {
  batch: BatchGroup;
  isExpanded: boolean;
  onExpandedChange: (open: boolean) => void;
  retryingIds: Set<string>;
  onRetry: (row: FileUploadRow) => void;
  onViewDuplicate: (row: FileUploadRow) => void;
  onManualEntry: (row: FileUploadRow) => void;
};

function BatchDisclosure({
  batch,
  isExpanded,
  onExpandedChange,
  retryingIds,
  onRetry,
  onViewDuplicate,
  onManualEntry,
}: BatchDisclosureProps) {
  const { completed, failed, inProgress, total } = batch;
  const completedPct = total > 0 ? (completed / total) * 100 : 0;
  const inProgressPct = total > 0 ? (inProgress / total) * 100 : 0;
  const failedPct = total > 0 ? (failed / total) * 100 : 0;

  const batchStatus: FileUploadStatus =
    failed > 0
      ? FILE_UPLOAD_STATUS.Failed
      : inProgress > 0
        ? FILE_UPLOAD_STATUS.Processing
        : FILE_UPLOAD_STATUS.Completed;
  const batchStatusLabel =
    failed > 0
      ? `${failed} failed`
      : inProgress > 0
        ? `${inProgress} in progress`
        : "All done";

  return (
    <Disclosure
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
      className="overflow-hidden rounded-xl border border-divider"
    >
      <Disclosure.Heading className="flex items-stretch">
        <Disclosure.Trigger className="flex w-full min-w-0 items-center gap-3 px-3.5 py-3 text-left outline-none hover:bg-surface-secondary/40 pressed:bg-surface-secondary/40">
          <Disclosure.Indicator className="size-4 shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">
                {dayjs(batch.createdAt).format("MMM D, YYYY · HH:mm")}
              </p>
              <Chip
                size="sm"
                variant="soft"
                color={statusChipColor(batchStatus)}
                className={`text-[10px] font-bold uppercase ${
                  inProgress > 0 && failed === 0 ? "animate-pulse" : ""
                }`}
              >
                {batchStatusLabel}
              </Chip>
            </div>
            <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-wider text-muted/70">
              {total} file{total === 1 ? "" : "s"} · batch {batch.batchId}
            </p>
            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-content3">
              <div
                className="h-full bg-success transition-[width] duration-300"
                style={{ width: `${completedPct}%` }}
              />
              <div
                className="h-full animate-pulse bg-accent transition-[width] duration-300"
                style={{ width: `${inProgressPct}%` }}
              />
              <div
                className="h-full bg-danger transition-[width] duration-300"
                style={{ width: `${failedPct}%` }}
              />
            </div>
          </div>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">
            {completed}/{total}
          </span>
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="divide-y divide-divider border-t border-divider">
          {batch.files.map((row) => {
            const isRetrying = retryingIds.has(row.id);
            const isProcessing = row.status === FILE_UPLOAD_STATUS.Processing;
            return (
              <div
                key={row.id}
                className={`flex items-center gap-3 px-3.5 py-2.5 ${
                  row.is_existed ? "bg-amber-500/10" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {row.file_name}
                  </p>
                  {row.status === FILE_UPLOAD_STATUS.Failed ? (
                    <p className="truncate text-[10px] text-danger">
                      {row.error_message ?? "Upload failed"}
                    </p>
                  ) : null}
                </div>
                {row.is_existed ? (
                  <Chip
                    size="sm"
                    variant="soft"
                    color="warning"
                    className="shrink-0 text-[10px] font-bold uppercase"
                  >
                    Exists
                  </Chip>
                ) : null}
                <Chip
                  size="sm"
                  variant="soft"
                  color={statusChipColor(row.status)}
                  className={`shrink-0 text-[10px] font-bold uppercase ${
                    isProcessing ? "animate-pulse" : ""
                  }`}
                >
                  {statusLabel(row.status)}
                </Chip>
                <div className="flex shrink-0 items-center gap-1">
                  {isRetryEligible(row) ? (
                    <>
                      <Button
                        size="sm"
                        variant="tertiary"
                        isIconOnly
                        className="cursor-pointer"
                        aria-label={`Retry ${row.file_name}`}
                        isDisabled={isRetrying}
                        onPress={() => onRetry(row)}
                      >
                        {isRetrying ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RotateCcw className="size-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="tertiary"
                        isIconOnly
                        className="cursor-pointer"
                        aria-label={`Fill in ${row.file_name} manually`}
                        isDisabled={isRetrying}
                        onPress={() => onManualEntry(row)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </>
                  ) : null}
                  {row.is_existed ? (
                    <Button
                      size="sm"
                      variant="tertiary"
                      isIconOnly
                      className="cursor-pointer"
                      aria-label={`View jobs ${row.file_name} already applied to`}
                      onPress={() => onViewDuplicate(row)}
                    >
                      <Eye className="size-4" />
                    </Button>
                  ) : null}
                  {!isRetryEligible(row) && !row.is_existed ? (
                    <span className="flex w-8 items-center justify-center text-sm text-muted">
                      —
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}

type CandidateApplicationsModalProps = {
  row: FileUploadRow | null;
  onClose: () => void;
};

/** Opened from the duplicate (eye) icon: the jobs the matched candidate has
 * already applied to, so the recruiter can see where this CV already lives. */
function CandidateApplicationsModal({
  row,
  onClose,
}: CandidateApplicationsModalProps) {
  const [applications, setApplications] = useState<
    CandidateApplicationSummary[] | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modalState = useOverlayTriggerState({
    isOpen: row != null,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
  });

  const fileUploadId = row?.id ?? null;

  useEffect(() => {
    if (fileUploadId == null) {
      setApplications(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    uploadCvService
      .getCandidateApplications(fileUploadId)
      .then((apps) => {
        if (!cancelled) setApplications(apps);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Could not load the candidate's applications.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fileUploadId]);

  return (
    <Modal state={modalState}>
      <Modal.Backdrop className="bg-black/40 backdrop-blur-sm">
        <Modal.Container className="w-full">
          <Modal.Dialog className="!max-w-xl w-full min-w-0 overflow-hidden p-0">
            <Modal.CloseTrigger aria-label="Close" />
            <Modal.Header className="border-b border-divider px-6 py-4">
              <Modal.Heading className="text-lg">Already applied</Modal.Heading>
              <p className="mt-1 truncate text-sm text-muted">
                Jobs this candidate ({row?.file_name}) has already applied to.
              </p>
            </Modal.Header>

            <Modal.Body className="max-h-[min(60vh,480px)] overflow-y-auto px-6 py-4">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Spinner size="sm" />
                  Loading…
                </div>
              ) : error ? (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : !applications || applications.length === 0 ? (
                <p className="text-sm text-muted">
                  No applications found for this candidate.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {applications.map((app) => {
                    const isCurrent =
                      row?.job_id != null && app.jobId === row.job_id;
                    const evaluationHref =
                      app.jobId != null
                        ? `/admin/jd/${app.jobId}/pipeline/${app.id}/evaluation`
                        : null;
                    const body = (
                      <>
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {app.jobTitle}
                          </p>
                          {isCurrent ? (
                            <Chip
                              size="sm"
                              variant="soft"
                              color="accent"
                              className="shrink-0 text-[10px] font-bold uppercase"
                            >
                              Current
                            </Chip>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted">
                          Applied {formatDisplayDate(app.appliedAt)}
                        </p>
                        <div className="mt-0.5">
                          <PipelineStatusBadge
                            app={app}
                            hasJob={app.jobId != null}
                          />
                        </div>
                      </>
                    );
                    const baseClass = `flex flex-col gap-1 rounded-xl border px-4 py-3 ${
                      isCurrent
                        ? "border-accent/60 bg-accent/5"
                        : "border-divider"
                    }`;
                    return evaluationHref ? (
                      <a
                        key={app.id}
                        href={evaluationHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${baseClass} cursor-pointer outline-none transition-colors hover:border-accent/50 hover:bg-surface-secondary/40 focus-visible:border-accent`}
                      >
                        {body}
                      </a>
                    ) : (
                      <div key={app.id} className={baseClass}>
                        {body}
                      </div>
                    );
                  })}
                </div>
              )}
            </Modal.Body>

            <Modal.Footer className="justify-end border-t border-divider px-6 py-4">
              <Button
                variant="secondary"
                className="cursor-pointer"
                onPress={onClose}
              >
                Close
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
