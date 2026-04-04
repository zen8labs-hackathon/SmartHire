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
import Link from "next/link";

import {
  Button,
  Card,
  Chip,
  Drawer,
  Input,
  Label,
  ListBox,
  Modal,
  Pagination,
  SearchField,
  Select,
  Separator,
  Table,
  TextArea,
  TextField,
  useOverlayState,
} from "@heroui/react";

import { extractedApiToFormPatch } from "@/lib/jd/extracted-to-form";
import {
  coerceJdStatus,
  JD_STATUS_OPTIONS,
  type JobDescription,
  type JobDescriptionFormData,
  type JdEditFormData,
  type JdStatus,
} from "@/lib/jd/types";
import { normalizeFormText, utcDateStringToday } from "@/lib/jd/normalize-text";
import {
  JD_BUCKET,
  MAX_JD_BYTES,
  isAllowedJdFilename,
} from "@/lib/jd/upload-constants";
import { ALL_PIPELINE_STATUSES } from "@/lib/candidates/pipeline-allowed-transitions";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROWS_PER_PAGE = 10;

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

const HIRE_TYPE_OPTIONS = ["Tuyển mới", "Tuyển thay thế"] as const;

const DEFAULT_EDIT_FORM: JdEditFormData = {
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type JdUploadPhase = "idle" | "uploading" | "extracting" | "done" | "error";

function statusChipColor(
  status: JdStatus,
): "success" | "warning" | "default" | "accent" | "danger" {
  switch (status) {
    case "Hiring":
      return "success";
    case "Pending":
      return "warning";
    case "Done":
      return "accent";
    case "Closed":
      return "danger";
    default:
      return "default";
  }
}

/** Border + background tint for JD status dropdown triggers. */
function jdStatusSelectTriggerClass(status: JdStatus): string {
  switch (status) {
    case "Hiring":
      return "border-success/45 bg-success/10 text-success";
    case "Pending":
      return "border-warning/45 bg-warning/10 text-warning";
    case "Done":
      return "border-accent/45 bg-accent/10 text-accent";
    case "Closed":
      return "border-danger/40 bg-danger/10 text-danger";
    default:
      return "border-divider";
  }
}

function jdStatusListItemClass(status: JdStatus): string {
  switch (status) {
    case "Hiring":
      return "text-success";
    case "Pending":
      return "text-warning";
    case "Done":
      return "text-accent";
    case "Closed":
      return "text-danger";
    default:
      return "";
  }
}

function jdRowDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function formatJdCalendarDate(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  const ymd = value.slice(0, 10);
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "—";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mo - 1, d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Section label helper
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function JdManagementDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const jdFileInputRef = useRef<HTMLInputElement>(null);

  // ── data ────────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<JobDescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);

  // ── pagination / filter ─────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [jdListSearch, setJdListSearch] = useState("");
  const [jdListStatusKey, setJdListStatusKey] = useState<string>("all");
  const [jdStartDateFrom, setJdStartDateFrom] = useState("");
  const [jdStartDateTo, setJdStartDateTo] = useState("");

  // ── drawer ──────────────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<JobDescription | null>(null);
  const [drawerStatusCounts, setDrawerStatusCounts] = useState<Record<
    string,
    number
  > | null>(null);
  const [drawerStatusCountsError, setDrawerStatusCountsError] = useState<
    string | null
  >(null);

  // ── create modal / form ──────────────────────────────────────────────────
  const [form, setForm] = useState<JobDescriptionFormData>(DEFAULT_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── edit intake modal ────────────────────────────────────────────────────
  const [editIntakeRow, setEditIntakeRow] = useState<JobDescription | null>(null);
  const [editForm, setEditForm] = useState<JdEditFormData>(DEFAULT_EDIT_FORM);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // ── file upload ──────────────────────────────────────────────────────────
  const [jdUploadPhase, setJdUploadPhase] = useState<JdUploadPhase>("idle");
  const [jdUploadError, setJdUploadError] = useState<string | null>(null);
  const [jdDraftJobOpeningId, setJdDraftJobOpeningId] = useState<string | null>(null);
  const [jdSelectedFileName, setJdSelectedFileName] = useState<string | null>(null);
  const [jdDragOver, setJdDragOver] = useState(false);
  // ── delete confirm ───────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);

  // ── overlay state ────────────────────────────────────────────────────────
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
      }
    },
  });

  const deleteModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        setDeletingId(null);
        setDeleteError(null);
      }
    },
  });

  const editIntakeModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        setEditIntakeRow(null);
        setEditForm(DEFAULT_EDIT_FORM);
        setEditError(null);
      }
    },
  });

  // ── API helpers ──────────────────────────────────────────────────────────

  const authHeaders = useCallback(async () => {
    const h = await getSessionAuthorizationHeaders(supabase);
    return { "Content-Type": "application/json", ...h };
  }, [supabase]);

  useEffect(() => {
    if (!drawerOpen || !activeRow) {
      setDrawerStatusCounts(null);
      setDrawerStatusCountsError(null);
      return;
    }
    let cancelled = false;
    setDrawerStatusCounts(null);
    setDrawerStatusCountsError(null);
    void (async () => {
      try {
        const h = await getSessionAuthorizationHeaders(supabase);
        const res = await fetch(
          `/api/admin/job-descriptions/${activeRow.id}/candidate-status-counts`,
          { credentials: "include", headers: { ...h } },
        );
        const json = (await res.json()) as {
          counts?: Record<string, number>;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setDrawerStatusCountsError(
            json.error ?? "Could not load applicant counts.",
          );
          return;
        }
        setDrawerStatusCounts(json.counts ?? null);
      } catch {
        if (!cancelled) {
          setDrawerStatusCountsError("Could not load applicant counts.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, activeRow?.id, supabase]);

  const loadDescriptions = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    setStatusUpdateError(null);
    try {
      const h = await getSessionAuthorizationHeaders(supabase);
      const res = await fetch("/api/admin/job-descriptions", {
        credentials: "include",
        headers: { ...h },
      });
      const json = (await res.json()) as {
        jobDescriptions?: JobDescription[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load.");
      setRows(
        (json.jobDescriptions ?? []).map((r) => {
          const row = r as JobDescription;
          return {
            ...row,
            status: coerceJdStatus(String(row.status)),
            start_date: jdRowDate(row.start_date),
            end_date: jdRowDate(row.end_date),
          };
        }),
      );
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadDescriptions();
  }, [loadDescriptions]);

  const updateJdStatus = useCallback(
    async (id: number, next: JdStatus) => {
      let prevStatus: JdStatus | null = null;
      let prevEndDate: string | null = null;
      setRows((rs) => {
        const row = rs.find((r) => r.id === id);
        if (!row || row.status === next) return rs;
        prevStatus = row.status;
        prevEndDate = row.end_date;
        const prevTerminal =
          row.status === "Done" || row.status === "Closed";
        const nextTerminal = next === "Done" || next === "Closed";
        let endDate = row.end_date;
        if (nextTerminal && !prevTerminal) {
          endDate = utcDateStringToday();
        } else if (!nextTerminal && prevTerminal) {
          endDate = null;
        }
        return rs.map((r) =>
          r.id === id ? { ...r, status: next, end_date: endDate } : r,
        );
      });
      if (prevStatus === null) return;

      setStatusUpdatingId(id);
      setStatusUpdateError(null);
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/admin/job-descriptions/${id}`, {
          method: "PUT",
          credentials: "include",
          headers,
          body: JSON.stringify({ status: next }),
        });
        const json = (await res.json()) as {
          error?: string;
          jobDescription?: JobDescription;
        };
        if (!res.ok) throw new Error(json.error ?? "Update failed.");
        if (json.jobDescription) {
          const jd = json.jobDescription;
          const normalized: JobDescription = {
            ...jd,
            status: coerceJdStatus(String(jd.status)),
            start_date: jdRowDate(jd.start_date),
            end_date: jdRowDate(jd.end_date),
          };
          setRows((rs) => rs.map((r) => (r.id === id ? normalized : r)));
          setActiveRow((ar) =>
            ar?.id === id ? { ...ar, ...normalized } : ar,
          );
        }
      } catch (e) {
        setRows((rs) =>
          rs.map((r) =>
            r.id === id
              ? { ...r, status: prevStatus!, end_date: prevEndDate }
              : r,
          ),
        );
        setStatusUpdateError(
          e instanceof Error ? e.message : "Status update failed.",
        );
      } finally {
        setStatusUpdatingId(null);
      }
    },
    [authHeaders],
  );

  // ── file upload ──────────────────────────────────────────────────────────

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

  // ── form submit ──────────────────────────────────────────────────────────

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
      const postBody = jdDraftJobOpeningId
        ? { ...payload, jdDraftJobOpeningId }
        : payload;
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
      form,
      jdDraftJobOpeningId,
      jdModal,
      jdSelectedFileName,
      loadDescriptions,
    ],
  );

  // ── delete ───────────────────────────────────────────────────────────────

  const confirmDelete = useCallback(async () => {
    if (!deletingId) return;
    setDeleteError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/job-descriptions/${deletingId}`, {
        method: "DELETE",
        credentials: "include",
        headers,
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Delete failed.");
      }
      if (activeRow?.id === deletingId) {
        setActiveRow(null);
        setDrawerOpen(false);
      }
      deleteModal.close();
      await loadDescriptions();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Unknown error.");
    }
  }, [activeRow, authHeaders, deleteModal, deletingId, loadDescriptions]);

  // ── open edit intake modal ───────────────────────────────────────────────

  function openEdit(row: JobDescription) {
    setEditIntakeRow(row);
    setEditForm({
      level: normalizeFormText(row.level),
      headcount: row.headcount != null ? String(row.headcount) : "",
      hire_type: normalizeFormText(row.hire_type),
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

  const handleEditSave = useCallback(async () => {
    if (!editIntakeRow) return;
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

  function setEditField<K extends keyof JdEditFormData>(
    key: K,
    value: JdEditFormData[K],
  ) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }

  // ── table data ───────────────────────────────────────────────────────────

  const filteredRows = useMemo(() => {
    const q = jdListSearch.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.position.toLowerCase().includes(q)) return false;
      if (jdListStatusKey !== "all" && r.status !== jdListStatusKey) {
        return false;
      }
      if (jdStartDateFrom || jdStartDateTo) {
        const d = r.start_date;
        if (!d) return false;
        if (jdStartDateFrom && d < jdStartDateFrom) return false;
        if (jdStartDateTo && d > jdStartDateTo) return false;
      }
      return true;
    });
  }, [
    rows,
    jdListSearch,
    jdListStatusKey,
    jdStartDateFrom,
    jdStartDateTo,
  ]);

  useEffect(() => {
    setPage(1);
  }, [jdListSearch, jdListStatusKey, jdStartDateFrom, jdStartDateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * ROWS_PER_PAGE;
    return filteredRows.slice(start, start + ROWS_PER_PAGE);
  }, [filteredRows, safePage]);

  const startIdx = filteredRows.length === 0 ? 0 : (safePage - 1) * ROWS_PER_PAGE + 1;
  const endIdx = Math.min(safePage * ROWS_PER_PAGE, filteredRows.length);

  // ── form helpers ──────────────────────────────────────────────────────────

  function setField<K extends keyof JobDescriptionFormData>(
    key: K,
    value: JobDescriptionFormData[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-8">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Job descriptions
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Manage and monitor recruitment job descriptions across the organisation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            onPress={() => {
              setForm(DEFAULT_FORM);
              jdModal.open();
            }}
          >
            New definition
          </Button>
          <input
            ref={jdFileInputRef}
            type="file"
            className="sr-only"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            aria-hidden
            tabIndex={-1}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const f = e.target.files?.[0];
              if (f) void ingestJdFile(f);
            }}
          />
        </div>
      </div>

      {/* ── Create Modal ── */}
      <Modal.Backdrop
        className="bg-black/40 backdrop-blur-sm"
        isOpen={jdModal.isOpen}
        onOpenChange={jdModal.setOpen}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-[820px] overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="items-start border-b border-divider px-6 py-5">
              <Modal.Heading className="text-xl">Create New Definition</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="max-h-[72vh] space-y-6 overflow-y-auto px-6 py-6">
              {/* File upload (optional) */}
              <Card
                variant="secondary"
                className={
                  jdDragOver
                    ? "ring-2 ring-accent ring-offset-2 ring-offset-background"
                    : undefined
                }
              >
                <Card.Content
                  className="items-center gap-3 py-6 text-center"
                  onDragOver={(e: DragEvent) => {
                    if (
                      jdUploadPhase === "uploading" ||
                      jdUploadPhase === "extracting"
                    )
                      return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    setJdDragOver(true);
                  }}
                  onDragLeave={() => setJdDragOver(false)}
                  onDrop={(e: DragEvent) => {
                    if (
                      jdUploadPhase === "uploading" ||
                      jdUploadPhase === "extracting"
                    )
                      return;
                    e.preventDefault();
                    setJdDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) void ingestJdFile(f);
                  }}
                >
                  <div className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
                    {jdUploadPhase === "done" ? (
                      <CheckCircleIcon className="size-6 text-success" />
                    ) : (
                      <span className="text-lg">+</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    Attach JD Document{" "}
                    <span className="font-normal text-muted">(optional)</span>
                  </p>
                  <p className="text-xs text-muted">
                    PDF, DOCX or TXT — max 10 MB. After upload, AI fills the
                    form for you to review.
                  </p>
                  {jdUploadPhase === "uploading" && (
                    <p className="text-xs text-accent">Uploading…</p>
                  )}
                  {jdUploadPhase === "extracting" && (
                    <p className="text-xs text-accent">
                      Reading document with AI…
                    </p>
                  )}
                  {jdUploadPhase === "done" && jdSelectedFileName && (
                    <p className="text-xs font-medium text-success">
                      ✓ {jdSelectedFileName}
                    </p>
                  )}
                  {(jdUploadPhase === "done" || jdUploadPhase === "error") &&
                    jdUploadError && (
                      <p className="text-xs text-danger">{jdUploadError}</p>
                    )}
                  <Button
                    variant="secondary"
                    size="sm"
                    isDisabled={
                      jdUploadPhase === "uploading" ||
                      jdUploadPhase === "extracting"
                    }
                    onPress={() => jdFileInputRef.current?.click()}
                  >
                    Browse Files
                  </Button>
                </Card.Content>
              </Card>

              <div className="space-y-4">
                <SectionLabel>Thông tin vị trí</SectionLabel>
                <div className="grid gap-4 md:grid-cols-2">
                  <TextField
                    value={form.position}
                    onChange={(v) => setField("position", v)}
                    isRequired
                  >
                    <Label>Tên vị trí *</Label>
                    <Input placeholder="VD: AI Engineer (Mid-level)" />
                  </TextField>

                  <TextField
                    value={form.department}
                    onChange={(v) => setField("department", v)}
                  >
                    <Label>Phòng / Team</Label>
                    <Input placeholder="VD: Solutions Team" />
                  </TextField>
                </div>
              </div>

              {formError && (
                <p className="text-sm text-danger">{formError}</p>
              )}
            </Modal.Body>

            <Modal.Footer className="justify-between border-t border-divider px-6 py-5">
              <Button
                variant="ghost"
                onPress={() => void discardJdDraft()}
                isDisabled={
                  formSubmitting ||
                  jdUploadPhase === "uploading" ||
                  jdUploadPhase === "extracting"
                }
              >
                Discard draft
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  isDisabled={
                    formSubmitting ||
                    jdUploadPhase === "uploading" ||
                    jdUploadPhase === "extracting"
                  }
                  onPress={() => void handleSave(true)}
                >
                  Save draft
                </Button>
                <Button
                  variant="primary"
                  isDisabled={
                    formSubmitting ||
                    jdUploadPhase === "uploading" ||
                    jdUploadPhase === "extracting"
                  }
                  onPress={() => void handleSave(false)}
                >
                  {formSubmitting ? "Saving…" : "Create"}
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* ── Delete confirm modal ── */}
      <Modal.Backdrop
        className="bg-black/40 backdrop-blur-sm"
        isOpen={deleteModal.isOpen}
        onOpenChange={deleteModal.setOpen}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-sm overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider px-6 py-5">
              <Modal.Heading>Delete job description</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="px-6 py-5">
              <p className="text-sm text-muted">
                This action cannot be undone. The job description will be
                permanently removed.
              </p>
              {deleteError && (
                <p className="mt-3 text-sm text-danger">{deleteError}</p>
              )}
            </Modal.Body>
            <Modal.Footer className="justify-end gap-2 border-t border-divider px-6 py-4">
              <Button variant="secondary" onPress={deleteModal.close}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className="bg-danger text-white hover:bg-danger/90"
                onPress={() => void confirmDelete()}
              >
                Delete
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* ── Edit Intake Modal ── */}
      <Modal.Backdrop
        className="bg-black/40 backdrop-blur-sm"
        isOpen={editIntakeModal.isOpen}
        onOpenChange={editIntakeModal.setOpen}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-[860px] overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="items-start border-b border-divider px-6 py-5">
              <Modal.Heading className="text-xl">
                Thông tin tuyển dụng
                {editIntakeRow ? (
                  <span className="ml-2 text-base font-normal text-muted">
                    — {editIntakeRow.position}
                  </span>
                ) : null}
              </Modal.Heading>
            </Modal.Header>

            <Modal.Body className="max-h-[76vh] space-y-6 overflow-y-auto px-6 py-6">

              {/* 1 – Vị trí & Tổ chức */}
              <div className="space-y-4">
                <SectionLabel>Vị trí &amp; Tổ chức</SectionLabel>
                <div className="grid gap-4 md:grid-cols-3">
                  <TextField
                    value={editForm.level}
                    onChange={(v) => setEditField("level", v)}
                  >
                    <Label>Level</Label>
                    <Input placeholder="VD: Junior, Mid, Senior, Lead" />
                  </TextField>

                  <TextField
                    value={editForm.headcount}
                    onChange={(v) => setEditField("headcount", v)}
                  >
                    <Label>Số lượng cần tuyển</Label>
                    <Input type="number" min="1" placeholder="VD: 2" />
                  </TextField>

                  <Select
                    value={editForm.hire_type || undefined}
                    onChange={(key) => {
                      if (typeof key === "string") setEditField("hire_type", key);
                    }}
                  >
                    <Label>Tuyển mới hay thay thế</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {HIRE_TYPE_OPTIONS.map((opt) => (
                          <ListBox.Item key={opt} id={opt} textValue={opt}>
                            {opt}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>

                <TextField
                  value={editForm.reporting}
                  onChange={(v) => setEditField("reporting", v)}
                >
                  <Label>Báo cáo cho ai</Label>
                  <Input placeholder="VD: VP of Engineering, CTO, Project Manager..." />
                </TextField>
              </div>

              {/* 2 – Dự án & Team */}
              <div className="space-y-4">
                <SectionLabel>Dự án &amp; Team</SectionLabel>

                <TextField
                  value={editForm.project_info}
                  onChange={(v) => setEditField("project_info", v)}
                >
                  <Label>Thông tin chung về dự án</Label>
                  <TextArea
                    className="min-h-[7rem]"
                    placeholder="Dự án gì? Sản phẩm gì? Đang trong giai đoạn nào? Có căng không, có hay OT không?..."
                  />
                </TextField>

                <TextField
                  value={editForm.duties_and_responsibilities}
                  onChange={(v) => setEditField("duties_and_responsibilities", v)}
                >
                  <Label>Kỳ vọng về trách nhiệm công việc trong dự án</Label>
                  <TextArea
                    className="min-h-[6rem]"
                    placeholder="Ứng viên sẽ đảm nhận những công việc / trách nhiệm gì trong dự án?"
                  />
                </TextField>

                <TextField
                  value={editForm.team_size}
                  onChange={(v) => setEditField("team_size", v)}
                >
                  <Label>Team size</Label>
                  <TextArea
                    className="min-h-[4rem]"
                    placeholder="Bao nhiêu thành viên? Gồm những vị trí gì? VD: 6 người (1 BA, 2 FE, 2 BE, 1 QA)"
                  />
                </TextField>
              </div>

              {/* 3 – Yêu cầu */}
              <div className="space-y-4">
                <SectionLabel>Yêu cầu ứng viên</SectionLabel>

                <TextField
                  value={editForm.experience_requirements_must_have}
                  onChange={(v) => setEditField("experience_requirements_must_have", v)}
                >
                  <Label>Yêu cầu bắt buộc — Must have</Label>
                  <TextArea
                    className="min-h-[7rem]"
                    placeholder="Các yêu cầu quan trọng, bắt buộc về chuyên môn, nghiệp vụ, kỹ năng mềm..."
                  />
                </TextField>

                <TextField
                  value={editForm.experience_requirements_nice_to_have}
                  onChange={(v) => setEditField("experience_requirements_nice_to_have", v)}
                >
                  <Label>Yêu cầu nếu có thì tốt — Nice to have</Label>
                  <TextArea
                    className="min-h-[5rem]"
                    placeholder="Các yêu cầu không bắt buộc nhưng là lợi thế..."
                  />
                </TextField>

                <TextField
                  value={editForm.language_requirements}
                  onChange={(v) => setEditField("language_requirements", v)}
                >
                  <Label>Yêu cầu về ngoại ngữ</Label>
                  <TextArea
                    className="min-h-[4rem]"
                    placeholder="Ngôn ngữ gì? Mức độ? Có cần bằng cấp không? VD: Tiếng Anh đọc hiểu tài liệu kỹ thuật, TOEIC 600+"
                  />
                </TextField>

                <TextField
                  value={editForm.other_requirements}
                  onChange={(v) => setEditField("other_requirements", v)}
                >
                  <Label>Yêu cầu khác</Label>
                  <TextArea
                    className="min-h-[4rem]"
                    placeholder="Tính cách, giới tính, độ tuổi (nếu có)..."
                  />
                </TextField>
              </div>

              {/* 4 – Phát triển & Đãi ngộ */}
              <div className="space-y-4">
                <SectionLabel>Phát triển &amp; Đãi ngộ</SectionLabel>

                <TextField
                  value={editForm.career_development}
                  onChange={(v) => setEditField("career_development", v)}
                >
                  <Label>Cơ hội phát triển &amp; định hướng vị trí</Label>
                  <TextArea
                    className="min-h-[5rem]"
                    placeholder="Lộ trình phát triển, định hướng thăng tiến, cơ hội học hỏi..."
                  />
                </TextField>

                <div className="grid gap-4 md:grid-cols-2">
                  <TextField
                    value={editForm.salary_range}
                    onChange={(v) => setEditField("salary_range", v)}
                  >
                    <Label>Lương (Range gross)</Label>
                    <Input placeholder="VD: 20,000,000 – 35,000,000 VNĐ" />
                  </TextField>

                  <TextField
                    value={editForm.project_allowances}
                    onChange={(v) => setEditField("project_allowances", v)}
                  >
                    <Label>Phụ cấp / Thưởng riêng dự án</Label>
                    <Input placeholder="VD: Phụ cấp ăn trưa, thưởng KPI quý..." />
                  </TextField>
                </div>
              </div>

              {/* 5 – Quy trình & Timeline */}
              <div className="space-y-4">
                <SectionLabel>Quy trình &amp; Timeline</SectionLabel>

                <TextField
                  value={editForm.interview_process}
                  onChange={(v) => setEditField("interview_process", v)}
                >
                  <Label>Quy trình phỏng vấn</Label>
                  <TextArea
                    className="min-h-[6rem]"
                    placeholder="Phỏng vấn mấy vòng? Ai tham gia từng vòng? Có bài test không?&#10;VD: Vòng 1: HR screening / Vòng 2: Technical test + CTO / Vòng 3: Offer"
                  />
                </TextField>

                <TextField
                  value={editForm.hiring_deadline}
                  onChange={(v) => setEditField("hiring_deadline", v)}
                >
                  <Label>Deadline tuyển dụng</Label>
                  <Input type="date" />
                </TextField>
              </div>

              {editError && (
                <p className="text-sm text-danger">{editError}</p>
              )}
            </Modal.Body>

            <Modal.Footer className="justify-between border-t border-divider px-6 py-5">
              <Button
                variant="ghost"
                onPress={editIntakeModal.close}
                isDisabled={editSubmitting}
              >
                Hủy
              </Button>
              <Button
                variant="primary"
                isDisabled={editSubmitting}
                onPress={() => void handleEditSave()}
              >
                {editSubmitting ? "Đang lưu…" : "Lưu thông tin"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* ── Filters ── */}
      <Card variant="secondary">
        <Card.Content className="flex flex-col gap-4 p-4 sm:p-5">
          <SectionLabel>Filter job descriptions</SectionLabel>
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
            <SearchField
              value={jdListSearch}
              onChange={setJdListSearch}
              className="min-w-[220px] flex-1"
            >
              <SearchField.Group className="w-full">
                <SearchField.SearchIcon />
                <SearchField.Input
                  placeholder="Search by job title / position…"
                  className="w-full min-w-0"
                />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <Select
              value={jdListStatusKey}
              onChange={(key) => {
                if (typeof key === "string") setJdListStatusKey(key);
              }}
              className="min-w-[200px]"
            >
              <Label className="sr-only">Status</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="all" textValue="All statuses">
                    All statuses
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  {JD_STATUS_OPTIONS.map((s) => (
                    <ListBox.Item key={s} id={s} textValue={s}>
                      {s}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted">Start date from</Label>
                <Input
                  type="date"
                  value={jdStartDateFrom}
                  onChange={(e) => setJdStartDateFrom(e.target.value)}
                  className="w-[11rem]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted">Start date to</Label>
                <Input
                  type="date"
                  value={jdStartDateTo}
                  onChange={(e) => setJdStartDateTo(e.target.value)}
                  className="w-[11rem]"
                />
              </div>
            </div>
          </div>
        </Card.Content>
      </Card>

      {/* ── Table ── */}
      <Card>
        <Card.Content className="gap-0 p-0">
          {(fetchError || statusUpdateError) && (
            <div className="space-y-1 px-6 py-4 text-sm text-danger">
              {fetchError ? <p>{fetchError}</p> : null}
              {statusUpdateError ? <p>{statusUpdateError}</p> : null}
            </div>
          )}
          <Table>
            <Table.ScrollContainer>
              <Table.Content
                aria-label="Job descriptions"
                className="min-w-[920px]"
              >
                <Table.Header>
                  <Table.Column isRowHeader>Position</Table.Column>
                  <Table.Column className="text-center tabular-nums">
                    Applicants
                  </Table.Column>
                  <Table.Column>Department</Table.Column>
                  <Table.Column>Start date</Table.Column>
                  <Table.Column>End date</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>Actions</Table.Column>
                </Table.Header>
                <Table.Body
                  key={
                    loading
                      ? "jd-table-loading"
                      : paginatedRows.length === 0
                        ? "jd-table-empty"
                        : "jd-table-data"
                  }
                >
                  {loading ? (
                    <Table.Row id="jd-row-loading">
                      <Table.Cell className="py-8 text-center text-muted" colSpan={7}>
                        Loading…
                      </Table.Cell>
                    </Table.Row>
                  ) : paginatedRows.length === 0 ? (
                    <Table.Row id="jd-row-empty">
                      <Table.Cell className="py-8 text-center text-muted" colSpan={7}>
                        No job descriptions found.
                      </Table.Cell>
                    </Table.Row>
                  ) : (
                    paginatedRows.map((row) => (
                      <Table.Row key={row.id} id={String(row.id)}>
                        <Table.Cell>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link
                              href={`/admin/jd/${row.id}/pipeline`}
                              className="inline-flex max-w-full items-center rounded-md px-1 py-0.5 font-semibold text-accent underline decoration-accent/40 decoration-2 underline-offset-2 transition-colors hover:bg-accent/10 hover:decoration-accent"
                            >
                              {row.position}
                            </Link>
                            {row.has_jd_source_file ? (
                              <a
                                href={`/api/admin/job-descriptions/${row.id}/jd-download`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
                              >
                                JD file
                              </a>
                            ) : null}
                          </div>
                        </Table.Cell>
                        <Table.Cell className="text-center tabular-nums text-muted">
                          {row.applicant_count ?? 0}
                        </Table.Cell>
                        <Table.Cell>{row.department ?? "—"}</Table.Cell>
                        <Table.Cell className="whitespace-nowrap text-muted">
                          {formatJdCalendarDate(row.start_date)}
                        </Table.Cell>
                        <Table.Cell className="whitespace-nowrap text-muted">
                          {formatJdCalendarDate(row.end_date)}
                        </Table.Cell>
                        <Table.Cell className="min-w-[9.5rem]">
                          <Select
                            value={row.status}
                            isDisabled={statusUpdatingId === row.id}
                            onChange={(key) => {
                              if (typeof key === "string")
                                void updateJdStatus(row.id, key as JdStatus);
                            }}
                          >
                            <Select.Trigger
                              className={`h-9 min-h-9 border ${jdStatusSelectTriggerClass(row.status)}`}
                            >
                              <Select.Value />
                              <Select.Indicator />
                            </Select.Trigger>
                            <Select.Popover>
                              <ListBox>
                                {JD_STATUS_OPTIONS.map((s) => (
                                  <ListBox.Item
                                    key={s}
                                    id={s}
                                    textValue={s}
                                    className={jdStatusListItemClass(s)}
                                  >
                                    {s}
                                    <ListBox.ItemIndicator />
                                  </ListBox.Item>
                                ))}
                              </ListBox>
                            </Select.Popover>
                          </Select>
                        </Table.Cell>
                        <Table.Cell>
                          <div className="flex items-center gap-1">
                            <Button
                              aria-label={`View ${row.position}`}
                              variant="ghost"
                              size="sm"
                              className="min-w-0 px-2"
                              onPress={() => {
                                setActiveRow(row);
                                setDrawerOpen(true);
                              }}
                            >
                              <EyeIcon className="size-4" />
                            </Button>
                            <Button
                              aria-label={`Edit ${row.position}`}
                              variant="ghost"
                              size="sm"
                              className="min-w-0 px-2"
                              onPress={() => openEdit(row)}
                            >
                              <PencilIcon className="size-4" />
                            </Button>
                            <Button
                              aria-label={`Delete ${row.position}`}
                              variant="ghost"
                              size="sm"
                              className="min-w-0 px-2 text-danger hover:bg-danger/10"
                              onPress={() => {
                                setDeletingId(row.id);
                                deleteModal.open();
                              }}
                            >
                              <TrashIcon className="size-4" />
                            </Button>
                          </div>
                        </Table.Cell>
                      </Table.Row>
                    ))
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
            <Table.Footer className="border-t border-divider px-4 py-3">
              <Pagination size="sm">
                <Pagination.Summary>
                  Showing {startIdx} to {endIdx} of {filteredRows.length} records
                </Pagination.Summary>
                <Pagination.Content>
                  <Pagination.Item>
                    <Pagination.Previous
                      isDisabled={safePage <= 1}
                      onPress={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <Pagination.PreviousIcon />
                    </Pagination.Previous>
                  </Pagination.Item>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <Pagination.Item key={p}>
                      <Pagination.Link
                        isActive={p === safePage}
                        onPress={() => setPage(p)}
                      >
                        {p}
                      </Pagination.Link>
                    </Pagination.Item>
                  ))}
                  <Pagination.Item>
                    <Pagination.Next
                      isDisabled={safePage >= totalPages}
                      onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      <Pagination.NextIcon />
                    </Pagination.Next>
                  </Pagination.Item>
                </Pagination.Content>
              </Pagination>
            </Table.Footer>
          </Table>
        </Card.Content>
      </Card>

      {/* ── Detail Drawer ── */}
      <Drawer.Backdrop isOpen={drawerOpen} onOpenChange={setDrawerOpen}>
        <Drawer.Content placement="right">
          <Drawer.Dialog className="w-full max-w-md sm:max-w-lg">
            <Drawer.CloseTrigger />
            {activeRow ? (
              <>
                <Drawer.Header>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip
                      color={statusChipColor(activeRow.status)}
                      size="sm"
                      variant="soft"
                    >
                      {activeRow.status}
                    </Chip>
                    {activeRow.department && (
                      <Chip size="sm" variant="soft">
                        {activeRow.department}
                      </Chip>
                    )}
                  </div>
                  <Drawer.Heading className="mt-2">{activeRow.position}</Drawer.Heading>
                  <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted">
                    {activeRow.employment_status ? (
                      <span>JD status: {activeRow.employment_status}</span>
                    ) : null}
                    {activeRow.start_date ? (
                      <span>
                        Hiring starts: {formatJdCalendarDate(activeRow.start_date)}
                      </span>
                    ) : null}
                    {activeRow.end_date ? (
                      <span>
                        Hiring ends: {formatJdCalendarDate(activeRow.end_date)}
                      </span>
                    ) : null}
                    {activeRow.work_location && (
                      <span>📍 {activeRow.work_location}</span>
                    )}
                    {activeRow.reporting && (
                      <span>Reports to: {activeRow.reporting}</span>
                    )}
                  </div>
                </Drawer.Header>

                <Drawer.Body className="flex flex-col gap-6">
                  <section className="rounded-xl border border-divider bg-surface-secondary/40 px-4 py-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Applicants by pipeline status
                    </h3>
                    {drawerStatusCountsError ? (
                      <p className="mt-2 text-sm text-danger">{drawerStatusCountsError}</p>
                    ) : drawerStatusCounts == null ? (
                      <p className="mt-2 text-sm text-muted">Loading counts…</p>
                    ) : (
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                        {ALL_PIPELINE_STATUSES.map((st) => (
                          <div
                            key={st}
                            className="flex items-baseline justify-between gap-2 text-sm"
                          >
                            <dt className="text-muted">{st}</dt>
                            <dd className="tabular-nums font-semibold text-foreground">
                              {drawerStatusCounts[st] ?? 0}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </section>

                  {/* Intake fields */}
                  {(activeRow.level || activeRow.headcount != null || activeRow.hire_type || activeRow.reporting) && (
                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold text-foreground">Vị trí &amp; Tổ chức</h3>
                      <dl className="space-y-1 text-sm text-muted">
                        {activeRow.level && <div><dt className="inline font-medium text-foreground">Level: </dt><dd className="inline">{activeRow.level}</dd></div>}
                        {activeRow.headcount != null && <div><dt className="inline font-medium text-foreground">Số lượng tuyển: </dt><dd className="inline">{activeRow.headcount}</dd></div>}
                        {activeRow.hire_type && <div><dt className="inline font-medium text-foreground">Loại tuyển: </dt><dd className="inline">{activeRow.hire_type}</dd></div>}
                        {activeRow.reporting && <div><dt className="inline font-medium text-foreground">Báo cáo cho: </dt><dd className="inline">{activeRow.reporting}</dd></div>}
                      </dl>
                    </section>
                  )}

                  {(activeRow.project_info || activeRow.duties_and_responsibilities || activeRow.team_size) && (
                    <>
                      <Separator />
                      <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground">Dự án &amp; Team</h3>
                        {activeRow.project_info && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Thông tin dự án</p>
                            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.project_info}</p>
                          </div>
                        )}
                        {activeRow.duties_and_responsibilities && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Kỳ vọng trách nhiệm</p>
                            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.duties_and_responsibilities}</p>
                          </div>
                        )}
                        {activeRow.team_size && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Team size</p>
                            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.team_size}</p>
                          </div>
                        )}
                      </section>
                    </>
                  )}

                  {(activeRow.experience_requirements_must_have || activeRow.experience_requirements_nice_to_have || activeRow.language_requirements || activeRow.other_requirements) && (
                    <>
                      <Separator />
                      <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground">Yêu cầu ứng viên</h3>
                        {activeRow.experience_requirements_must_have && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Must have</p>
                            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.experience_requirements_must_have}</p>
                          </div>
                        )}
                        {activeRow.experience_requirements_nice_to_have && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Nice to have</p>
                            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.experience_requirements_nice_to_have}</p>
                          </div>
                        )}
                        {activeRow.language_requirements && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Ngoại ngữ</p>
                            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.language_requirements}</p>
                          </div>
                        )}
                        {activeRow.other_requirements && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Yêu cầu khác</p>
                            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.other_requirements}</p>
                          </div>
                        )}
                      </section>
                    </>
                  )}

                  {(activeRow.career_development || activeRow.salary_range || activeRow.project_allowances) && (
                    <>
                      <Separator />
                      <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground">Phát triển &amp; Đãi ngộ</h3>
                        {activeRow.career_development && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Cơ hội phát triển</p>
                            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.career_development}</p>
                          </div>
                        )}
                        {activeRow.salary_range && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Lương (gross)</p>
                            <p className="mt-1 text-sm text-muted">{activeRow.salary_range}</p>
                          </div>
                        )}
                        {activeRow.project_allowances && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Phụ cấp / Thưởng dự án</p>
                            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.project_allowances}</p>
                          </div>
                        )}
                      </section>
                    </>
                  )}

                  {(activeRow.interview_process || activeRow.hiring_deadline) && (
                    <>
                      <Separator />
                      <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground">Quy trình &amp; Timeline</h3>
                        {activeRow.interview_process && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Quy trình phỏng vấn</p>
                            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.interview_process}</p>
                          </div>
                        )}
                        {activeRow.hiring_deadline && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Deadline tuyển dụng</p>
                            <p className="mt-1 text-sm text-muted">{formatJdCalendarDate(activeRow.hiring_deadline)}</p>
                          </div>
                        )}
                      </section>
                    </>
                  )}

                  {activeRow.role_overview && (
                    <>
                      <Separator />
                      <section>
                        <h3 className="text-sm font-semibold text-foreground">
                          Role overview
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted">
                          {activeRow.role_overview}
                        </p>
                      </section>
                    </>
                  )}

                  {activeRow.what_we_offer && (
                    <>
                      <Separator />
                      <section>
                        <h3 className="text-sm font-semibold text-foreground">
                          What we offer
                        </h3>
                        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
                          {activeRow.what_we_offer}
                        </p>
                      </section>
                    </>
                  )}

                  <Separator />

                  <section className="space-y-1 text-xs text-muted">
                    <p>Created: {formatDate(activeRow.created_at)}</p>
                    <p>Last updated: {formatDate(activeRow.updated_at)}</p>
                    {activeRow.update_note && (
                      <p>Update note: {activeRow.update_note}</p>
                    )}
                  </section>
                </Drawer.Body>

                <Drawer.Footer className="flex flex-wrap gap-2">
                  <Button slot="close" variant="secondary">
                    Close
                  </Button>
                  <Button variant="primary" onPress={() => openEdit(activeRow)}>
                    Edit JD
                  </Button>
                </Drawer.Footer>
              </>
            ) : null}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </div>
  );
}
