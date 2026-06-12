import { useState, useRef, useCallback, useMemo } from "react";
import { useOverlayState } from "@heroui/react";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";
import { extractedApiToFormPatch, extractedPatchToEditFormPatch } from "@/lib/jd/extracted-to-form";
import type { JobDescription, JdEditFormData } from "@/lib/jd/types";
import { normalizeFormText } from "@/lib/jd/normalize-text";
import { normalizeHireTypeForForm } from "../helpers";
import { JD_BUCKET, MAX_JD_BYTES, isAllowedJdFilename } from "@/lib/jd/upload-constants";

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

export function useJdEditState(loadDescriptions: () => Promise<void>) {
  const supabase = useMemo(() => createClient(), []);
  const editJdFileInputRef = useRef<HTMLInputElement>(null);
  const editDraftJobOpeningIdRef = useRef<string | null>(null);

  const [editIntakeRow, setEditIntakeRow] = useState<JobDescription | null>(null);
  const [editForm, setEditForm] = useState<JdEditFormData>(DEFAULT_EDIT_FORM);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editUploadPhase, setEditUploadPhase] = useState<"idle" | "uploading" | "extracting" | "done" | "error">("idle");
  const [editUploadError, setEditUploadError] = useState<string | null>(null);
  const [editDraftJobOpeningId, setEditDraftJobOpeningId] = useState<string | null>(null);
  const [editSelectedFileName, setEditSelectedFileName] = useState<string | null>(null);
  const [editDragOver, setEditDragOver] = useState(false);

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

  const resetEditUploadState = useCallback(() => {
    setEditUploadPhase("idle");
    setEditUploadError(null);
    setEditDraftJobOpeningId(null);
    editDraftJobOpeningIdRef.current = null;
    setEditSelectedFileName(null);
    setEditDragOver(false);
    if (editJdFileInputRef.current) editJdFileInputRef.current.value = "";
  }, []);

  const editIntakeModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        const draftId = editDraftJobOpeningIdRef.current;
        if (draftId) void deleteJdDraftOnServer(draftId);
        resetEditUploadState();
        setEditIntakeRow(null);
        setEditForm(DEFAULT_EDIT_FORM);
        setEditError(null);
      }
    },
  });

  const setEditField = useCallback(<K extends keyof JdEditFormData>(
    key: K,
    value: JdEditFormData[K],
  ) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  function openEdit(row: JobDescription) {
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
    editIntakeModal.open();
  }

  const ingestJdFileForEdit = useCallback(
    async (file: File) => {
      if (!isAllowedJdFilename(file.name)) {
        setEditUploadError("Only PDF, DOCX, or TXT files are supported.");
        setEditUploadPhase("error");
        return;
      }
      if (file.size > MAX_JD_BYTES) {
        setEditUploadError("File exceeds 10 MB limit.");
        setEditUploadPhase("error");
        return;
      }
      setEditUploadError(null);
      setEditUploadPhase("uploading");
      let newJobId: string | undefined;
      try {
        const h = await getSessionAuthorizationHeaders(supabase);
        if (!h.Authorization) {
          setEditUploadError("Session expired. Sign in again.");
          setEditUploadPhase("error");
          return;
        }
        const signRes = await fetch("/api/admin/job-openings/sign-upload", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...h },
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type || null,
            replaceJobOpeningId: editDraftJobOpeningId,
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

        setEditDraftJobOpeningId(signJson.jobOpeningId);
        editDraftJobOpeningIdRef.current = signJson.jobOpeningId;
        setEditSelectedFileName(file.name);
        setEditUploadPhase("extracting");
        setEditUploadError(null);

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
            setEditUploadError(
              exJson.error ??
                "Could not read the JD with AI. You can fill the form manually.",
            );
          } else {
            const patch = extractedApiToFormPatch(exJson.extracted);
            const editPatch = extractedPatchToEditFormPatch(patch);
            setEditForm((prev) => ({ ...prev, ...editPatch }));
          }
        } catch {
          setEditUploadError(
            "Could not run AI extraction. Fill the form manually.",
          );
        }

        setEditUploadPhase("done");
      } catch (e) {
        setEditUploadError(e instanceof Error ? e.message : "Unknown error.");
        setEditUploadPhase("error");
        if (newJobId) {
          await deleteJdDraftOnServer(newJobId);
          setEditDraftJobOpeningId(null);
          editDraftJobOpeningIdRef.current = null;
        }
      }
    },
    [deleteJdDraftOnServer, editDraftJobOpeningId, supabase],
  );

  const handleEditSave = useCallback(async () => {
    if (!editIntakeRow) return;
    if (!editForm.position.trim()) {
      setEditError("Job title is required.");
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/job-descriptions/${editIntakeRow.id}`, {
        method: "PUT",
        credentials: "include",
        headers,
        body: JSON.stringify({ ...editForm, _editMode: true }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      editIntakeModal.close();
      await loadDescriptions();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Unknown error.");
    } finally {
      setEditSubmitting(false);
    }
  }, [authHeaders, editForm, editIntakeModal, editIntakeRow, loadDescriptions]);

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
  };
}
