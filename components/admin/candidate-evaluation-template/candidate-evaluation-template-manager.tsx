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

import { Alert, Button, Label } from "@heroui/react";
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
    const path = (row as { storage_path: string | null } | null)
      ?.storage_path;
    if (!path) {
      throw new Error("No file path on record.");
    }
    const { data: signed, error } = await supabase.storage
      .from(CANDIDATE_EVAL_TEMPLATE_BUCKET)
      .createSignedUrl(path, 3600);
    if (error || !signed?.signedUrl) {
      throw new Error(error?.message ?? "Could not create link for the template.");
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
    <SectionCard
      title="Template File Configuration"
      description="One active evaluation file at a time. Maximum file size is 10 MB. PDF format only."
    >
      <div className="flex flex-col gap-4">
        {loadError ? (
          <p className="text-sm text-danger font-semibold" role="alert">
            {loadError}
          </p>
        ) : null}

        {info?.hasFile ? (
          <div className="flex flex-col gap-3 rounded-xl border border-divider bg-surface-secondary/40 p-4 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-10 w-10 shrink-0 flex items-center justify-center bg-accent/10 rounded-xl text-accent border border-accent/20">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-foreground truncate text-sm">
                  {info.originalFilename ?? "evaluation-template.pdf"}
                </p>
                {updatedLabel ? (
                  <p className="mt-1 text-muted font-medium text-[10px]">
                    Last updated {updatedLabel}
                  </p>
                ) : null}
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="h-8 px-3 rounded-lg border border-divider shrink-0 text-xs font-bold"
              isDisabled={busy}
              onPress={() => void onPreview()}
            >
              <Eye className="h-3.5 w-3.5 mr-1" />
              Preview
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted font-medium py-3 text-center bg-surface-secondary/20 rounded-xl border border-dashed border-divider">
            No template uploaded yet.
          </p>
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

        <div
          className={
            dragOver
              ? "rounded-xl border-2 border-dashed border-accent bg-accent/5 p-8 text-center transition-colors cursor-pointer"
              : "rounded-xl border-2 border-dashed border-divider bg-surface-secondary/10 p-8 text-center transition-colors hover:bg-surface-secondary/20 cursor-pointer"
          }
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
          <div className="flex flex-col items-center justify-center">
            <UploadCloud className="h-8 w-8 text-muted mb-2 animate-bounce" />
            <Label className="text-xs font-semibold text-muted mb-1 block">
              Drag and drop your PDF here or browse
            </Label>
            <p className="text-[10px] text-muted/60 mb-4 font-semibold">
              PDF files up to 10MB
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
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="primary"
              className="h-8 px-4 rounded-lg bg-accent text-white font-bold text-xs"
              isDisabled={busy}
              onPress={() => fileInputRef.current?.click()}
            >
              {info?.hasFile ? "Replace PDF" : "Upload PDF"}
            </Button>
            {info?.hasFile ? (
              <>
                <Button
                  variant="secondary"
                  className="h-8 px-3 rounded-lg border border-divider text-xs font-bold"
                  isDisabled={busy}
                  onPress={() => void onDownload()}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Download
                </Button>
                <Button
                  variant="danger"
                  className="h-8 px-3 rounded-lg border border-red-200 hover:bg-red-50 text-xs font-bold text-danger"
                  isDisabled={busy}
                  onPress={onRemove}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Remove
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
