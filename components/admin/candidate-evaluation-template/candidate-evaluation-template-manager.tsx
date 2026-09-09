"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";

import {
  Alert,
  AlertDialog,
  Button,
  Input,
  Label,
  Modal,
  Spinner,
  TextArea,
  TextField,
  useOverlayState,
} from "@heroui/react";
import { SectionCard } from "@/components/admin/shell/cards";
import {
  UploadCloud,
  FileText,
  Download,
  Trash2,
  Eye,
  Type,
  Pencil,
  Plus,
} from "lucide-react";

import {
  isAllowedCandidateEvalTemplateFilename,
  MAX_CANDIDATE_EVAL_TEMPLATE_BYTES,
  MAX_CANDIDATE_EVAL_TEMPLATE_TEXT_LEN,
  MAX_EVAL_TEMPLATE_TITLE_LEN,
} from "@/lib/admin/candidate-evaluation-template-constants";
import { formatDisplayDateTime } from "@/lib/format-date";

export type LibraryTemplate = {
  id: string;
  title: string | null;
  hasFile: boolean;
  originalFilename: string | null;
  mimeType: string | null;
  hasText: boolean;
  contentText: string | null;
  updatedAt: string | null;
  /** Who created it -- shown since this list is every HR/admin's entries, not just the viewer's own. */
  createdByLabel: string | null;
  /** Compared against `currentUserId` to decide whether Edit/Delete show --
   * both stay owner-scoped server-side even though reading the list doesn't. */
  createdById: string | null;
};

type Mode = "file" | "text";

const JSON_HEADERS = { "Content-Type": "application/json" };
const TEMPLATES_URL = "/api/admin/evaluation-templates";

/**
 * Manages the evaluation template library (`job_evaluate_templates` rows
 * with `job_id` NULL, migration 1788939996978) -- create, edit, and delete
 * templates independent of any job. This page is HR/admin-only, and the list
 * is every HR/admin's entries, not just the viewer's own (see GET
 * /api/admin/evaluation-templates); Edit/Delete stay owner-scoped though
 * (`currentUserId` gates the buttons client-side, `created_by` enforces it
 * server-side), so `Preview`/`Download` are the only actions available on
 * someone else's entry. Attaching one to a job happens elsewhere, at
 * job-creation time (the "reuse an existing evaluation template" picker in
 * the Create Job modal).
 *
 * Replaces the old per-job picker-and-editor this page used to be: editing a
 * job's *already-attached* template (as opposed to a library entry) has no
 * UI right now -- the job-scoped API
 * (`/api/admin/job-descriptions/[id]/evaluation-template`) still exists and
 * works, it's just not wired into any screen.
 */
export function CandidateEvaluationTemplateManager({
  currentUserId,
}: {
  /** Gates Edit/Delete per-row -- the list itself shows every HR/admin's
   * entries, but mutating one is still owner-scoped server-side. */
  currentUserId: string;
}) {
  const [templates, setTemplates] = useState<LibraryTemplate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(TEMPLATES_URL, { credentials: "include", cache: "no-store" });
      const json = (await res.json()) as { templates?: LibraryTemplate[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load templates.");
      setTemplates(json.templates ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load templates.");
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // --- Create/edit modal ----------------------------------------------
  const [editingId, setEditingId] = useState<string | null>(null);
  const draftStoragePathRef = useRef<string | null>(null);
  const skipDraftCleanupRef = useRef(false);

  const deleteDraftOnServer = useCallback(async (storagePath: string) => {
    await fetch(
      `/api/admin/evaluation-templates/sign-upload?path=${encodeURIComponent(storagePath)}`,
      { method: "DELETE", credentials: "include" },
    );
  }, []);

  const formModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        if (skipDraftCleanupRef.current) {
          skipDraftCleanupRef.current = false;
        } else {
          const draftPath = draftStoragePathRef.current;
          if (draftPath) void deleteDraftOnServer(draftPath);
        }
        draftStoragePathRef.current = null;
        setEditingId(null);
      }
    },
  });

  const openCreate = () => {
    setEditingId(null);
    formModal.open();
  };
  const openEdit = (t: LibraryTemplate) => {
    setEditingId(t.id);
    formModal.open();
  };

  const editingTemplate = templates?.find((t) => t.id === editingId) ?? null;

  // --- Delete confirmation ----------------------------------------------
  const [templatePendingDelete, setTemplatePendingDelete] = useState<LibraryTemplate | null>(
    null,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openDeleteDialog = (t: LibraryTemplate) => {
    setTemplatePendingDelete(t);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!templatePendingDelete) return;
    setDeleteInProgress(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${TEMPLATES_URL}/${templatePendingDelete.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Could not delete template.");
      }
      if (editingId === templatePendingDelete.id) formModal.close();
      setDeleteDialogOpen(false);
      setTemplatePendingDelete(null);
      await load();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Could not delete template.");
    } finally {
      setDeleteInProgress(false);
    }
  };

  const onDownload = (t: LibraryTemplate) => {
    window.open(`${TEMPLATES_URL}/${t.id}/download`, "_blank", "noopener,noreferrer");
  };

  return (
    <SectionCard>
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Template library</p>
            <p className="text-xs text-muted">
              Shared across HR/admin -- attach one to a job from the "Reuse an
              evaluation template" picker when creating it.
            </p>
          </div>
          <Button size="sm" onPress={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            New template
          </Button>
        </div>

        {loadError && (
          <Alert status="danger" className="rounded-xl">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{loadError}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {templates === null ? (
          <p className="text-sm text-muted">Loading templates…</p>
        ) : templates.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-divider bg-surface-secondary/20 px-4 py-3 text-xs text-muted font-medium">
            <FileText className="h-4 w-4 shrink-0 text-muted/60" />
            No templates yet. Create one to reuse it across jobs.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-3 rounded-2xl border border-divider bg-surface-secondary/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="h-11 w-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-accent/20 to-brand-gold/20 rounded-xl text-accent border border-accent/20 shadow-sm shadow-accent/10">
                    {t.hasFile ? <FileText className="h-5 w-5" /> : <Type className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-foreground truncate text-sm">
                      {t.title ?? "Untitled"}
                    </p>
                    <p className="mt-0.5 text-muted font-medium text-[10px]">
                      {t.hasFile ? t.originalFilename ?? "PDF" : "Plain text"}
                      {t.createdByLabel ? ` · by ${t.createdByLabel}` : ""}
                      {t.updatedAt ? ` · Updated ${formatDisplayDateTime(t.updatedAt)}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {t.hasFile && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        isIconOnly
                        aria-label="Preview template"
                        className="h-8 w-8 rounded-lg border border-divider text-muted hover:bg-surface-tertiary hover:text-foreground"
                        onPress={() =>
                          window.open(
                            `${TEMPLATES_URL}/${t.id}/download`,
                            "_blank",
                            "noopener,noreferrer",
                          )
                        }
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        isIconOnly
                        aria-label="Download template"
                        className="h-8 w-8 rounded-lg border border-divider text-muted hover:bg-surface-tertiary hover:text-foreground"
                        onPress={() => onDownload(t)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  {t.createdById === currentUserId && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        isIconOnly
                        aria-label="Edit template"
                        className="h-8 w-8 rounded-lg border border-divider text-muted hover:bg-surface-tertiary hover:text-foreground"
                        onPress={() => openEdit(t)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        isIconOnly
                        aria-label="Delete template"
                        className="h-8 w-8 rounded-lg border border-divider text-danger hover:bg-danger/10"
                        onPress={() => openDeleteDialog(t)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal.Backdrop
        className="bg-black/40 backdrop-blur-sm"
        isOpen={formModal.isOpen}
        onOpenChange={formModal.setOpen}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-xl overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider px-6 py-5">
              <Modal.Heading className="text-xl">
                {editingTemplate ? "Edit template" : "New template"}
              </Modal.Heading>
            </Modal.Header>
            <TemplateForm
              template={editingTemplate}
              onDraftPathChange={(path) => {
                draftStoragePathRef.current = path;
              }}
              onSaved={async () => {
                skipDraftCleanupRef.current = true;
                formModal.close();
                await load();
              }}
              onCancel={() => formModal.close()}
            />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <AlertDialog.Backdrop
        isOpen={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deleteInProgress) return;
          setDeleteDialogOpen(open);
          if (!open) {
            setTemplatePendingDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Delete template?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-sm text-muted">
                This will delete{" "}
                <strong className="text-foreground">
                  {templatePendingDelete?.title ?? "this template"}
                </strong>
                . This can&apos;t be undone.
              </p>
              {deleteError ? (
                <p className="mt-2 text-sm font-semibold text-danger" role="alert">
                  {deleteError}
                </p>
              ) : null}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary" isDisabled={deleteInProgress}>
                Cancel
              </Button>
              <Button
                variant="danger"
                isPending={deleteInProgress}
                onPress={() => void confirmDelete()}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <Spinner color="current" size="sm" className="mr-1.5" />
                    ) : null}
                    Delete
                  </>
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </SectionCard>
  );
}

/** Create (template === null) or edit an existing library entry. Rendered
 * inside the parent's Modal.Dialog -- returns Modal.Body/Modal.Footer as
 * siblings of the Modal.Header the parent already renders. */
function TemplateForm({
  template,
  onDraftPathChange,
  onSaved,
  onCancel,
}: {
  template: LibraryTemplate | null;
  /** Called whenever the in-progress upload's temp storage path changes, so
   * the parent can delete it if the modal gets dismissed (backdrop click,
   * Escape, the X button) without an explicit Cancel/Save. */
  onDraftPathChange: (path: string | null) => void;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const isEdit = template != null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(template?.title ?? "");
  const [mode, setMode] = useState<Mode>(template?.hasFile ? "file" : "text");
  const [textDraft, setTextDraft] = useState(template?.contentText ?? "");

  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [draftStoragePath, setDraftStoragePath] = useState<string | null>(null);
  const [draftMimeType, setDraftMimeType] = useState<string | null>(null);
  const [draftFileName, setDraftFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ingestFile = async (file: File) => {
    setError(null);
    if (!isAllowedCandidateEvalTemplateFilename(file.name)) {
      setError("Only PDF files are supported.");
      return;
    }
    if (file.size > MAX_CANDIDATE_EVAL_TEMPLATE_BYTES) {
      setError("File exceeds 10 MB limit.");
      return;
    }
    setUploadPhase("uploading");
    try {
      const signRes = await fetch("/api/admin/evaluation-templates/sign-upload", {
        method: "POST",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || null,
          replacePath: draftStoragePath,
        }),
      });
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
      if (!putRes.ok) throw new Error("Could not upload file to storage.");

      setDraftStoragePath(signJson.path);
      onDraftPathChange(signJson.path);
      setDraftMimeType(file.type || null);
      setDraftFileName(file.name);
      setUploadPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setUploadPhase("error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onSave = async () => {
    setError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    if (trimmedTitle.length > MAX_EVAL_TEMPLATE_TITLE_LEN) {
      setError(`Title must be at most ${MAX_EVAL_TEMPLATE_TITLE_LEN} characters.`);
      return;
    }

    const body: Record<string, unknown> = { title: trimmedTitle };
    if (mode === "text") {
      const trimmed = textDraft.trim();
      if (!trimmed) {
        setError("Criteria text cannot be empty.");
        return;
      }
      if (trimmed.length > MAX_CANDIDATE_EVAL_TEMPLATE_TEXT_LEN) {
        setError(`Criteria text must be at most ${MAX_CANDIDATE_EVAL_TEMPLATE_TEXT_LEN} characters.`);
        return;
      }
      body.contentText = trimmed;
    } else {
      if (draftStoragePath) {
        body.storagePath = draftStoragePath;
        body.originalFilename = draftFileName;
        body.mimeType = draftMimeType;
      } else if (!(isEdit && template?.hasFile)) {
        // No new file picked, and there's no existing file to fall back to
        // (a fresh template, or an edit that switched modes from text).
        setError("Upload a PDF.");
        return;
      }
      // Else: editing an existing file-backed template with no replacement
      // picked -- omit storagePath so the PATCH only touches the title.
    }

    setBusy(true);
    try {
      const url = isEdit ? `/api/admin/evaluation-templates/${template!.id}` : "/api/admin/evaluation-templates";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      // Row is committed server-side; the draft's temp key (if any) was
      // already moved, so no cleanup call is needed on success.
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal.Body className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-6">
        <TextField value={title} onChange={setTitle} maxLength={MAX_EVAL_TEMPLATE_TITLE_LEN}>
          <Label className="text-xs">Title</Label>
          <Input placeholder="e.g. Frontend engineer rubric" />
        </TextField>

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

        {mode === "text" ? (
          <TextField value={textDraft} onChange={setTextDraft}>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Evaluation criteria (plain text)
            </Label>
            <TextArea
              className="mt-2 min-h-[8rem]"
              placeholder="e.g. Minimum 4 years of experience, English IELTS 7.0+…"
            />
          </TextField>
        ) : (
          <div
            className={
              dragOver
                ? "group relative rounded-2xl border-2 border-dashed border-accent bg-gradient-to-br from-accent/8 to-brand-gold/10 p-8 text-center transition-all duration-200 cursor-pointer ring-4 ring-accent/10"
                : "group relative rounded-2xl border-2 border-dashed border-divider bg-surface-secondary/10 p-8 text-center transition-all duration-200 hover:border-accent/40 hover:bg-surface-secondary/25 cursor-pointer"
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
            <div className="relative flex flex-col items-center justify-center gap-2">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-all duration-200 ${
                  dragOver
                    ? "border-accent/40 bg-accent/15 text-accent scale-110"
                    : "border-divider bg-surface-secondary text-muted group-hover:border-accent/30 group-hover:bg-accent/10 group-hover:text-accent"
                }`}
              >
                <UploadCloud className={`h-5 w-5 ${dragOver ? "animate-bounce" : ""}`} />
              </div>
              <p className="text-sm font-semibold text-foreground">
                {uploadPhase === "uploading"
                  ? "Uploading…"
                  : draftFileName
                    ? draftFileName
                    : isEdit && template?.hasFile
                      ? `Current: ${template.originalFilename ?? "PDF"}`
                      : "Drag & drop your PDF here"}
              </p>
              <p className="text-[11px] font-medium text-muted">PDF files only · Max 10 MB</p>
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
                variant="secondary"
                size="sm"
                className="mt-1 h-8 px-4 rounded-xl text-xs font-bold"
                isDisabled={busy || uploadPhase === "uploading"}
                onPress={() => fileInputRef.current?.click()}
              >
                {isEdit && template?.hasFile ? "Replace PDF" : "Browse Files"}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <Alert status="danger" className="rounded-xl">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
      </Modal.Body>

      <Modal.Footer className="justify-end gap-2 border-t border-divider px-6 py-4">
        <Button variant="ghost" size="sm" isDisabled={busy} onPress={onCancel}>
          Cancel
        </Button>
        <Button size="sm" isDisabled={busy} onPress={() => void onSave()}>
          {busy ? "Saving…" : isEdit ? "Save changes" : "Create"}
        </Button>
      </Modal.Footer>
    </>
  );
}
