"use client";

import {
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";

import { Alert, Button } from "@heroui/react";
import { SectionCard } from "@/components/admin/shell/cards";
import { UploadCloud, FileText, Download, Trash2, Eye } from "lucide-react";

import {
  CANDIDATE_EVAL_TEMPLATE_BUCKET,
  MAX_CANDIDATE_EVAL_TEMPLATE_BYTES,
  isAllowedCandidateEvalTemplateFilename,
} from "@/lib/admin/candidate-evaluation-template-constants";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";

export type TemplateInfo = {
  hasFile: boolean;
  originalFilename: string | null;
  mimeType: string | null;
  updatedAt: string | null;
};

export function CandidateEvaluationTemplateManager({
  templateInfoPromise,
}: {
  templateInfoPromise: Promise<TemplateInfo>;
}) {
  const initialInfo = use(templateInfoPromise);
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<TemplateInfo | null>(initialInfo);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const authHeaders = useCallback(
    () => getSessionAuthorizationHeaders(supabase),
    [supabase],
  );

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const h = await authHeaders();
      const res = await fetch("/api/admin/candidate-evaluation-template", {
        credentials: "include",
        headers: {
          ...(h.Authorization ? { Authorization: h.Authorization } : {}),
        },
      });
      const json = (await res.json()) as TemplateInfo & { error?: string };
      if (!res.ok) {
        setLoadError(json.error ?? "Could not load template status.");
        return;
      }
      setInfo({
        hasFile: json.hasFile,
        originalFilename: json.originalFilename,
        mimeType: json.mimeType,
        updatedAt: json.updatedAt,
      });
    } catch {
      setLoadError("Could not load template status.");
    }
  }, [authHeaders]);

  const ingestFile = async (file: File) => {
    setActionError(null);
    if (!isAllowedCandidateEvalTemplateFilename(file.name)) {
      setActionError("Only PDF files are supported.");
      return;
    }
    if (file.size > MAX_CANDIDATE_EVAL_TEMPLATE_BYTES) {
      setActionError("File exceeds 10 MB limit.");
      return;
    }

    setBusy(true);
    try {
      const h = await authHeaders();
      if (!h.Authorization) {
        setActionError("Session expired. Sign in again.");
        return;
      }

      const signRes = await fetch(
        "/api/admin/candidate-evaluation-template/sign-upload",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...h },
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type || null,
          }),
        },
      );
      const signJson = (await signRes.json()) as {
        error?: string;
        path?: string;
        token?: string;
      };
      if (!signRes.ok || !signJson.path || !signJson.token) {
        throw new Error(signJson.error ?? "Could not start upload.");
      }

      const { error: upErr } = await supabase.storage
        .from(CANDIDATE_EVAL_TEMPLATE_BUCKET)
        .uploadToSignedUrl(signJson.path, signJson.token, file, {
          contentType: file.type || "application/pdf",
        });
      if (upErr) throw new Error(upErr.message);

      const commitRes = await fetch(
        "/api/admin/candidate-evaluation-template/commit",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...h },
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
    setActionError(null);
    setBusy(true);
    try {
      const h = await authHeaders();
      if (!h.Authorization) {
        setActionError("Session expired. Sign in again.");
        return;
      }
      const res = await fetch("/api/admin/candidate-evaluation-template", {
        method: "DELETE",
        credentials: "include",
        headers: {
          ...(h.Authorization ? { Authorization: h.Authorization } : {}),
        },
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

  const getTemplateSignedUrl = useCallback(async (): Promise<string> => {
    const { data: row } = await supabase
      .from("candidate_evaluation_template")
      .select("storage_path")
      .eq("id", 1)
      .maybeSingle();
    const path = (row as { storage_path: string | null } | null)?.storage_path;
    if (!path) {
      throw new Error("No file path on record.");
    }
    const { data: signed, error } = await supabase.storage
      .from(CANDIDATE_EVAL_TEMPLATE_BUCKET)
      .createSignedUrl(path, 3600);
    if (error || !signed?.signedUrl) {
      throw new Error(
        error?.message ?? "Could not create link for the template.",
      );
    }
    return signed.signedUrl;
  }, [supabase]);

  const onPreview = async () => {
    setActionError(null);
    if (!info?.hasFile) return;
    try {
      const url = await getTemplateSignedUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Preview failed.");
    }
  };

  const onDownload = async () => {
    setActionError(null);
    if (!info?.hasFile) return;
    try {
      const url = await getTemplateSignedUrl();
      const filename =
        info.originalFilename?.trim() || "evaluation-template.pdf";
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Could not download file.");
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
      } catch {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Download failed.");
    }
  };

  const updatedLabel =
    info?.updatedAt != null
      ? new Date(info.updatedAt).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : null;

  return (
    <SectionCard>
      <div className="flex flex-col gap-5">
        {loadError ? (
          <Alert status="danger" className="rounded-xl">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{loadError}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}

        {/* Current file info */}
        {info?.hasFile ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-accent/25 bg-gradient-to-r from-accent/5 to-indigo-500/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-11 w-11 shrink-0 flex items-center justify-center bg-gradient-to-br from-accent/20 to-indigo-500/20 rounded-xl text-accent border border-accent/20 shadow-sm shadow-accent/10">
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
                onPress={() => void onPreview()}
              >
                <Eye className="h-3.5 w-3.5 mr-1" />
                Preview
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-8 px-3 rounded-xl border border-divider text-xs font-bold"
                isDisabled={busy}
                onPress={() => void onDownload()}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Download
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="h-8 px-3 rounded-xl text-xs font-bold"
                isDisabled={busy}
                onPress={onRemove}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-divider bg-surface-secondary/20 px-4 py-3 text-xs text-muted font-medium">
            <FileText className="h-4 w-4 shrink-0 text-muted/60" />
            No evaluation template uploaded yet.
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

        {/* Upload dropzone */}
        <div
          className={
            dragOver
              ? "group relative rounded-2xl border-2 border-dashed border-accent bg-gradient-to-br from-accent/8 to-indigo-500/8 p-10 text-center transition-all duration-200 cursor-pointer ring-4 ring-accent/10"
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
          {/* Ambient glow on drag */}
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
              className="mt-1 h-9 px-6 rounded-xl bg-accent text-white font-bold text-xs shadow-md shadow-accent/20 hover:bg-accent/90"
              isDisabled={busy}
              onPress={() => fileInputRef.current?.click()}
            >
              {busy ? "Uploading…" : info?.hasFile ? "Replace PDF" : "Browse Files"}
            </Button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
