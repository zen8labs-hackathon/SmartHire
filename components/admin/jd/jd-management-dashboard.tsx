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
  type JdStatus,
} from "@/lib/jd/types";
import { normalizeFormText, utcDateStringToday } from "@/lib/jd/normalize-text";
import {
  JD_BUCKET,
  MAX_JD_BYTES,
  isAllowedJdFilename,
} from "@/lib/jd/upload-constants";
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

/** Filter chip: selected state (filled). */
function jdStatusFilterSelectedClass(status: JdStatus): string {
  switch (status) {
    case "Hiring":
      return "border-success/50 bg-success/20 font-medium text-success";
    case "Pending":
      return "border-warning/50 bg-warning/20 font-medium text-warning";
    case "Done":
      return "border-accent/50 bg-accent/15 font-medium text-accent";
    case "Closed":
      return "border-danger/45 bg-danger/15 font-medium text-danger";
    default:
      return "";
  }
}

/** Filter chip: idle hover hint. */
function jdStatusFilterIdleClass(status: JdStatus): string {
  switch (status) {
    case "Hiring":
      return "border-transparent hover:border-success/30 hover:bg-success/5";
    case "Pending":
      return "border-transparent hover:border-warning/30 hover:bg-warning/5";
    case "Done":
      return "border-transparent hover:border-accent/30 hover:bg-accent/5";
    case "Closed":
      return "border-transparent hover:border-danger/25 hover:bg-danger/5";
    default:
      return "";
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

function kpiCardAccentClass(kpiId: string): string {
  switch (kpiId) {
    case "done":
      return "border-l-4 border-l-accent pl-3";
    case "hiring":
      return "border-l-4 border-l-success pl-3";
    case "pending":
      return "border-l-4 border-l-warning pl-3";
    case "closed":
      return "border-l-4 border-l-danger pl-3";
    default:
      return "border-l-4 border-l-divider pl-3";
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

function TableIcon({ className }: { className?: string }) {
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
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
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
  const [statusFilter, setStatusFilter] = useState<JdStatus | null>(null);

  // ── drawer ──────────────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<JobDescription | null>(null);

  // ── modal / form ────────────────────────────────────────────────────────
  const [editingRow, setEditingRow] = useState<JobDescription | null>(null);
  const [form, setForm] = useState<JobDescriptionFormData>(DEFAULT_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
        setEditingRow(null);
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

  // ── API helpers ──────────────────────────────────────────────────────────

  const authHeaders = useCallback(async () => {
    const h = await getSessionAuthorizationHeaders(supabase);
    return { "Content-Type": "application/json", ...h };
  }, [supabase]);

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
      if (editingRow && !form.position.trim()) {
        setFormError("Position is required.");
        return;
      }
      setFormSubmitting(true);
      setFormError(null);
      const positionFromFile =
        jdSelectedFileName?.replace(/\.[^./\\]+$/i, "").trim().slice(0, 50) ||
        "";
      const resolvedPosition = editingRow
        ? form.position.trim()
        : form.position.trim() || positionFromFile || "Untitled JD";
      const payload: JobDescriptionFormData = {
        ...form,
        position: resolvedPosition,
        status: asDraft
          ? "Pending"
          : !editingRow && form.status === "Pending"
            ? "Hiring"
            : form.status,
      };
      const postBody =
        !editingRow && jdDraftJobOpeningId
          ? { ...payload, jdDraftJobOpeningId }
          : payload;
      try {
        const headers = await authHeaders();
        let res: Response;
        if (editingRow) {
          res = await fetch(`/api/admin/job-descriptions/${editingRow.id}`, {
            method: "PUT",
            credentials: "include",
            headers,
            body: JSON.stringify(payload),
          });
        } else {
          res = await fetch("/api/admin/job-descriptions", {
            method: "POST",
            credentials: "include",
            headers,
            body: JSON.stringify(postBody),
          });
        }
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
      editingRow,
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

  // ── open modal for edit ──────────────────────────────────────────────────

  function openEdit(row: JobDescription) {
    setEditingRow(row);
    setForm({
      position: normalizeFormText(row.position),
      department: normalizeFormText(row.department),
      employment_status: normalizeFormText(row.employment_status),
      status: coerceJdStatus(String(row.status)),
      update_note: normalizeFormText(row.update_note),
      work_location: normalizeFormText(row.work_location),
      reporting: normalizeFormText(row.reporting),
      role_overview: normalizeFormText(row.role_overview),
      duties_and_responsibilities: normalizeFormText(
        row.duties_and_responsibilities,
      ),
      experience_requirements_must_have: normalizeFormText(
        row.experience_requirements_must_have,
      ),
      experience_requirements_nice_to_have: normalizeFormText(
        row.experience_requirements_nice_to_have,
      ),
      what_we_offer: normalizeFormText(row.what_we_offer),
      start_date: row.start_date ? row.start_date.slice(0, 10) : "",
    });
    jdModal.open();
  }

  // ── table data ───────────────────────────────────────────────────────────

  const filteredRows = useMemo(
    () =>
      statusFilter
        ? rows.filter((r) => r.status === statusFilter)
        : rows,
    [rows, statusFilter],
  );

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * ROWS_PER_PAGE;
    return filteredRows.slice(start, start + ROWS_PER_PAGE);
  }, [filteredRows, safePage]);

  const startIdx = filteredRows.length === 0 ? 0 : (safePage - 1) * ROWS_PER_PAGE + 1;
  const endIdx = Math.min(safePage * ROWS_PER_PAGE, filteredRows.length);

  // ── KPIs ─────────────────────────────────────────────────────────────────

  const kpis = useMemo(
    () => [
      { id: "total", value: String(rows.length), label: "Total JDs" },
      {
        id: "done",
        value: String(rows.filter((r) => r.status === "Done").length),
        label: "Done",
      },
      {
        id: "hiring",
        value: String(rows.filter((r) => r.status === "Hiring").length),
        label: "Hiring",
      },
      {
        id: "pending",
        value: String(rows.filter((r) => r.status === "Pending").length),
        label: "Pending",
      },
      {
        id: "closed",
        value: String(rows.filter((r) => r.status === "Closed").length),
        label: "Closed",
      },
    ],
    [rows],
  );

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
              setEditingRow(null);
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

      {/* ── Create / Edit Modal ── */}
      <Modal.Backdrop
        className="bg-black/40 backdrop-blur-sm"
        isOpen={jdModal.isOpen}
        onOpenChange={jdModal.setOpen}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-[820px] overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="items-start border-b border-divider px-6 py-5">
              <Modal.Heading className="text-xl">
                {editingRow ? "Edit Job Description" : "Create New Definition"}
              </Modal.Heading>
            </Modal.Header>

            <Modal.Body className="max-h-[72vh] space-y-6 overflow-y-auto px-6 py-6">
              {/* File upload (optional) */}
              {!editingRow && (
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
              )}

              <div className="space-y-4">
                <SectionLabel>Basic information</SectionLabel>
                <div className="grid gap-4 md:grid-cols-2">
                  <TextField
                    value={form.position}
                    onChange={(v) => setField("position", v)}
                    isRequired
                  >
                    <Label>Position *</Label>
                    <Input placeholder="e.g. AI Engineer (Mid-level)" />
                  </TextField>

                  <TextField
                    value={form.department}
                    onChange={(v) => setField("department", v)}
                  >
                    <Label>Department</Label>
                    <Input placeholder="e.g. Solutions Team" />
                  </TextField>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <TextField
                    value={form.employment_status}
                    onChange={(v) => setField("employment_status", v)}
                  >
                    <Label>Status</Label>
                    <Input placeholder="e.g. Fulltime, Part-time" />
                  </TextField>

                  <TextField
                    value={form.update_note}
                    onChange={(v) => setField("update_note", v)}
                  >
                    <Label>Update / revision</Label>
                    <Input placeholder="e.g. 2026 or revision note" />
                  </TextField>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <TextField
                    value={form.start_date}
                    onChange={(v) => setField("start_date", v)}
                  >
                    <Label>Hiring start date</Label>
                    <Input type="date" />
                  </TextField>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Select
                    value={form.status}
                    onChange={(key) => {
                      if (typeof key === "string")
                        setField("status", key as JdStatus);
                    }}
                  >
                    <Label>JD status</Label>
                    <Select.Trigger
                      className={`border ${jdStatusSelectTriggerClass(form.status)}`}
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

                  <TextField
                    value={form.work_location}
                    onChange={(v) => setField("work_location", v)}
                  >
                    <Label>Work location</Label>
                    <Input placeholder="e.g. Hanoi / Remote / Hybrid" />
                  </TextField>
                </div>
              </div>

              {/* Organisational */}
              <div className="space-y-4">
                <SectionLabel>Organisation</SectionLabel>
                <div className="grid gap-4 md:grid-cols-2">
                  <TextField
                    value={form.reporting}
                    onChange={(v) => setField("reporting", v)}
                  >
                    <Label>Reporting to</Label>
                    <Input placeholder="e.g. VP of Engineering" />
                  </TextField>

                  <TextField
                    value={form.role_overview}
                    onChange={(v) => setField("role_overview", v)}
                  >
                    <Label>Role overview</Label>
                    <Input placeholder="One-line summary of the role" />
                  </TextField>
                </div>
              </div>

              {/* Content */}
              <div className="space-y-4">
                <SectionLabel>Job content</SectionLabel>

                <TextField
                  value={form.duties_and_responsibilities}
                  onChange={(v) => setField("duties_and_responsibilities", v)}
                >
                  <Label>Duties &amp; responsibilities</Label>
                  <TextArea className="min-h-[8rem]" />
                </TextField>

                <TextField
                  value={form.experience_requirements_must_have}
                  onChange={(v) =>
                    setField("experience_requirements_must_have", v)
                  }
                >
                  <Label>Experience requirements — must have</Label>
                  <TextArea className="min-h-[6rem]" />
                </TextField>

                <TextField
                  value={form.experience_requirements_nice_to_have}
                  onChange={(v) =>
                    setField("experience_requirements_nice_to_have", v)
                  }
                >
                  <Label>Experience requirements — nice to have</Label>
                  <TextArea className="min-h-[6rem]" />
                </TextField>

                <TextField
                  value={form.what_we_offer}
                  onChange={(v) => setField("what_we_offer", v)}
                >
                  <Label>What we offer</Label>
                  <TextArea className="min-h-[6rem]" />
                </TextField>
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
                {editingRow ? "Cancel" : "Discard draft"}
              </Button>
              <div className="flex gap-2">
                {!editingRow && (
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
                )}
                <Button
                  variant="primary"
                  isDisabled={
                    formSubmitting ||
                    jdUploadPhase === "uploading" ||
                    jdUploadPhase === "extracting"
                  }
                  onPress={() => void handleSave(false)}
                >
                  {formSubmitting
                    ? "Saving…"
                    : editingRow
                      ? "Save changes"
                      : "Create"}
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

      {/* ── Status filter chips ── */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={statusFilter === null ? "primary" : "secondary"}
          onPress={() => {
            setStatusFilter(null);
            setPage(1);
          }}
        >
          All
        </Button>
        {JD_STATUS_OPTIONS.map((s) => {
          const selected = statusFilter === s;
          return (
            <Button
              key={s}
              size="sm"
              variant="secondary"
              className={
                selected
                  ? jdStatusFilterSelectedClass(s)
                  : jdStatusFilterIdleClass(s)
              }
              onPress={() => {
                setStatusFilter((prev) => (prev === s ? null : s));
                setPage(1);
              }}
            >
              {s}
            </Button>
          );
        })}
      </div>

      {/* ── KPI cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <Card
            key={kpi.id}
            variant="secondary"
            className={kpiCardAccentClass(kpi.id)}
          >
            <Card.Header className="gap-1">
              <Card.Title className="text-2xl font-semibold tabular-nums">
                {loading ? "—" : kpi.value}
              </Card.Title>
              <Card.Description>{kpi.label}</Card.Description>
            </Card.Header>
          </Card>
        ))}
      </div>

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
                className="min-w-[960px]"
              >
                <Table.Header>
                  <Table.Column isRowHeader>Position</Table.Column>
                  <Table.Column>Department</Table.Column>
                  <Table.Column>Work location</Table.Column>
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
                        <Table.Cell className="font-medium">
                          {row.position}
                        </Table.Cell>
                        <Table.Cell>{row.department ?? "—"}</Table.Cell>
                        <Table.Cell>{row.work_location ?? "—"}</Table.Cell>
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
                            <Link
                              href={`/admin/jd/${row.id}/pipeline`}
                              aria-label={`Open pipeline for ${row.position}`}
                              className="inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
                            >
                              <TableIcon className="size-4" />
                            </Link>
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
                  {activeRow.role_overview && (
                    <section>
                      <h3 className="text-sm font-semibold text-foreground">
                        Role overview
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted">
                        {activeRow.role_overview}
                      </p>
                    </section>
                  )}

                  {activeRow.duties_and_responsibilities && (
                    <>
                      <Separator />
                      <section>
                        <h3 className="text-sm font-semibold text-foreground">
                          Duties &amp; responsibilities
                        </h3>
                        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
                          {activeRow.duties_and_responsibilities}
                        </p>
                      </section>
                    </>
                  )}

                  {activeRow.experience_requirements_must_have && (
                    <>
                      <Separator />
                      <section>
                        <h3 className="text-sm font-semibold text-foreground">
                          Experience — must have
                        </h3>
                        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
                          {activeRow.experience_requirements_must_have}
                        </p>
                      </section>
                    </>
                  )}

                  {activeRow.experience_requirements_nice_to_have && (
                    <>
                      <Separator />
                      <section>
                        <h3 className="text-sm font-semibold text-foreground">
                          Experience — nice to have
                        </h3>
                        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
                          {activeRow.experience_requirements_nice_to_have}
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
