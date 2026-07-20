"use client";

import {
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";

import { Alert, Button, Label, ListBox, Select, TextArea, TextField } from "@heroui/react";
import { SectionCard } from "@/components/admin/shell/cards";
import { UploadCloud, FileText, Download, Trash2, Eye, Type } from "lucide-react";

import {
  isAllowedCandidateEvalTemplateFilename,
  MAX_CANDIDATE_EVAL_TEMPLATE_BYTES,
  MAX_CANDIDATE_EVAL_TEMPLATE_TEXT_LEN,
} from "@/lib/admin/candidate-evaluation-template-constants";

export type EvaluationTemplateJobOption = {
  id: string;
  position: string;
};

export type TemplateInfo = {
  hasFile: boolean;
  originalFilename: string | null;
  mimeType: string | null;
  hasText: boolean;
  contentText: string | null;
  updatedAt: string | null;
};

type Mode = "file" | "text";

const JSON_HEADERS = { "Content-Type": "application/json" };

export function CandidateEvaluationTemplateManager({
  jobsPromise,
}: {
  jobsPromise: Promise<EvaluationTemplateJobOption[]>;
}) {
  const jobs = use(jobsPromise);
  const [jobId, setJobId] = useState<string | null>(jobs[0]?.id ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<TemplateInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [mode, setMode] = useState<Mode>("file");
  const [textDraft, setTextDraft] = useState("");

  const templateUrl = jobId ? `/api/admin/job-descriptions/${jobId}/evaluation-template` : null;

  const refresh = useCallback(async () => {
    if (!templateUrl) return;
    setLoadError(null);
    setInfoLoading(true);
    try {
      const res = await fetch(templateUrl, { credentials: "include" });
      const json = (await res.json()) as TemplateInfo & { error?: string };
      if (!res.ok) {
        setLoadError(json.error ?? "Could not load template status.");
        return;
      }
      const loaded: TemplateInfo = {
        hasFile: json.hasFile,
        originalFilename: json.originalFilename,
        mimeType: json.mimeType,
        hasText: json.hasText,
        contentText: json.contentText,
        updatedAt: json.updatedAt,
      };
      setInfo(loaded);
      setMode(loaded.hasText ? "text" : "file");
      setTextDraft(loaded.contentText ?? "");
    } catch {
      setLoadError("Could not load template status.");
    } finally {
      setInfoLoading(false);
    }
  }, [templateUrl]);

  useEffect(() => {
    setInfo(null);
    setActionError(null);
    setMode("file");
    setTextDraft("");
    void refresh();
  }, [refresh]);

  const onSaveText = async () => {
    if (!templateUrl) return;
    setActionError(null);
    const trimmed = textDraft.trim();
    if (!trimmed) {
      setActionError("Criteria text cannot be empty.");
      return;
    }
    if (trimmed.length > MAX_CANDIDATE_EVAL_TEMPLATE_TEXT_LEN) {
      setActionError(
        `Criteria text must be at most ${MAX_CANDIDATE_EVAL_TEMPLATE_TEXT_LEN} characters.`,
      );
      return;
    }
    if (info?.hasFile) {
      const proceed = confirm(
        "Saving plain-text criteria will remove the uploaded PDF for this job. Continue?",
      );
      if (!proceed) return;
    }
    setBusy(true);
    try {
      const res = await fetch(templateUrl, {
        method: "PUT",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify({ contentText: trimmed }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Could not save criteria text.");
      }
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  const ingestFile = async (file: File) => {
    if (!jobId) return;
    setActionError(null);
    if (!isAllowedCandidateEvalTemplateFilename(file.name)) {
      setActionError("Only PDF files are supported.");
      return;
    }
    if (file.size > MAX_CANDIDATE_EVAL_TEMPLATE_BYTES) {
      setActionError("File exceeds 10 MB limit.");
      return;
    }
    if (info?.hasText) {
      const proceed = confirm(
        "Uploading a PDF will remove the saved plain-text criteria for this job. Continue?",
      );
      if (!proceed) return;
    }

    setBusy(true);
    try {
      const signRes = await fetch(
        `/api/admin/job-descriptions/${jobId}/evaluation-template/sign-upload`,
        {
          method: "POST",
          credentials: "include",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type || null,
          }),
        },
      );
      const signJson = (await signRes.json()) as {
        error?: string;
        path?: string;
        signedUrl?: string;
      };
      if (!signRes.ok || !signJson.path || !signJson.signedUrl) {
        throw new Error(signJson.error ?? "Could not start upload.");
      }

      const putRes = await fetch(signJson.signedUrl, {
        method: "PUT",
        body: file,
        headers: file.type ? { "Content-Type": file.type } : undefined,
      });
      if (!putRes.ok) {
        throw new Error("Could not upload file to storage.");
      }

      const commitRes = await fetch(
        `/api/admin/job-descriptions/${jobId}/evaluation-template/commit`,
        {
          method: "POST",
          credentials: "include",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            path: signJson.path,
            filename: file.name,
            mimeType: file.type || null,
          }),
        },
      );
      const commitJson = (await commitRes.json()) as { error?: string };
      if (!commitRes.ok) {
        throw new Error(commitJson.error ?? "Could not save template.");
      }

      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onRemove = async () => {
    if (!templateUrl) return;
    setActionError(null);
    setBusy(true);
    try {
      const res = await fetch(templateUrl, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Could not remove template.");
      }
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Remove failed.");
    } finally {
      setBusy(false);
    }
  };

  const downloadUrl = jobId
    ? `/api/admin/job-descriptions/${jobId}/evaluation-template/download`
    : null;

  const onPreview = () => {
    if (!downloadUrl) return;
    window.open(downloadUrl, "_blank", "noopener,noreferrer");
  };

  const onDownload = () => {
    if (!downloadUrl) return;
    window.open(downloadUrl, "_blank", "noopener,noreferrer");
  };

  const updatedLabel =
    info?.updatedAt != null
      ? new Date(info.updatedAt).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : null;

  const selectedJob = jobs.find((j) => j.id === jobId) ?? null;

  return (
    <SectionCard>
      <div className="flex flex-col gap-5">
        <div className="max-w-sm">
          <Select
            aria-label="Select a job"
            value={jobId ?? undefined}
            onChange={(key) => {
              if (typeof key === "string") setJobId(key);
            }}
          >
            <Select.Trigger className="h-9 w-full justify-start gap-1 px-3 text-sm">
              <span className="truncate">{selectedJob?.position ?? "Select a job…"}</span>
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {jobs.map((job) => (
                  <ListBox.Item key={job.id} id={job.id} textValue={job.position}>
                    {job.position}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>

        {!jobId ? (
          <p className="text-sm text-muted">
            No jobs available yet — create a job description first.
          </p>
        ) : (
          <>
            {loadError ? (
              <Alert status="danger" className="rounded-xl">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{loadError}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}

            <div className="inline-flex w-fit rounded-xl border border-divider bg-surface-secondary/20 p-1">
              <button
                type="button"
                onClick={() => setMode("file")}
                disabled={busy}
                className={
                  mode === "file"
                    ? "flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground"
                    : "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-muted hover:text-foreground"
                }
              >
                <FileText className="h-3.5 w-3.5" />
                Upload PDF
              </button>
              <button
                type="button"
                onClick={() => setMode("text")}
                disabled={busy}
                className={
                  mode === "text"
                    ? "flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground"
                    : "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-muted hover:text-foreground"
                }
              >
                <Type className="h-3.5 w-3.5" />
                Write plain text
              </button>
            </div>
            <p className="text-xs text-muted">
              A job's evaluation criteria is either an uploaded PDF or plain text, not both —
              saving one clears the other. Whichever is set feeds the AI CV-JD match score;
              only the PDF form can also be used to generate a filled evaluation PDF for
              interviewers.
            </p>

            {infoLoading && !info ? (
              <p className="text-sm text-muted">Loading template status…</p>
            ) : mode === "text" ? (
              <div className="flex flex-col gap-3">
                <TextField value={textDraft} onChange={setTextDraft}>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Evaluation criteria (plain text)
                  </Label>
                  <TextArea
                    className="mt-2 min-h-[10rem]"
                    placeholder="e.g. Minimum 4 years of experience, English IELTS 7.0+…"
                  />
                </TextField>
                <div className="flex items-center justify-between">
                  {info?.hasText && info.updatedAt ? (
                    <p className="text-[10px] font-medium text-muted">
                      Last updated {updatedLabel}
                    </p>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-2">
                    {info?.hasText ? (
                      <Button
                        variant="danger"
                        size="sm"
                        className="h-8 px-3 rounded-xl text-xs font-bold"
                        isDisabled={busy}
                        onPress={() => void onRemove()}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Remove
                      </Button>
                    ) : null}
                    <Button
                      variant="primary"
                      size="sm"
                      className="h-8 px-4 rounded-xl text-xs font-bold"
                      isDisabled={busy}
                      onPress={() => void onSaveText()}
                    >
                      {busy ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : info?.hasFile ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-accent/25 bg-gradient-to-r from-accent/5 to-brand-gold/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="h-11 w-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-accent/20 to-brand-gold/20 rounded-xl text-accent border border-accent/20 shadow-sm shadow-accent/10">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-foreground truncate text-sm">
                      {info.originalFilename ?? "evaluation-template.pdf"}
                    </p>
                    {updatedLabel ? (
                      <p className="mt-0.5 text-muted font-medium text-[10px]">
                        Last updated {updatedLabel}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 px-3 rounded-xl border border-divider text-xs font-bold"
                    isDisabled={busy}
                    onPress={onPreview}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    Preview
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 px-3 rounded-xl border border-divider text-xs font-bold"
                    isDisabled={busy}
                    onPress={onDownload}
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Download
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className="h-8 px-3 rounded-xl text-xs font-bold"
                    isDisabled={busy}
                    onPress={() => void onRemove()}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-divider bg-surface-secondary/20 px-4 py-3 text-xs text-muted font-medium">
                <FileText className="h-4 w-4 shrink-0 text-muted/60" />
                No PDF uploaded yet for this job.
              </div>
            )}

            {actionError ? (
              <Alert status="danger" className="rounded-xl">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>Error</Alert.Title>
                  <Alert.Description>{actionError}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}

            {/* Upload dropzone (file mode only) */}
            {mode === "file" ? (
              <div
                className={
                  dragOver
                    ? "group relative rounded-2xl border-2 border-dashed border-accent bg-gradient-to-br from-accent/8 to-brand-gold/10 p-10 text-center transition-all duration-200 cursor-pointer ring-4 ring-accent/10"
                    : "group relative rounded-2xl border-2 border-dashed border-divider bg-surface-secondary/10 p-10 text-center transition-all duration-200 hover:border-accent/40 hover:bg-surface-secondary/25 cursor-pointer"
                }
                onClick={() => !busy && fileInputRef.current?.click()}
                onDragOver={(e: DragEvent) => {
                  if (busy) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e: DragEvent) => {
                  if (busy) return;
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void ingestFile(f);
                }}
              >
                {dragOver && (
                  <div className="pointer-events-none absolute inset-0 rounded-2xl bg-accent/5 blur-xl" />
                )}
                <div className="relative flex flex-col items-center justify-center gap-3">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl border transition-all duration-200 ${
                      dragOver
                        ? "border-accent/40 bg-accent/15 text-accent shadow-lg shadow-accent/20 scale-110"
                        : "border-divider bg-surface-secondary text-muted group-hover:border-accent/30 group-hover:bg-accent/10 group-hover:text-accent"
                    }`}
                  >
                    <UploadCloud className={`h-6 w-6 ${dragOver ? "animate-bounce" : ""}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {dragOver ? "Drop to upload" : "Drag & drop your PDF here"}
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-muted">
                      PDF files only · Max 10 MB
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    accept=".pdf,application/pdf"
                    aria-hidden
                    tabIndex={-1}
                    disabled={busy}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const f = e.target.files?.[0];
                      if (f) void ingestFile(f);
                    }}
                  />
                  <Button
                    variant="primary"
                    className="mt-1 h-9 px-6 rounded-xl bg-accent text-accent-foreground font-bold text-xs shadow-md shadow-accent/20 hover:bg-accent/90"
                    isDisabled={busy}
                    onPress={() => fileInputRef.current?.click()}
                  >
                    {busy ? "Uploading…" : info?.hasFile ? "Replace PDF" : "Browse Files"}
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </SectionCard>
  );
}
