import { useState, useRef, useCallback, useMemo } from "react";
import { useOverlayState } from "@heroui/react";
import { createClient } from "@/lib/supabase/client";
import { parseViewerEmailInput } from "@/lib/admin/jd-viewer-sync";
import { extractedApiToFormPatch } from "@/lib/jd/extracted-to-form";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";
import type { JobDescriptionFormData } from "@/lib/jd/types";
import { JD_BUCKET, MAX_JD_BYTES, isAllowedJdFilename } from "@/lib/jd/upload-constants";

const DEFAULT_FORM: JobDescriptionFormData = {
  position: "",
  department: "",
  employment_status: "",
  status: "Pending",
  update_note: "",
  work_location: "",
  reporting: "",
  role_overview: "",
  duties_and_responsibilities: "",
  experience_requirements_must_have: "",
  experience_requirements_nice_to_have: "",
  what_we_offer: "",
  start_date: "",
};

export function useJdCreateState(loadDescriptions: () => Promise<void>) {
  const supabase = useMemo(() => createClient(), []);
  const jdFileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<JobDescriptionFormData>(DEFAULT_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createViewerEmailsText, setCreateViewerEmailsText] = useState("");
  const [createViewerChapterIds, setCreateViewerChapterIds] = useState<string[]>([]);

  const [jdUploadPhase, setJdUploadPhase] = useState<"idle" | "uploading" | "extracting" | "done" | "error">("idle");
  const [jdUploadError, setJdUploadError] = useState<string | null>(null);
  const [jdDraftJobOpeningId, setJdDraftJobOpeningId] = useState<string | null>(null);
  const [jdSelectedFileName, setJdSelectedFileName] = useState<string | null>(null);
  const [jdDragOver, setJdDragOver] = useState(false);

  const authHeaders = useCallback(async () => {
    const h = await getSessionAuthorizationHeaders(supabase);
    return { "Content-Type": "application/json", ...h };
  }, [supabase]);

  const deleteJdDraftOnServer = useCallback(
    async (jobOpeningId: string) => {
      const h = await getSessionAuthorizationHeaders(supabase);
      await fetch(
        `/api/admin/job-openings/sign-upload?jobOpeningId=${encodeURIComponent(jobOpeningId)}`,
        { method: "DELETE", credentials: "include", headers: { ...h } },
      );
    },
    [supabase],
  );

  const resetUploadState = useCallback(() => {
    setJdUploadPhase("idle");
    setJdUploadError(null);
    setJdDraftJobOpeningId(null);
    setJdSelectedFileName(null);
    setJdDragOver(false);
    if (jdFileInputRef.current) jdFileInputRef.current.value = "";
  }, []);

  const jdModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        resetUploadState();
        setFormError(null);
        setForm(DEFAULT_FORM);
        setCreateViewerEmailsText("");
        setCreateViewerChapterIds([]);
      }
    },
  });

  const setField = useCallback(<K extends keyof JobDescriptionFormData>(
    key: K,
    value: JobDescriptionFormData[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const ingestJdFile = useCallback(
    async (file: File) => {
      if (!isAllowedJdFilename(file.name)) {
        setJdUploadError("Only PDF, DOCX, or TXT files are supported.");
        setJdUploadPhase("error");
        return;
      }
      if (file.size > MAX_JD_BYTES) {
        setJdUploadError("File exceeds 10 MB limit.");
        setJdUploadPhase("error");
        return;
      }
      setJdUploadError(null);
      setJdUploadPhase("uploading");
      let newJobId: string | undefined;
      try {
        const h = await getSessionAuthorizationHeaders(supabase);
        if (!h.Authorization) {
          setJdUploadError("Session expired. Sign in again.");
          setJdUploadPhase("error");
          return;
        }
        const signRes = await fetch("/api/admin/job-openings/sign-upload", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...h },
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type || null,
            replaceJobOpeningId: jdDraftJobOpeningId,
          }),
        });
        const signJson = (await signRes.json()) as {
          error?: string;
          jobOpeningId?: string;
          path?: string;
          token?: string;
        };
        if (!signRes.ok || !signJson.jobOpeningId || !signJson.path || !signJson.token) {
          throw new Error(signJson.error ?? "Could not start upload.");
        }
        newJobId = signJson.jobOpeningId;
        const { error: upErr } = await supabase.storage
          .from(JD_BUCKET)
          .uploadToSignedUrl(signJson.path, signJson.token, file, {
            contentType: file.type || undefined,
          });
        if (upErr) throw new Error(upErr.message);

        setJdDraftJobOpeningId(signJson.jobOpeningId);
        setJdSelectedFileName(file.name);
        setJdUploadPhase("extracting");
        setJdUploadError(null);

        try {
          const exRes = await fetch("/api/admin/job-descriptions/extract", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", ...h },
            body: JSON.stringify({ jobOpeningId: signJson.jobOpeningId }),
          });
          const exJson = (await exRes.json()) as {
            error?: string;
            extracted?: Record<string, unknown>;
          };
          if (!exRes.ok || !exJson.extracted) {
            setJdUploadError(
              exJson.error ??
                "Could not read the JD with AI. You can fill the form manually.",
            );
          } else {
            const patch = extractedApiToFormPatch(exJson.extracted);
            setForm((prev) => ({ ...prev, ...patch }));
          }
        } catch {
          setJdUploadError(
            "Could not run AI extraction. Fill the form manually.",
          );
        }

        setJdUploadPhase("done");
      } catch (e) {
        setJdUploadError(e instanceof Error ? e.message : "Unknown error.");
        setJdUploadPhase("error");
        if (newJobId) {
          await deleteJdDraftOnServer(newJobId);
          setJdDraftJobOpeningId(null);
        }
      }
    },
    [deleteJdDraftOnServer, jdDraftJobOpeningId, supabase],
  );

  const discardJdDraft = useCallback(async () => {
    if (jdDraftJobOpeningId) await deleteJdDraftOnServer(jdDraftJobOpeningId);
    resetUploadState();
    jdModal.close();
  }, [deleteJdDraftOnServer, jdDraftJobOpeningId, jdModal, resetUploadState]);

  const handleSave = useCallback(
    async (asDraft: boolean) => {
      setFormSubmitting(true);
      setFormError(null);
      const positionFromFile =
        jdSelectedFileName?.replace(/\.[^./\\]+$/i, "").trim().slice(0, 50) ||
        "";
      const resolvedPosition =
        form.position.trim() || positionFromFile || "Untitled JD";
      const payload: JobDescriptionFormData = {
        ...form,
        position: resolvedPosition,
        status: asDraft
          ? "Pending"
          : form.status === "Pending"
            ? "Hiring"
            : form.status,
      };
      const postBodyBase = jdDraftJobOpeningId
        ? { ...payload, jdDraftJobOpeningId }
        : payload;
      const viewerEmails = parseViewerEmailInput(createViewerEmailsText);
      const postBody = {
        ...postBodyBase,
        viewerEmails,
        viewerChapterIds: createViewerChapterIds,
      };
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/admin/job-descriptions", {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify(postBody),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Save failed.");
        jdModal.close();
        await loadDescriptions();
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "Unknown error.");
      } finally {
        setFormSubmitting(false);
      }
    },
    [
      authHeaders,
      createViewerChapterIds,
      createViewerEmailsText,
      form,
      jdDraftJobOpeningId,
      jdModal,
      jdSelectedFileName,
      loadDescriptions,
    ],
  );

  return {
    form,
    setField,
    formSubmitting,
    formError,
    createViewerEmailsText,
    setCreateViewerEmailsText,
    createViewerChapterIds,
    setCreateViewerChapterIds,
    jdUploadPhase,
    jdUploadError,
    jdSelectedFileName,
    jdDragOver,
    setJdDragOver,
    jdFileInputRef,
    jdModal,
    ingestJdFile,
    discardJdDraft,
    handleSave,
  };
}
