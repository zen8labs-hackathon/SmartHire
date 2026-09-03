"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOverlayTriggerState } from "react-stately";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Lock,
  UploadCloud,
} from "lucide-react";

import {
  Button,
  Card,
  Chip,
  Input,
  Label,
  ListBox,
  Modal,
  ProgressCircle,
  Select,
  Tabs,
  TextField,
} from "@heroui/react";

import { uploadCvService } from "@/lib/service/upload-files.service";
import {
  MAX_CV_BYTES,
  isAllowedCvFilename,
} from "@/lib/candidates/upload-constants";
import { CANDIDATE_SOURCE_VALUES } from "@/lib/candidates/source-constants";
import { useToast } from "@/components/admin/toast-provider";
import { getMyProfileDetails } from "@/app/account/actions";
import {
  ManualCandidateForm,
  type ManualCandidateFormHandle,
} from "@/components/admin/jd/manual-candidate-form";

type RowStatus = "pending" | "uploading" | "done" | "error";

type UploadRow = {
  file: File;
  fileUploadId?: string;
  status: RowStatus;
  error?: string;
};

type Phase = "select" | "uploading" | "done";

/** Caps how many files upload to S3 at once -- keeps the browser from opening
 * an unbounded number of concurrent PUT requests when a large batch is dropped. */
const UPLOAD_CONCURRENCY = 20;

/** Caps how many files can be selected/dropped into one upload session. */
const MAX_FILES_PER_UPLOAD = 500;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function RowStatusIcon({ status }: { status: RowStatus }) {
  if (status === "done") {
    return (
      <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
    );
  }
  if (status === "error") {
    return <AlertCircle className="size-4 shrink-0 text-danger" aria-hidden />;
  }
  if (status === "uploading") {
    return (
      <Loader2
        className="size-4 shrink-0 animate-spin text-accent"
        aria-hidden
      />
    );
  }
  return (
    <span className="size-4 shrink-0 rounded-full bg-content3" aria-hidden />
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string | null;
  jobTitle?: string;
  /** Called once every file in the batch has finished uploading (success or
   * failure) -- files that succeeded are already enqueued for AI processing
   * server-side by this point. */
  onUploaded?: () => void;
};

export function UploadCvModal({
  open,
  onOpenChange,
  jobId,
  jobTitle,
  onUploaded,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef<UploadRow[]>([]);
  const wasOpenRef = useRef(open);
  const manualFormRef = useRef<ManualCandidateFormHandle>(null);
  const { success: triggerSuccess, error: triggerError } = useToast();

  const [phase, setPhase] = useState<Phase>("select");
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [manualBusy, setManualBusy] = useState(false);
  const [sourceKey, setSourceKey] = useState<string>(
    CANDIDATE_SOURCE_VALUES[0],
  );
  const [sourceOther, setSourceOther] = useState("");
  // Recruiter label for the batch -- defaults to the signed-in user's username
  // (fetched once, cached in a ref), editable before upload. `recruiterTouched`
  // stops the async default from clobbering a value the user already typed.
  const [recruiter, setRecruiter] = useState("");
  const myUsernameRef = useRef<string | null>(null);
  const recruiterTouchedRef = useRef(false);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [processedBytes, setProcessedBytes] = useState(0);

  const isUploading = phase === "uploading";
  // Blocks closing while either tab has a request in flight -- mirrors the
  // disabled Close/X controls below so Escape / outside click can't bypass it.
  const isBusy = isUploading || manualBusy;

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const handleModalOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && isBusy) return;
      onOpenChange(nextOpen);
    },
    [onOpenChange, isBusy],
  );

  const modalState = useOverlayTriggerState({
    isOpen: open,
    onOpenChange: handleModalOpenChange,
  });

  // Warns before the tab/window closes mid-upload -- the modal's own close
  // controls are already blocked, but nothing else stops a page refresh.
  useEffect(() => {
    if (!isBusy) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isBusy]);

  // Resets state on a *fresh open* (false -> true) rather than on close --
  // resetting on close flipped `phase` back to "select" while the modal was
  // still playing its dismiss animation, so closing from the progress/done
  // screen visibly flashed the upload-form screen for a frame before the
  // modal actually disappeared. Resetting on open keeps whatever the modal
  // was last showing intact all the way through the close animation, and the
  // next open still starts from a clean slate.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setPhase("select");
      setMode("auto");
      setManualBusy(false);
      setRows([]);
      setProcessedBytes(0);
      setSourceKey(CANDIDATE_SOURCE_VALUES[0]);
      setSourceOther("");
      setRecruiter(myUsernameRef.current ?? "");
      recruiterTouchedRef.current = false;
      setDragOver(false);
    }
    wasOpenRef.current = open;
  }, [open]);

  // Loads the signed-in user's username once, to seed the recruiter field.
  useEffect(() => {
    if (!open || myUsernameRef.current !== null) return;
    let cancelled = false;
    getMyProfileDetails()
      .then((details) => {
        if (cancelled || !details) return;
        myUsernameRef.current = details.username;
        if (!recruiterTouchedRef.current) setRecruiter(details.username);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Fires the completion toast + parent refresh once every row has resolved
  // (success or failure) -- reads from rowsRef so it only depends on `phase`
  // and doesn't re-fire as individual rows settle.
  useEffect(() => {
    if (phase !== "done") return;
    const finished = rowsRef.current;
    const successCount = finished.filter((r) => r.status === "done").length;
    const failCount = finished.filter((r) => r.status === "error").length;
    if (failCount > 0) {
      triggerError(
        `Upload complete: ${successCount} succeeded, ${failCount} failed.`,
      );
    } else if (successCount > 0) {
      triggerSuccess(
        successCount === 1
          ? "CV uploaded successfully — the system is analyzing it."
          : `${successCount} CVs uploaded successfully — the system is analyzing them.`,
      );
    }
    onUploaded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const startUpload = useCallback(
    async (files: File[]) => {
      if (files.length > MAX_FILES_PER_UPLOAD) {
        triggerError(
          `You can upload at most ${MAX_FILES_PER_UPLOAD} files at once (selected ${files.length}).`,
        );
        return;
      }

      const valid: File[] = [];
      for (const file of files) {
        if (!isAllowedCvFilename(file.name)) {
          triggerError(`${file.name}: only PDF or DOCX files are supported.`);
          continue;
        }
        if (file.size > MAX_CV_BYTES) {
          triggerError(`${file.name}: exceeds the 25MB limit.`);
          continue;
        }
        valid.push(file);
      }
      if (valid.length === 0) return;
      if (sourceKey === "Other" && !sourceOther.trim()) {
        triggerError("Please describe the candidate source (Other).");
        return;
      }

      setRows(valid.map((file) => ({ file, status: "pending" as const })));
      setProcessedBytes(0);
      setPhase("uploading");

      const source = sourceKey === "Other" ? sourceOther.trim() : sourceKey;

      try {
        const { files: historyRows } =
          await uploadCvService.createUploadHistory(
            jobId,
            valid.map((file) => ({
              fileName: file.name,
              mimeType: file.type || null,
              size: file.size,
              fileSource: source,
            })),
            recruiter.trim() || undefined,
          );

        const signResults =
          await uploadCvService.createSignedUploadUrls(historyRows);

        let cursor = 0;
        const runWorker = async () => {
          while (cursor < valid.length) {
            const i = cursor++;
            const file = valid[i];
            const historyRow = historyRows[i];
            const signResult = signResults[i];

            if (!historyRow || !signResult || !signResult.ok) {
              const message =
                signResult && !signResult.ok
                  ? signResult.error
                  : "Could not start this upload.";
              setRows((prev) =>
                prev.map((r, idx) =>
                  idx === i ? { ...r, status: "error", error: message } : r,
                ),
              );
              // Progress reflects files that finished processing (success or
              // failure), not just successful uploads -- otherwise a batch
              // with any failures never visibly reaches 100%.
              setProcessedBytes((prev) => prev + file.size);
              continue;
            }

            setRows((prev) =>
              prev.map((r, idx) =>
                idx === i
                  ? { ...r, fileUploadId: historyRow.id, status: "uploading" }
                  : r,
              ),
            );

            const putResult = await uploadCvService.uploadFileToS3(
              historyRow.id,
              file,
              signResult.signedUrl,
            );
            if (!putResult.ok) {
              setRows((prev) =>
                prev.map((r, idx) =>
                  idx === i
                    ? {
                        ...r,
                        status: "error",
                        error: putResult.error ?? "Upload failed.",
                      }
                    : r,
                ),
              );
              setProcessedBytes((prev) => prev + file.size);
              continue;
            }

            setProcessedBytes((prev) => prev + file.size);

            const enqueueResult = await uploadCvService.enqueueFile(
              historyRow.id,
              jobId,
            );
            setRows((prev) =>
              prev.map((r, idx) =>
                idx === i
                  ? enqueueResult.ok
                    ? { ...r, status: "done" }
                    : {
                        ...r,
                        status: "error",
                        error: enqueueResult.error,
                      }
                  : r,
              ),
            );
          }
        };

        await Promise.all(
          Array.from(
            { length: Math.min(UPLOAD_CONCURRENCY, valid.length) },
            () => runWorker(),
          ),
        );
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Could not upload CVs.";
        triggerError(message);
        const unresolved = rowsRef.current.filter(
          (r) => r.status === "pending" || r.status === "uploading",
        );
        if (unresolved.length > 0) {
          setProcessedBytes(
            (prev) =>
              prev + unresolved.reduce((sum, r) => sum + r.file.size, 0),
          );
        }
        setRows((prev) =>
          prev.map((r) =>
            r.status === "pending" || r.status === "uploading"
              ? { ...r, status: "error", error: message }
              : r,
          ),
        );
      } finally {
        setPhase("done");
      }
    },
    [jobId, sourceKey, sourceOther, recruiter, triggerError],
  );

  const handleFiles = (files: FileList | File[]) => {
    void startUpload(Array.from(files));
  };

  const totalBytes = rows.reduce((sum, r) => sum + r.file.size, 0);
  const progressPct =
    totalBytes > 0
      ? Math.min(100, Math.round((processedBytes / totalBytes) * 100))
      : 0;
  const successCount = rows.filter((r) => r.status === "done").length;
  const failCount = rows.filter((r) => r.status === "error").length;

  return (
    <Modal state={modalState}>
      <Modal.Backdrop
        className="bg-black/40 backdrop-blur-sm"
        isDismissable={!isBusy}
        isKeyboardDismissDisabled={isBusy}
      >
        <Modal.Container className="w-full">
          <Modal.Dialog className="!max-w-3xl w-full min-w-0 overflow-hidden p-0">
            <Modal.CloseTrigger
              isDisabled={isBusy}
              aria-label={isBusy ? "Cannot close while busy" : "Close"}
            />
            <Modal.Header className="border-b border-divider px-6 py-4">
              <Modal.Heading className="text-xl">Add candidates</Modal.Heading>
              <p className="mt-1 text-sm text-muted">
                {mode === "manual"
                  ? "No AI parsing or JD-match runs for manual entries -- every field is used exactly as typed."
                  : jobId
                    ? "CVs will be linked to this job's campaign for AI parsing and JD-match scoring."
                    : "CVs will be added to the shared candidate pool for AI parsing. Assign them to a job later from each candidate's profile."}
              </p>
            </Modal.Header>

            {phase === "select" ? (
              <div className="px-6 pt-3">
                <Tabs
                  selectedKey={mode}
                  onSelectionChange={(key) => {
                    if (isBusy) return;
                    setMode(key as "auto" | "manual");
                  }}
                >
                  <Tabs.ListContainer>
                    <Tabs.List aria-label="Add candidates mode">
                      <Tabs.Tab id="auto">
                        <Tabs.Indicator />
                        Auto upload
                      </Tabs.Tab>
                      <Tabs.Tab id="manual">
                        <Tabs.Indicator />
                        Manual entry
                      </Tabs.Tab>
                    </Tabs.List>
                  </Tabs.ListContainer>
                </Tabs>
              </div>
            ) : null}

            <Modal.Body className="h-[min(58vh,460px)] overflow-y-auto px-6 py-4">
              {phase === "select" && mode === "manual" ? (
                <ManualCandidateForm
                  ref={manualFormRef}
                  jobId={jobId}
                  jobTitle={jobTitle}
                  onSaved={() => {
                    onUploaded?.();
                    // Close straight through the prop: `onSaved` only fires on a
                    // completed save, so the in-flight guard in
                    // `handleModalOpenChange` (which may still see a stale
                    // `manualBusy`) shouldn't get a vote here.
                    onOpenChange(false);
                  }}
                  onBusyChange={setManualBusy}
                />
              ) : phase === "select" ? (
                <div className="grid h-full grid-cols-1 gap-3 sm:grid-cols-2 sm:items-stretch">
                  <div className="flex flex-col gap-3">
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Target campaign
                      </Label>
                      <div className="mt-1.5 flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {jobId ? jobTitle : "Candidate pool"}
                        </span>
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-success/20 text-success">
                          <Lock className="size-3.5" aria-hidden />
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {jobId
                          ? "Fixed to this job — eligible for AI JD-match evaluation."
                          : "Not linked to any job — no JD-match scoring."}
                      </p>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Candidate source
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
                        <Select.Trigger className="h-10 w-full min-w-0 cursor-pointer">
                          <Select.Value />
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            {CANDIDATE_SOURCE_VALUES.map((s) => (
                              <ListBox.Item
                                key={s}
                                id={s}
                                textValue={s}
                                className="cursor-pointer"
                              >
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
                            placeholder="e.g. Career fair, referral…"
                            className="mt-1"
                          />
                        </TextField>
                      ) : null}
                    </div>

                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Recruiter
                      </Label>
                      <TextField className="mt-1.5">
                        <Input
                          value={recruiter}
                          onChange={(e) => {
                            recruiterTouchedRef.current = true;
                            setRecruiter(e.target.value);
                          }}
                          placeholder="Defaults to your username"
                          className="h-10 w-full"
                        />
                      </TextField>
                      <p className="mt-1 text-xs text-muted">
                        Who sourced these CVs — defaults to your username.
                      </p>
                    </div>
                  </div>

                  <div
                    className={`flex h-full min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-4 ${
                      dragOver
                        ? "border-accent bg-accent/5"
                        : "border-divider bg-content2/30"
                    }`}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      handleFiles(e.dataTransfer.files);
                    }}
                  >
                    <span className="flex size-14 items-center justify-center rounded-full bg-content2 text-foreground">
                      <UploadCloud className="size-6" aria-hidden />
                    </span>
                    <div className="min-w-0 text-center">
                      <p className="text-sm font-semibold text-foreground">
                        Drop CVs here to start
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        The system will automatically analyze files as soon as
                        they&apos;re uploaded.
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      className="cursor-pointer shrink-0"
                      onPress={() => fileInputRef.current?.click()}
                    >
                      <UploadCloud className="size-4" aria-hidden />
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
                        if (f?.length) handleFiles(f);
                        e.target.value = "";
                      }}
                    />
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      <Chip size="sm" variant="soft" color="default">
                        PDF
                      </Chip>
                      <Chip size="sm" variant="soft" color="default">
                        DOCX
                      </Chip>
                      <Chip size="sm" variant="soft" color="default">
                        max 25MB / file
                      </Chip>
                      <Chip size="sm" variant="soft" color="default">
                        up to {MAX_FILES_PER_UPLOAD} files
                      </Chip>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-4">
                  <div className="relative flex items-center justify-center pt-2">
                    <ProgressCircle
                      value={progressPct}
                      minValue={0}
                      maxValue={100}
                      aria-label="Upload progress"
                    >
                      <ProgressCircle.Track className="size-28">
                        <ProgressCircle.TrackCircle />
                        <ProgressCircle.FillCircle />
                      </ProgressCircle.Track>
                    </ProgressCircle>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-semibold text-foreground pt-2">
                        {progressPct}%
                      </span>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">
                      {isUploading
                        ? "Uploading CVs to the server…"
                        : failCount > 0
                          ? "Upload complete (with errors)"
                          : "Upload complete"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatBytes(processedBytes)} / {formatBytes(totalBytes)}
                      {" · "}
                      {successCount}/{rows.length} files
                    </p>
                  </div>

                  {isUploading ? (
                    <div className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
                      <AlertTriangle className="size-4 shrink-0" aria-hidden />
                      Do not close or refresh this page until the upload
                      finishes — leaving now will interrupt it.
                    </div>
                  ) : null}

                  <Card variant="secondary" className="w-full">
                    <Card.Content className="max-h-56 overflow-y-auto px-2 py-1">
                      <ul className="divide-y divide-divider">
                        {rows.map((row, idx) => (
                          <li
                            key={`${row.file.name}-${idx}`}
                            className="flex items-center gap-2 px-2 py-2"
                          >
                            <RowStatusIcon status={row.status} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-foreground">
                                {row.file.name}
                              </p>
                              {row.error ? (
                                <p className="truncate text-xs text-danger">
                                  {row.error}
                                </p>
                              ) : null}
                            </div>
                            <span className="shrink-0 text-xs text-muted">
                              {formatBytes(row.file.size)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Card.Content>
                  </Card>
                </div>
              )}
            </Modal.Body>

            <Modal.Footer className="justify-end gap-2 border-t border-divider px-6 py-4">
              <Button
                variant={phase === "done" ? "primary" : "secondary"}
                className="cursor-pointer"
                isDisabled={isBusy}
                onPress={() => handleModalOpenChange(false)}
              >
                {phase === "done" ? "Close" : "Cancel"}
              </Button>
              {phase === "select" && mode === "manual" ? (
                <Button
                  variant="primary"
                  className="cursor-pointer"
                  isDisabled={manualBusy}
                  onPress={() => manualFormRef.current?.submit()}
                >
                  {manualBusy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Saving…
                    </>
                  ) : (
                    "Save candidate"
                  )}
                </Button>
              ) : null}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
