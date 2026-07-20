import { useState, useRef, useCallback } from "react";
import { useOverlayState } from "@heroui/react";
import { extractedApiToFormPatch, extractedPatchToEditFormPatch } from "@/lib/jd/extracted-to-form";
import type { JobDescription, JdEditFormData } from "@/lib/jd/types";
import { normalizeFormText } from "@/lib/jd/normalize-text";
import { normalizeHireTypeForForm } from "../helpers";
import { MAX_JD_BYTES, isAllowedJdFilename } from "@/lib/jd/upload-constants";
import { useToast } from "@/components/admin/toast-provider";

const DEFAULT_EDIT_FORM: JdEditFormData = {
  position: "",
  level: "",
  headcount: "",
  hire_type: "",
  reporting: "",
  project_info: "",
  duties_and_responsibilities: "",
  team_size: "",
  experience_requirements_must_have: "",
  experience_requirements_nice_to_have: "",
  language_requirements: "",
  career_development: "",
  other_requirements: "",
  salary_range: "",
  project_allowances: "",
  interview_process: "",
  hiring_deadline: "",
};

const JSON_HEADERS = { "Content-Type": "application/json" };

export function useJdEditState(loadDescriptions: () => Promise<void>) {
  const editJdFileInputRef = useRef<HTMLInputElement>(null);
  const editDraftStoragePathRef = useRef<string | null>(null);
  const toast = useToast();

  const [editIntakeRow, setEditIntakeRow] = useState<JobDescription | null>(null);
  const [editForm, setEditForm] = useState<JdEditFormData>(DEFAULT_EDIT_FORM);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editUploadPhase, setEditUploadPhase] = useState<"idle" | "uploading" | "extracting" | "done" | "error">("idle");
  const [editUploadError, setEditUploadError] = useState<string | null>(null);
  const [editDraftStoragePath, setEditDraftStoragePath] = useState<string | null>(null);
  const [editSelectedFileName, setEditSelectedFileName] = useState<string | null>(null);
  const [editDragOver, setEditDragOver] = useState(false);
  const [editSelectedStageIds, setEditSelectedStageIds] = useState<string[]>([]);
  const [editStagesLoading, setEditStagesLoading] = useState(false);

  const deleteJdDraftOnServer = useCallback(async (storagePath: string) => {
    await fetch(
      `/api/admin/job-openings/sign-upload?path=${encodeURIComponent(storagePath)}`,
      { method: "DELETE", credentials: "include" },
    );
  }, []);

  const resetEditUploadState = useCallback(() => {
    setEditUploadPhase("idle");
    setEditUploadError(null);
    setEditDraftStoragePath(null);
    editDraftStoragePathRef.current = null;
    setEditSelectedFileName(null);
    setEditDragOver(false);
    if (editJdFileInputRef.current) editJdFileInputRef.current.value = "";
  }, []);

  const editIntakeModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        const draftPath = editDraftStoragePathRef.current;
        if (draftPath) void deleteJdDraftOnServer(draftPath);
        resetEditUploadState();
        setEditIntakeRow(null);
        setEditForm(DEFAULT_EDIT_FORM);
        setEditError(null);
        setEditSelectedStageIds([]);
      }
    },
  });

  const setEditField = useCallback(<K extends keyof JdEditFormData>(
    key: K,
    value: JdEditFormData[K],
  ) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const openEdit = useCallback(async (row: JobDescription) => {
    resetEditUploadState();
    setEditIntakeRow(row);
    setEditForm({
      position: normalizeFormText(row.position).slice(0, 50),
      level: normalizeFormText(row.level),
      headcount: row.headcount != null ? String(row.headcount) : "",
      hire_type: normalizeHireTypeForForm(normalizeFormText(row.hire_type)),
      reporting: normalizeFormText(row.reporting),
      project_info: normalizeFormText(row.project_info),
      duties_and_responsibilities: normalizeFormText(row.duties_and_responsibilities),
      team_size: normalizeFormText(row.team_size),
      experience_requirements_must_have: normalizeFormText(row.experience_requirements_must_have),
      experience_requirements_nice_to_have: normalizeFormText(row.experience_requirements_nice_to_have),
      language_requirements: normalizeFormText(row.language_requirements),
      career_development: normalizeFormText(row.career_development),
      other_requirements: normalizeFormText(row.other_requirements),
      salary_range: normalizeFormText(row.salary_range),
      project_allowances: normalizeFormText(row.project_allowances),
      interview_process: normalizeFormText(row.interview_process),
      hiring_deadline: row.hiring_deadline ? row.hiring_deadline.slice(0, 10) : "",
    });
    setEditSelectedStageIds([]);
    setEditStagesLoading(true);
    editIntakeModal.open();
    try {
      const res = await fetch(`/api/admin/job-descriptions/${row.id}`, {
        credentials: "include",
      });
      if (res.ok) {
        const json = (await res.json()) as { pipelineStages?: string[] };
        if (json.pipelineStages) {
          setEditSelectedStageIds(json.pipelineStages);
        }
      } else {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Failed to load pipeline stages.");
      }
    } catch (e) {
      console.error("Failed to load pipeline stages for editing:", e);
      toast.error(e instanceof Error ? e.message : "Failed to load pipeline stages for editing.");
    } finally {
      setEditStagesLoading(false);
    }
  }, [editIntakeModal, resetEditUploadState]);

  const ingestJdFileForEdit = useCallback(
    async (file: File) => {
      if (!isAllowedJdFilename(file.name)) {
        const msg = "Only PDF, DOCX, or TXT files are supported.";
        setEditUploadError(msg);
        setEditUploadPhase("error");
        toast.error(msg);
        return;
      }
      if (file.size > MAX_JD_BYTES) {
        const msg = "File exceeds 10 MB limit.";
        setEditUploadError(msg);
        setEditUploadPhase("error");
        toast.error(msg);
        return;
      }
      setEditUploadError(null);
      setEditUploadPhase("uploading");
      let newStoragePath: string | undefined;
      try {
        const signRes = await fetch("/api/admin/job-openings/sign-upload", {
          method: "POST",
          credentials: "include",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type || null,
            replacePath: editDraftStoragePath,
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

        setEditDraftStoragePath(signJson.path);
        editDraftStoragePathRef.current = signJson.path;
        setEditSelectedFileName(file.name);
        setEditUploadPhase("extracting");
        setEditUploadError(null);

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
            setEditUploadError(msg);
            toast.error(msg);
          } else {
            const patch = extractedApiToFormPatch(exJson.extracted);
            const editPatch = extractedPatchToEditFormPatch(patch);
            setEditForm((prev) => ({ ...prev, ...editPatch }));
          }
        } catch {
          const msg = "Could not run AI extraction. Fill the form manually.";
          setEditUploadError(msg);
          toast.error(msg);
        }

        setEditUploadPhase("done");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error.";
        setEditUploadError(msg);
        setEditUploadPhase("error");
        toast.error(`Upload failed: ${msg}`);
        if (newStoragePath) {
          await deleteJdDraftOnServer(newStoragePath);
          setEditDraftStoragePath(null);
          editDraftStoragePathRef.current = null;
        }
      }
    },
    [deleteJdDraftOnServer, editDraftStoragePath, toast],
  );

  const handleEditSave = useCallback(async () => {
    if (!editIntakeRow) return;
    if (!editForm.position.trim()) {
      const msg = "Job title is required.";
      setEditError(msg);
      toast.error(msg);
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/admin/job-descriptions/${editIntakeRow.id}`, {
        method: "PUT",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          ...editForm,
          _editMode: true,
          pipelineStages: editSelectedStageIds,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      editIntakeModal.close();
      await loadDescriptions();
      toast.success("Job description updated successfully.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error.";
      setEditError(msg);
      toast.error(msg);
    } finally {
      setEditSubmitting(false);
    }
  }, [editForm, editIntakeModal, editIntakeRow, loadDescriptions, editSelectedStageIds, toast]);

  return {
    editIntakeRow,
    editForm,
    setEditField,
    editSubmitting,
    editError,
    editUploadPhase,
    editUploadError,
    editSelectedFileName,
    editDragOver,
    setEditDragOver,
    editJdFileInputRef,
    editIntakeModal,
    openEdit,
    ingestJdFileForEdit,
    handleEditSave,
    editSelectedStageIds,
    setEditSelectedStageIds,
    editStagesLoading,
  };
}
