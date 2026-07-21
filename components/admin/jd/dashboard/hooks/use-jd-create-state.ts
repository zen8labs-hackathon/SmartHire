import { useState, useRef, useCallback, useMemo } from "react";
import { useOverlayState } from "@heroui/react";
import { extractedApiToFormPatch } from "@/lib/jd/extracted-to-form";
import type { JobDescriptionFormData } from "@/lib/jd/types";
import { MAX_JD_BYTES, isAllowedJdFilename } from "@/lib/jd/upload-constants";
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

const JSON_HEADERS = { "Content-Type": "application/json" };

export function useJdCreateState(
  loadDescriptions: () => Promise<void>,
  allPipelineStages: readonly { id: string; label: string; code: string; color: string }[]
) {
  const jdFileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const [form, setForm] = useState<JobDescriptionFormData>(DEFAULT_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createFieldErrors, setCreateFieldErrors] = useState<{ start_date?: string; hiring_deadline?: string }>({});
  const [createViewerEmails, setCreateViewerEmails] = useState<string[]>([]);
  const [createViewerChapterIds, setCreateViewerChapterIds] = useState<string[]>([]);
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]);

  const [jdUploadPhase, setJdUploadPhase] = useState<"idle" | "uploading" | "extracting" | "done" | "error">("idle");
  const [jdUploadError, setJdUploadError] = useState<string | null>(null);
  const [jdDraftStoragePath, setJdDraftStoragePath] = useState<string | null>(null);
  const [jdDraftMimeType, setJdDraftMimeType] = useState<string | null>(null);
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

  const deleteJdDraftOnServer = useCallback(async (storagePath: string) => {
    await fetch(
      `/api/admin/job-openings/sign-upload?path=${encodeURIComponent(storagePath)}`,
      { method: "DELETE", credentials: "include" },
    );
  }, []);

  const resetUploadState = useCallback(() => {
    setJdUploadPhase("idle");
    setJdUploadError(null);
    setJdDraftStoragePath(null);
    setJdDraftMimeType(null);
    setJdSelectedFileName(null);
    setJdDragOver(false);
    if (jdFileInputRef.current) jdFileInputRef.current.value = "";
  }, []);

  const skipDraftCleanupRef = useRef(false);

  const jdModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        if (skipDraftCleanupRef.current) {
          skipDraftCleanupRef.current = false;
        } else if (jdDraftStoragePath) {
          void deleteJdDraftOnServer(jdDraftStoragePath);
        }
        resetUploadState();
        setFormError(null);
        setForm(DEFAULT_FORM);
        setCreateViewerEmails([]);
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
      let newStoragePath: string | undefined;
      try {
        const signRes = await fetch("/api/admin/job-openings/sign-upload", {
          method: "POST",
          credentials: "include",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type || null,
            replacePath: jdDraftStoragePath,
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
        newStoragePath = signJson.path;

        const putRes = await fetch(signJson.signedUrl, {
          method: "PUT",
          body: file,
          headers: file.type ? { "Content-Type": file.type } : undefined,
        });
        if (!putRes.ok) {
          throw new Error("Could not upload file to storage.");
        }

        setJdDraftStoragePath(signJson.path);
        setJdDraftMimeType(file.type || null);
        setJdSelectedFileName(file.name);
        setJdUploadPhase("extracting");
        setJdUploadError(null);

        try {
          const exRes = await fetch("/api/admin/job-descriptions/extract", {
            method: "POST",
            credentials: "include",
            headers: JSON_HEADERS,
            body: JSON.stringify({ storagePath: signJson.path }),
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
        if (newStoragePath) {
          await deleteJdDraftOnServer(newStoragePath);
          setJdDraftStoragePath(null);
        }
      }
    },
    [deleteJdDraftOnServer, jdDraftStoragePath, toast],
  );

  const discardJdDraft = useCallback(async () => {
    jdModal.close();
  }, [jdModal]);

  const handleSave = useCallback(
    async () => {
      setFormSubmitting(true);
      setFormError(null);
      if (!jdDraftStoragePath) {
        const msg = "Attaching a JD document is required.";
        setFormError(msg);
        toast.error(msg);
        setFormSubmitting(false);
        return;
      }
      const fieldErrs: { start_date?: string; hiring_deadline?: string } = {};
      if (!form.start_date) fieldErrs.start_date = "Start date is required.";
      if (!form.hiring_deadline) fieldErrs.hiring_deadline = "Hiring deadline is required.";
      if (
        form.start_date &&
        form.hiring_deadline &&
        form.hiring_deadline < form.start_date
      ) {
        fieldErrs.hiring_deadline =
          "Hiring deadline must be on or after the start date.";
      }
      if (Object.keys(fieldErrs).length > 0) {
        setCreateFieldErrors(fieldErrs);
        setFormSubmitting(false);
        return;
      }
      const positionFromFile =
        jdSelectedFileName?.replace(/\.[^./\\]+$/i, "").trim().slice(0, 50) ||
        "";
      const resolvedPosition =
        form.position.trim() || positionFromFile || "Untitled JD";
      const payload: JobDescriptionFormData = {
        ...form,
        position: resolvedPosition,
        status: form.status === "Pending" ? "Hiring" : form.status,
      };
      const postBody = {
        ...payload,
        jdStoragePath: jdDraftStoragePath,
        jdOriginalFilename: jdSelectedFileName,
        jdMimeType: jdDraftMimeType,
        viewerEmails: createViewerEmails,
        viewerChapterIds: createViewerChapterIds,
        pipelineStages: selectedStageIds,
      };
      try {
        const res = await fetch("/api/admin/job-descriptions", {
          method: "POST",
          credentials: "include",
          headers: JSON_HEADERS,
          body: JSON.stringify(postBody),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Save failed.");
        skipDraftCleanupRef.current = true;
        jdModal.close();
        await loadDescriptions();
        toast.success("Job description created successfully.");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error.";
        setFormError(msg);
        toast.error(msg);
      } finally {
        setFormSubmitting(false);
      }
    },
    [
      createViewerChapterIds,
      createViewerEmails,
      form,
      jdDraftMimeType,
      jdDraftStoragePath,
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
    createViewerEmails,
    setCreateViewerEmails,
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
