"use client";

import { useCallback } from "react";
import { AlertCircle, Loader2, Paperclip, X } from "lucide-react";

import type { EmailAttachmentItem } from "@/components/admin/email-config/types";

const JSON_HEADERS = { "Content-Type": "application/json" };

export type PendingAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string | null;
  uploading: boolean;
  error: string | null;
};

export type AttachmentPayload = {
  fileName: string;
  mimeType: string;
  storagePath: string;
  fileSize: number;
};

export function pendingAttachmentsToPayload(
  attachments: PendingAttachment[],
): AttachmentPayload[] {
  return attachments
    .filter((a): a is PendingAttachment & { storagePath: string } => !!a.storagePath)
    .map((a) => ({
      fileName: a.fileName,
      mimeType: a.mimeType,
      storagePath: a.storagePath,
      fileSize: a.fileSize,
    }));
}

export function attachmentItemsToPending(
  items: EmailAttachmentItem[],
): PendingAttachment[] {
  return items.map((a) => ({
    id: a.id,
    fileName: a.file_name,
    mimeType: a.mime_type,
    fileSize: Number(a.file_size),
    storagePath: a.storage_path,
    uploading: false,
    error: null,
  }));
}

export function attachmentsStillUploading(attachments: PendingAttachment[]): boolean {
  return attachments.some((a) => a.uploading || !!a.error);
}

/**
 * Shared "attach a file" widget: uploads directly to S3 via a presigned URL
 * (see /api/admin/email/attachments/sign-upload), then reports the resulting
 * storage path back through `onChange`. Used by the template editor and both
 * compose modals (single-candidate and bulk) so upload/remove/error-state
 * handling only lives in one place.
 *
 * Renders as a toolbar-style strip (icon trigger + inline chips) so callers
 * can drop it straight into a composer's footer instead of a separate
 * labeled section.
 */
export function AttachmentUploader({
  attachments,
  onChange,
  disabled,
  label,
}: {
  attachments: PendingAttachment[];
  onChange: (updater: (prev: PendingAttachment[]) => PendingAttachment[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const handleAttachFiles = useCallback(
    async (files: FileList) => {
      const newItems: PendingAttachment[] = Array.from(files).map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        storagePath: null,
        uploading: true,
        error: null,
      }));
      onChange((prev) => [...prev, ...newItems]);

      await Promise.all(
        Array.from(files).map(async (file, idx) => {
          const item = newItems[idx];
          try {
            const signRes = await fetch("/api/admin/email/attachments/sign-upload", {
              method: "POST",
              credentials: "include",
              headers: JSON_HEADERS,
              body: JSON.stringify({
                filename: file.name,
                mimeType: file.type || null,
                fileSize: file.size,
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
            if (!putRes.ok) throw new Error("Could not upload file.");

            onChange((prev) =>
              prev.map((a) =>
                a.id === item.id
                  ? { ...a, uploading: false, storagePath: signJson.path! }
                  : a,
              ),
            );
          } catch (e) {
            onChange((prev) =>
              prev.map((a) =>
                a.id === item.id
                  ? {
                      ...a,
                      uploading: false,
                      error: e instanceof Error ? e.message : "Upload failed.",
                    }
                  : a,
              ),
            );
          }
        }),
      );
    },
    [onChange],
  );

  const removeAttachment = useCallback(
    (id: string) => {
      onChange((prev) => prev.filter((a) => a.id !== id));
    },
    [onChange],
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label
        title="Attach file"
        aria-label="Attach file"
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-secondary hover:text-foreground ${
          disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
        }`}
      >
        <Paperclip className="h-3.5 w-3.5" />
        <input
          type="file"
          multiple
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files?.length) void handleAttachFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {label ? <span className="text-xs font-semibold text-muted">{label}</span> : null}

      {attachments.map((a) => (
        <div
          key={a.id}
          className={`group flex max-w-[14rem] items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-1.5 text-xs ${
            a.error
              ? "border-danger/30 bg-danger/5"
              : "border-divider bg-surface-secondary/40"
          }`}
        >
          {a.uploading ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted" />
          ) : a.error ? (
            <AlertCircle className="h-3 w-3 shrink-0 text-danger" />
          ) : (
            <Paperclip className="h-3 w-3 shrink-0 text-muted" />
          )}
          <span
            className={`truncate ${a.error ? "text-danger" : "text-foreground"}`}
            title={a.error ?? a.fileName}
          >
            {a.error ?? a.fileName}
          </span>
          <button
            type="button"
            onClick={() => removeAttachment(a.id)}
            aria-label={`Remove ${a.fileName}`}
            className="shrink-0 rounded-full p-0.5 text-muted hover:bg-surface-secondary hover:text-danger"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Read-only chips for attachments inherited from the selected template -- not removable here; edit the template itself to change them. */
export function TemplateAttachmentsPreview({
  attachments,
}: {
  attachments: EmailAttachmentItem[];
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold text-muted">From template</span>
      {attachments.map((a) => (
        <div
          key={a.id}
          className="flex max-w-[14rem] items-center gap-1.5 rounded-full border border-divider bg-surface-secondary/20 py-1 pl-2.5 pr-2.5 text-xs"
        >
          <Paperclip className="h-3 w-3 shrink-0 text-muted" />
          <span className="truncate text-foreground" title={a.file_name}>
            {a.file_name}
          </span>
        </div>
      ))}
    </div>
  );
}
