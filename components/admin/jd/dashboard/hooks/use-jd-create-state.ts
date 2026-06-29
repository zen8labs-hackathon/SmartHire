import { useState, useRef, useCallback, useMemo } from "react";
import { useOverlayState } from "@heroui/react";
import { createClient } from "@/lib/supabase/client";
import { parseViewerEmailInput } from "@/lib/admin/jd-viewer-sync";
import { extractedApiToFormPatch } from "@/lib/jd/extracted-to-form";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";
import type { JobDescriptionFormData } from "@/lib/jd/types";
import { JD_BUCKET, MAX_JD_BYTES, isAllowedJdFilename } from "@/lib/jd/upload-constants";
import { useToast } from "@/components/admin/toast-provider";

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
  hiring_deadline: "",
};

export function useJdCreateState(
  loadDescriptions: () => Promise<void>,
  allPipelineStages: readonly { id: string; label: string; code: string; color: string }[]
) {
  const supabase = useMemo(() => createClient(), []);
  const jdFileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const [form, setForm] = useState<JobDescriptionFormData>(DEFAULT_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createFieldErrors, setCreateFieldErrors] = useState<{ start_date?: string; hiring_deadline?: string }>({});
  const [createViewerEmailsText, setCreateViewerEmailsText] = useState("");
  const [createViewerChapterIds, setCreateViewerChapterIds] = useState<string[]>([]);
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]);

  const [jdUploadPhase, setJdUploadPhase] = useState<"idle" | "uploading" | "extracting" | "done" | "error">("idle");
  const [jdUploadError, setJdUploadError] = useState<string | null>(null);
  const [jdDraftJobOpeningId, setJdDraftJobOpeningId] = useState<string | null>(null);
  const [jdSelectedFileName, setJdSelectedFileName] = useState<string | null>(null);
  const [jdDragOver, setJdDragOver] = useState(false);

  const defaultStageIds = useMemo(() => {
    const ids: string[] = [];
    const cvScan = allPipelineStages.find((s) => s.code === "cv_scan");
    if (cvScan) ids.push(cvScan.id);
    const interview = allPipelineStages.find((s) => s.code === "interview");
    if (interview) ids.push(interview.id);
    const offer = allPipelineStages.find((s) => s.code === "offer");
    if (offer) ids.push(offer.id);
    return ids;
  }, [allPipelineStages]);

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
        setSelectedStageIds([]);
        setCreateFieldErrors({});
      } else {
        setSelectedStageIds(defaultStageIds);
      }
    },
  });

  const setField = useCallback(<K extends keyof JobDescriptionFormData>(
    key: K,
    value: JobDescriptionFormData[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "start_date" || key === "hiring_deadline") {
      setCreateFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }, []);

  const ingestJdFile = useCallback(
    async (file: File) => {
      if (!isAllowedJdFilename(file.name)) {
        const msg = "Only PDF, DOCX, or TXT files are supported.";
        setJdUploadError(msg);
        setJdUploadPhase("error");
        toast.error(msg);
        return;
      }
      if (file.size > MAX_JD_BYTES) {
        const msg = "File exceeds 10 MB limit.";
        setJdUploadError(msg);
        setJdUploadPhase("error");
        toast.error(msg);
        return;
      }
      setJdUploadError(null);
      setJdUploadPhase("uploading");
      let newJobId: string | undefined;
      try {
        const h = await getSessionAuthorizationHeaders(supabase);
        if (!h.Authorization) {
          const msg = "Session expired. Sign in again.";
          setJdUploadError(msg);
          setJdUploadPhase("error");
          toast.error(msg);
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
            const msg = exJson.error ?? "Could not read the JD with AI. You can fill the form manually.";
            setJdUploadError(msg);
            toast.error(msg);
          } else {
            const patch = extractedApiToFormPatch(exJson.extracted);
            setForm((prev) => ({ ...prev, ...patch }));
          }
        } catch {
          const msg = "Could not run AI extraction. Fill the form manually.";
          setJdUploadError(msg);
          toast.error(msg);
        }

        setJdUploadPhase("done");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error.";
        setJdUploadError(msg);
        setJdUploadPhase("error");
        toast.error(`Upload failed: ${msg}`);
        if (newJobId) {
          await deleteJdDraftOnServer(newJobId);
          setJdDraftJobOpeningId(null);
        }
      }
    },
    [deleteJdDraftOnServer, jdDraftJobOpeningId, supabase, toast],
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
      if (!jdDraftJobOpeningId) {
        const msg = "Attaching a JD document is required.";
        setFormError(msg);
        toast.error(msg);
        setFormSubmitting(false);
        return;
      }
      if (!asDraft) {
        const fieldErrs: { start_date?: string; hiring_deadline?: string } = {};
        if (!form.start_date) fieldErrs.start_date = "Start date is required.";
        if (!form.hiring_deadline) fieldErrs.hiring_deadline = "Hiring deadline is required.";
        if (Object.keys(fieldErrs).length > 0) {
          setCreateFieldErrors(fieldErrs);
          setFormSubmitting(false);
          return;
        }
      }
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
        pipelineStages: selectedStageIds,
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
        toast.success(asDraft ? "Draft saved successfully." : "Job description created successfully.");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error.";
        setFormError(msg);
        toast.error(msg);
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
      selectedStageIds,
    ],
  );

  return {
    form,
    setField,
    formSubmitting,
    formError,
    createFieldErrors,
    createViewerEmailsText,
    setCreateViewerEmailsText,
    createViewerChapterIds,
    setCreateViewerChapterIds,
    selectedStageIds,
    setSelectedStageIds,
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
