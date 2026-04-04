"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";

import { Button, Card, Label } from "@heroui/react";

import {
  CANDIDATE_EVAL_TEMPLATE_BUCKET,
  MAX_CANDIDATE_EVAL_TEMPLATE_BYTES,
  isAllowedCandidateEvalTemplateFilename,
} from "@/lib/admin/candidate-evaluation-template-constants";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";

type TemplateInfo = {
  hasFile: boolean;
  originalFilename: string | null;
  mimeType: string | null;
  updatedAt: string | null;
};

export function CandidateEvaluationTemplateManager() {
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<TemplateInfo | null>(null);
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  const onDownload = async () => {
    setActionError(null);
    if (!info?.hasFile) return;
    try {
      const { data: row } = await supabase
        .from("candidate_evaluation_template")
        .select("storage_path")
        .eq("id", 1)
        .maybeSingle();
      const path = (row as { storage_path: string | null } | null)
        ?.storage_path;
      if (!path) {
        setActionError("No file path on record.");
        return;
      }
      const { data: signed, error } = await supabase.storage
        .from(CANDIDATE_EVAL_TEMPLATE_BUCKET)
        .createSignedUrl(path, 3600);
      if (error || !signed?.signedUrl) {
        setActionError(error?.message ?? "Could not create download link.");
        return;
      }
      window.open(signed.signedUrl, "_blank", "noopener,noreferrer");
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Evaluation template
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Upload a single PDF used as the organisation-wide candidate interview
          evaluation form (for example, an interview evaluation sheet).
        </p>
      </div>

      {loadError ? (
        <p className="text-sm text-danger" role="alert">
          {loadError}
        </p>
      ) : null}

      <Card>
        <Card.Header>
          <Card.Title>Template file</Card.Title>
          <Card.Description>
            One active file at a time. Replacing the template deletes the
            previous file. Maximum size 10 MB, PDF only.
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          {info?.hasFile ? (
            <div className="rounded-xl border border-divider bg-surface-secondary px-4 py-3 text-sm">
              <p className="font-medium text-foreground">
                {info.originalFilename ?? "evaluation-template.pdf"}
              </p>
              {updatedLabel ? (
                <p className="mt-1 text-muted">Last updated {updatedLabel}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted">No template uploaded yet.</p>
          )}

          {actionError ? (
            <p className="text-sm text-danger" role="alert">
              {actionError}
            </p>
          ) : null}

          <div
            className={
              dragOver
                ? "rounded-xl border-2 border-dashed border-accent bg-accent/5 p-8 text-center transition-colors"
                : "rounded-xl border-2 border-dashed border-divider p-8 text-center transition-colors"
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
            <Label className="text-sm font-medium text-foreground">
              Drop a PDF here or choose a file
            </Label>
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
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button
                variant="primary"
                isDisabled={busy}
                onPress={() => fileInputRef.current?.click()}
              >
                {info?.hasFile ? "Replace PDF" : "Upload PDF"}
              </Button>
              {info?.hasFile ? (
                <>
                  <Button variant="secondary" isDisabled={busy} onPress={onDownload}>
                    Download
                  </Button>
                  <Button variant="danger" isDisabled={busy} onPress={onRemove}>
                    Remove
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
