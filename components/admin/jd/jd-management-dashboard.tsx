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
  DateField,
  DateRangePicker,
  Drawer,
  Input,
  Label,
  ListBox,
  Modal,
  Pagination,
  RangeCalendar,
  SearchField,
  Select,
  Separator,
  Table,
  TextArea,
  TextField,
  Tooltip,
  useOverlayState,
} from "@heroui/react";
import type { CalendarDate } from "@internationalized/date";
import type { RangeValue } from "react-aria-components";
import { Dialog } from "react-aria-components";

import { parseViewerEmailInput } from "@/lib/admin/jd-viewer-sync";
import {
  appendEmailToViewerDraft,
  JdViewerEmailSearch,
} from "@/components/admin/jd/jd-viewer-email-search";
import {
  extractedApiToFormPatch,
  extractedPatchToEditFormPatch,
} from "@/lib/jd/extracted-to-form";
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

const HIRE_TYPE_OPTIONS = ["New hire", "Replacement"] as const;

const LEGACY_HIRE_TYPE_VI_TO_EN: Record<string, string> = {
  "Tuyển mới": "New hire",
  "Tuyển thay thế": "Replacement",
};

function normalizeHireTypeForForm(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  return LEGACY_HIRE_TYPE_VI_TO_EN[t] ?? t;
}

function formatHireTypeDisplay(raw: string | null | undefined): string {
  return normalizeHireTypeForForm(raw);
}

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

/** Hiring intake / recruitment details (edit intake modal). */
function RecruitmentInfoIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
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

function ChapterPicker({
  chapters,
  selectedIds,
  onChange,
}: {
  chapters: readonly { id: string; name: string }[];
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  }

  if (chapters.length === 0) {
    return (
      <p className="text-xs text-muted">
        No chapters yet. Add them under Setup → Chapters.
      </p>
    );
  }

  return (
    <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-divider p-3">
      {chapters.map((c) => (
        <label
          key={c.id}
          className="flex cursor-pointer items-center gap-2 text-sm"
        >
          <input
            type="checkbox"
            className="rounded border-divider"
            checked={selectedIds.includes(c.id)}
            onChange={() => toggle(c.id)}
          />
          <span>{c.name}</span>
        </label>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function JdManagementDashboard({
  canManageJds = true,
  chapters = [],
}: {
  canManageJds?: boolean;
  chapters?: readonly { id: string; name: string }[];
} = {}) {
  const supabase = useMemo(() => createClient(), []);
  const jdFileInputRef = useRef<HTMLInputElement>(null);
  const editJdFileInputRef = useRef<HTMLInputElement>(null);
  const editDraftJobOpeningIdRef = useRef<string | null>(null);

  // ── data ────────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<JobDescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);

  // ── pagination / filter ─────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [jdListSearch, setJdListSearch] = useState("");
  const [jdListStatusKey, setJdListStatusKey] = useState<string>("all");
  const [jdStartDateRange, setJdStartDateRange] =
    useState<RangeValue<CalendarDate> | null>(null);

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
  const [createViewerEmailsText, setCreateViewerEmailsText] = useState("");
  const [createViewerChapterIds, setCreateViewerChapterIds] = useState<
    string[]
  >([]);

  const [drawerViewerDraft, setDrawerViewerDraft] = useState("");
  const [drawerViewerChapterIds, setDrawerViewerChapterIds] = useState<
    string[]
  >([]);
  const [drawerViewersLoading, setDrawerViewersLoading] = useState(false);
  const [drawerViewersBusy, setDrawerViewersBusy] = useState(false);
  const [drawerViewersError, setDrawerViewersError] = useState<string | null>(
    null,
  );

  // ── edit intake modal ────────────────────────────────────────────────────
  const [editIntakeRow, setEditIntakeRow] = useState<JobDescription | null>(null);
  const [editForm, setEditForm] = useState<JdEditFormData>(DEFAULT_EDIT_FORM);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editUploadPhase, setEditUploadPhase] = useState<JdUploadPhase>("idle");
  const [editUploadError, setEditUploadError] = useState<string | null>(null);
  const [editDraftJobOpeningId, setEditDraftJobOpeningId] = useState<
    string | null
  >(null);
  const [editSelectedFileName, setEditSelectedFileName] = useState<string | null>(
    null,
  );
  const [editDragOver, setEditDragOver] = useState(false);

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

  const resetEditUploadState = useCallback(() => {
    setEditUploadPhase("idle");
    setEditUploadError(null);
    setEditDraftJobOpeningId(null);
    editDraftJobOpeningIdRef.current = null;
    setEditSelectedFileName(null);
    setEditDragOver(false);
    if (editJdFileInputRef.current) editJdFileInputRef.current.value = "";
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

  useEffect(() => {
    if (!drawerOpen || !activeRow?.id || !canManageJds) {
      setDrawerViewerDraft("");
      setDrawerViewerChapterIds([]);
      setDrawerViewersError(null);
      setDrawerViewersLoading(false);
    }
  }, [drawerOpen, activeRow?.id, canManageJds]);

  useEffect(() => {
    if (!drawerOpen || !activeRow?.id || !canManageJds) {
      return;
    }
    let cancelled = false;
    setDrawerViewersLoading(true);
    setDrawerViewersError(null);
    void (async () => {
      try {
        const h = await getSessionAuthorizationHeaders(supabase);
        const res = await fetch(
          `/api/admin/job-descriptions/${activeRow.id}`,
          { credentials: "include", headers: { ...h } },
        );
        const json = (await res.json()) as {
          viewerEmails?: string[];
          viewerChapterIds?: string[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setDrawerViewersError(json.error ?? "Could not load viewers.");
          setDrawerViewerDraft("");
          setDrawerViewerChapterIds([]);
          return;
        }
        setDrawerViewerDraft((json.viewerEmails ?? []).join("\n"));
        setDrawerViewerChapterIds(json.viewerChapterIds ?? []);
      } catch {
        if (!cancelled) {
          setDrawerViewersError("Could not load viewers.");
          setDrawerViewerDraft("");
          setDrawerViewerChapterIds([]);
        }
      } finally {
        if (!cancelled) setDrawerViewersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, activeRow?.id, canManageJds, supabase]);

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

  const saveDrawerViewers = useCallback(async () => {
    if (!activeRow) return;
    setDrawerViewersBusy(true);
    setDrawerViewersError(null);
    try {
      const headers = await authHeaders();
      const emails = parseViewerEmailInput(drawerViewerDraft);
      const res = await fetch(`/api/admin/job-descriptions/${activeRow.id}`, {
        method: "PUT",
        credentials: "include",
        headers,
        body: JSON.stringify({
          viewerEmails: emails,
          viewerChapterIds: drawerViewerChapterIds,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        viewerEmails?: string[];
        viewerChapterIds?: string[];
      };
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      if (json.viewerEmails) {
        setDrawerViewerDraft(json.viewerEmails.join("\n"));
      }
      if (json.viewerChapterIds) {
        setDrawerViewerChapterIds(json.viewerChapterIds);
      }
    } catch (e) {
      setDrawerViewersError(
        e instanceof Error ? e.message : "Save failed.",
      );
    } finally {
      setDrawerViewersBusy(false);
    }
  }, [activeRow, authHeaders, drawerViewerChapterIds, drawerViewerDraft]);

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
    resetEditUploadState();
    setEditIntakeRow(row);
    setEditForm({
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
      if (jdStartDateRange) {
        const d = r.start_date;
        if (!d) return false;
        const from = jdStartDateRange.start.toString();
        const to = jdStartDateRange.end.toString();
        if (d < from || d > to) return false;
      }
      return true;
    });
  }, [
    rows,
    jdListSearch,
    jdListStatusKey,
    jdStartDateRange,
  ]);

  useEffect(() => {
    setPage(1);
  }, [jdListSearch, jdListStatusKey, jdStartDateRange]);

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
            Jobs list
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Manage and monitor recruitment job descriptions across the organisation.
          </p>
        </div>
        {canManageJds ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              className="bg-gradient-to-br from-[#002542] to-[#1b3b5a] shadow-sm"
              onPress={() => {
                setForm(DEFAULT_FORM);
                jdModal.open();
              }}
            >
              <span className="text-lg leading-none">+</span>
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
        ) : null}
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
                <SectionLabel>Role details</SectionLabel>
                <div className="grid gap-4 md:grid-cols-2">
                  <TextField
                    value={form.position}
                    onChange={(v) => setField("position", v)}
                    isRequired
                  >
                    <Label>Job title</Label>
                    <Input placeholder="e.g. AI Engineer (Mid-level)" />
                  </TextField>

                  <TextField
                    value={form.department}
                    onChange={(v) => setField("department", v)}
                  >
                    <Label>Department / team</Label>
                    <Input placeholder="e.g. Solutions Team" />
                  </TextField>
                </div>
              </div>

              <div className="space-y-3">
                <SectionLabel>Recruiter access</SectionLabel>
                <p className="text-xs text-muted">
                  Optional. Add individual accounts by email and/or grant every
                  member of a chapter. Non-HR recruiters only see jobs they are
                  given here.
                </p>
                <JdViewerEmailSearch
                  getHeaders={authHeaders}
                  onPickEmail={(em) =>
                    setCreateViewerEmailsText((d) =>
                      appendEmailToViewerDraft(d, em),
                    )
                  }
                />
                <TextField
                  value={createViewerEmailsText}
                  onChange={setCreateViewerEmailsText}
                >
                  <Label className="text-xs text-muted">Viewer emails</Label>
                  <TextArea
                    placeholder={
                      "chapter-lead@company.com\nrecruiter@company.com"
                    }
                    className="min-h-[5rem] font-mono text-xs"
                  />
                </TextField>
                <div className="space-y-2">
                  <Label className="text-xs text-muted">
                    Viewer chapters (whole chapter)
                  </Label>
                  <ChapterPicker
                    chapters={chapters}
                    selectedIds={createViewerChapterIds}
                    onChange={setCreateViewerChapterIds}
                  />
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
                Hiring details
                {editIntakeRow ? (
                  <span className="ml-2 text-base font-normal text-muted">
                    — {editIntakeRow.position}
                  </span>
                ) : null}
              </Modal.Heading>
            </Modal.Header>

            <Modal.Body className="max-h-[76vh] space-y-6 overflow-y-auto px-6 py-6">
              <input
                ref={editJdFileInputRef}
                type="file"
                className="sr-only"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                aria-hidden
                tabIndex={-1}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const f = e.target.files?.[0];
                  if (f) void ingestJdFileForEdit(f);
                }}
              />

              {/* Attach JD (optional) — same flow as Create; fills overlapping intake fields */}
              <Card
                variant="secondary"
                className={
                  editDragOver
                    ? "ring-2 ring-accent ring-offset-2 ring-offset-background"
                    : undefined
                }
              >
                <Card.Content
                  className="items-center gap-3 py-6 text-center"
                  onDragOver={(e: DragEvent) => {
                    if (
                      editUploadPhase === "uploading" ||
                      editUploadPhase === "extracting"
                    )
                      return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    setEditDragOver(true);
                  }}
                  onDragLeave={() => setEditDragOver(false)}
                  onDrop={(e: DragEvent) => {
                    if (
                      editUploadPhase === "uploading" ||
                      editUploadPhase === "extracting"
                    )
                      return;
                    e.preventDefault();
                    setEditDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) void ingestJdFileForEdit(f);
                  }}
                >
                  <div className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
                    {editUploadPhase === "done" ? (
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
                  {editUploadPhase === "uploading" && (
                    <p className="text-xs text-accent">Uploading…</p>
                  )}
                  {editUploadPhase === "extracting" && (
                    <p className="text-xs text-accent">
                      Reading document with AI…
                    </p>
                  )}
                  {editUploadPhase === "done" && editSelectedFileName && (
                    <p className="text-xs font-medium text-success">
                      ✓ {editSelectedFileName}
                    </p>
                  )}
                  {(editUploadPhase === "done" || editUploadPhase === "error") &&
                    editUploadError && (
                      <p className="text-xs text-danger">{editUploadError}</p>
                    )}
                  <Button
                    variant="secondary"
                    size="sm"
                    isDisabled={
                      editUploadPhase === "uploading" ||
                      editUploadPhase === "extracting"
                    }
                    onPress={() => editJdFileInputRef.current?.click()}
                  >
                    Browse Files
                  </Button>
                </Card.Content>
              </Card>

              {/* 1 – Role & organisation */}
              <div className="space-y-4">
                <SectionLabel>Role &amp; organisation</SectionLabel>
                <div className="grid gap-4 md:grid-cols-3">
                  <TextField
                    value={editForm.level}
                    onChange={(v) => setEditField("level", v)}
                  >
                    <Label>Level</Label>
                    <Input placeholder="e.g. Junior, Mid, Senior, Lead" />
                  </TextField>

                  <TextField
                    value={editForm.headcount}
                    onChange={(v) => setEditField("headcount", v)}
                  >
                    <Label>Headcount</Label>
                    <Input type="number" min="1" placeholder="e.g. 2" />
                  </TextField>

                  <Select
                    value={editForm.hire_type || undefined}
                    onChange={(key) => {
                      if (typeof key === "string") setEditField("hire_type", key);
                    }}
                  >
                    <Label>New hire or replacement</Label>
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
                  <Label>Reports to</Label>
                  <Input placeholder="e.g. VP of Engineering, CTO, Project Manager…" />
                </TextField>
              </div>

              {/* 2 – Project & team */}
              <div className="space-y-4">
                <SectionLabel>Project &amp; team</SectionLabel>

                <TextField
                  value={editForm.project_info}
                  onChange={(v) => setEditField("project_info", v)}
                >
                  <Label>Project overview</Label>
                  <TextArea
                    className="min-h-[7rem]"
                    placeholder="What is the project or product? Current phase, pace, expectations on workload or overtime…"
                  />
                </TextField>

                <TextField
                  value={editForm.duties_and_responsibilities}
                  onChange={(v) => setEditField("duties_and_responsibilities", v)}
                >
                  <Label>Role responsibilities in the project</Label>
                  <TextArea
                    className="min-h-[6rem]"
                    placeholder="What will the hire own or deliver day to day within the project?"
                  />
                </TextField>

                <TextField
                  value={editForm.team_size}
                  onChange={(v) => setEditField("team_size", v)}
                >
                  <Label>Team size</Label>
                  <TextArea
                    className="min-h-[4rem]"
                    placeholder="How many people and which roles? e.g. 6 people (1 BA, 2 FE, 2 BE, 1 QA)"
                  />
                </TextField>
              </div>

              {/* 3 – Candidate requirements */}
              <div className="space-y-4">
                <SectionLabel>Candidate requirements</SectionLabel>

                <TextField
                  value={editForm.experience_requirements_must_have}
                  onChange={(v) => setEditField("experience_requirements_must_have", v)}
                >
                  <Label>Must have</Label>
                  <TextArea
                    className="min-h-[7rem]"
                    placeholder="Non‑negotiable skills, experience, domain knowledge, soft skills…"
                  />
                </TextField>

                <TextField
                  value={editForm.experience_requirements_nice_to_have}
                  onChange={(v) => setEditField("experience_requirements_nice_to_have", v)}
                >
                  <Label>Nice to have</Label>
                  <TextArea
                    className="min-h-[5rem]"
                    placeholder="Optional strengths that would be a plus…"
                  />
                </TextField>

                <TextField
                  value={editForm.language_requirements}
                  onChange={(v) => setEditField("language_requirements", v)}
                >
                  <Label>Languages</Label>
                  <TextArea
                    className="min-h-[4rem]"
                    placeholder="Which languages, level, certifications? e.g. English for technical docs, TOEIC 600+"
                  />
                </TextField>

                <TextField
                  value={editForm.other_requirements}
                  onChange={(v) => setEditField("other_requirements", v)}
                >
                  <Label>Other requirements</Label>
                  <TextArea
                    className="min-h-[4rem]"
                    placeholder="Any other notes (only where appropriate and lawful)."
                  />
                </TextField>
              </div>

              {/* 4 – Growth & compensation */}
              <div className="space-y-4">
                <SectionLabel>Growth &amp; compensation</SectionLabel>

                <TextField
                  value={editForm.career_development}
                  onChange={(v) => setEditField("career_development", v)}
                >
                  <Label>Growth &amp; career path</Label>
                  <TextArea
                    className="min-h-[5rem]"
                    placeholder="Development path, promotion outlook, learning opportunities…"
                  />
                </TextField>

                <div className="grid gap-4 md:grid-cols-2">
                  <TextField
                    value={editForm.salary_range}
                    onChange={(v) => setEditField("salary_range", v)}
                  >
                    <Label>Salary range (gross)</Label>
                    <Input placeholder="e.g. 20,000,000 – 35,000,000 VND" />
                  </TextField>

                  <TextField
                    value={editForm.project_allowances}
                    onChange={(v) => setEditField("project_allowances", v)}
                  >
                    <Label>Allowances / project bonuses</Label>
                    <Input placeholder="e.g. lunch allowance, quarterly KPI bonus…" />
                  </TextField>
                </div>
              </div>

              {/* 5 – Process & timeline */}
              <div className="space-y-4">
                <SectionLabel>Process &amp; timeline</SectionLabel>

                <TextField
                  value={editForm.interview_process}
                  onChange={(v) => setEditField("interview_process", v)}
                >
                  <Label>Interview process</Label>
                  <TextArea
                    className="min-h-[6rem]"
                    placeholder={
                      "How many stages? Who joins each stage? Any tests?\ne.g. Stage 1: HR screen / Stage 2: Technical + CTO / Stage 3: Offer"
                    }
                  />
                </TextField>

                <TextField
                  value={editForm.hiring_deadline}
                  onChange={(v) => setEditField("hiring_deadline", v)}
                >
                  <Label>Hiring deadline</Label>
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
                isDisabled={
                  editSubmitting ||
                  editUploadPhase === "uploading" ||
                  editUploadPhase === "extracting"
                }
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                isDisabled={
                  editSubmitting ||
                  editUploadPhase === "uploading" ||
                  editUploadPhase === "extracting"
                }
                onPress={() => void handleEditSave()}
              >
                {editSubmitting ? "Saving…" : "Save details"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* ── Filters ── */}
      <Card variant="secondary">
        <Card.Content className="flex flex-col gap-4 p-4 sm:p-5">
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
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1 min-w-[min(100%,280px)] max-w-md flex-1">
                <Label className="text-xs text-muted" id="jd-start-range-label">
                  Start date range
                </Label>
                <DateRangePicker
                  aria-labelledby="jd-start-range-label"
                  value={jdStartDateRange}
                  onChange={setJdStartDateRange}
                  className="w-full"
                >
                  <DateField.Group fullWidth variant="secondary">
                    <DateField.InputContainer className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none]">
                      <DateField.Input slot="start">
                        {(segment) => <DateField.Segment segment={segment} />}
                      </DateField.Input>
                      <DateRangePicker.RangeSeparator className="text-muted shrink-0 px-0.5" />
                      <DateField.Input slot="end">
                        {(segment) => <DateField.Segment segment={segment} />}
                      </DateField.Input>
                    </DateField.InputContainer>
                    <DateField.Suffix>
                      <DateRangePicker.Trigger className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted outline-none hover:bg-muted pressed:bg-muted">
                        <DateRangePicker.TriggerIndicator />
                      </DateRangePicker.Trigger>
                    </DateField.Suffix>
                  </DateField.Group>
                  <DateRangePicker.Popover>
                    <Dialog className="outline-none">
                      <RangeCalendar>
                        <RangeCalendar.Header>
                          <RangeCalendar.NavButton slot="previous" />
                          <RangeCalendar.Heading />
                          <RangeCalendar.NavButton slot="next" />
                        </RangeCalendar.Header>
                        <RangeCalendar.Grid weekdayStyle="short">
                          <RangeCalendar.GridHeader>
                            {(day) => (
                              <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>
                            )}
                          </RangeCalendar.GridHeader>
                          <RangeCalendar.GridBody>
                            {(date) => (
                              <RangeCalendar.Cell date={date}>
                                {({ formattedDate }) => (
                                  <>
                                    <RangeCalendar.CellIndicator />
                                    <span className="relative z-[1]">{formattedDate}</span>
                                  </>
                                )}
                              </RangeCalendar.Cell>
                            )}
                          </RangeCalendar.GridBody>
                        </RangeCalendar.Grid>
                      </RangeCalendar>
                    </Dialog>
                  </DateRangePicker.Popover>
                </DateRangePicker>
              </div>
              {jdStartDateRange ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onPress={() => setJdStartDateRange(null)}
                >
                  Clear dates
                </Button>
              ) : null}
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
                aria-label="Jobs list"
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
                        No jobs found.
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
                            isDisabled={
                              !canManageJds || statusUpdatingId === row.id
                            }
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
                            <Tooltip delay={0}>
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
                              <Tooltip.Content placement="top" showArrow>
                                <Tooltip.Arrow />
                                <p>View detail</p>
                              </Tooltip.Content>
                            </Tooltip>
                            {canManageJds ? (
                              <>
                                <Tooltip delay={0}>
                                  <Button
                                    aria-label={`Hiring details: ${row.position}`}
                                    variant="ghost"
                                    size="sm"
                                    className="min-w-0 px-2"
                                    onPress={() => openEdit(row)}
                                  >
                                    <RecruitmentInfoIcon className="size-4" />
                                  </Button>
                                  <Tooltip.Content placement="top" showArrow>
                                    <Tooltip.Arrow />
                                    <p>Hiring details</p>
                                  </Tooltip.Content>
                                </Tooltip>
                                <Tooltip delay={0}>
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
                                  <Tooltip.Content placement="top" showArrow>
                                    <Tooltip.Arrow />
                                    <p>Delete</p>
                                  </Tooltip.Content>
                                </Tooltip>
                              </>
                            ) : null}
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
                      <h3 className="text-sm font-semibold text-foreground">Role &amp; organisation</h3>
                      <dl className="space-y-1 text-sm text-muted">
                        {activeRow.level && <div><dt className="inline font-medium text-foreground">Level: </dt><dd className="inline">{activeRow.level}</dd></div>}
                        {activeRow.headcount != null && <div><dt className="inline font-medium text-foreground">Headcount: </dt><dd className="inline">{activeRow.headcount}</dd></div>}
                        {activeRow.hire_type && <div><dt className="inline font-medium text-foreground">Hire type: </dt><dd className="inline">{formatHireTypeDisplay(activeRow.hire_type)}</dd></div>}
                        {activeRow.reporting && <div><dt className="inline font-medium text-foreground">Reports to: </dt><dd className="inline">{activeRow.reporting}</dd></div>}
                      </dl>
                    </section>
                  )}

                  {(activeRow.project_info || activeRow.duties_and_responsibilities || activeRow.team_size) && (
                    <>
                      <Separator />
                      <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground">Project &amp; team</h3>
                        {activeRow.project_info && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Project overview</p>
                            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.project_info}</p>
                          </div>
                        )}
                        {activeRow.duties_and_responsibilities && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Responsibilities</p>
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
                        <h3 className="text-sm font-semibold text-foreground">Candidate requirements</h3>
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
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Languages</p>
                            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.language_requirements}</p>
                          </div>
                        )}
                        {activeRow.other_requirements && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Other requirements</p>
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
                        <h3 className="text-sm font-semibold text-foreground">Growth &amp; compensation</h3>
                        {activeRow.career_development && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Growth &amp; path</p>
                            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.career_development}</p>
                          </div>
                        )}
                        {activeRow.salary_range && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Salary (gross)</p>
                            <p className="mt-1 text-sm text-muted">{activeRow.salary_range}</p>
                          </div>
                        )}
                        {activeRow.project_allowances && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Allowances / bonuses</p>
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
                        <h3 className="text-sm font-semibold text-foreground">Process &amp; timeline</h3>
                        {activeRow.interview_process && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Interview process</p>
                            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.interview_process}</p>
                          </div>
                        )}
                        {activeRow.hiring_deadline && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Hiring deadline</p>
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

                  {canManageJds ? (
                    <>
                      <Separator />
                      <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground">
                          Recruiter access
                        </h3>
                        <p className="text-xs text-muted">
                          Emails must match existing accounts. You can also add
                          whole chapters. HR always has full access.
                        </p>
                        {drawerViewersLoading ? (
                          <p className="text-xs text-muted">Loading viewers…</p>
                        ) : (
                          <>
                            <JdViewerEmailSearch
                              getHeaders={authHeaders}
                              onPickEmail={(em) =>
                                setDrawerViewerDraft((d) =>
                                  appendEmailToViewerDraft(d, em),
                                )
                              }
                            />
                            <TextField
                              value={drawerViewerDraft}
                              onChange={setDrawerViewerDraft}
                            >
                              <Label className="text-xs text-muted">
                                Viewer emails
                              </Label>
                              <TextArea
                                placeholder={
                                  "recruiter@company.com\nlead@company.com"
                                }
                                className="min-h-[6rem] font-mono text-xs"
                              />
                            </TextField>
                            <div className="space-y-2">
                              <Label className="text-xs text-muted">
                                Viewer chapters (whole chapter)
                              </Label>
                              <ChapterPicker
                                chapters={chapters}
                                selectedIds={drawerViewerChapterIds}
                                onChange={setDrawerViewerChapterIds}
                              />
                            </div>
                          </>
                        )}
                        {drawerViewersError ? (
                          <p className="text-sm text-danger" role="alert">
                            {drawerViewersError}
                          </p>
                        ) : null}
                        <Button
                          size="sm"
                          variant="secondary"
                          isDisabled={
                            drawerViewersBusy || drawerViewersLoading
                          }
                          onPress={() => void saveDrawerViewers()}
                        >
                          {drawerViewersBusy ? "Saving…" : "Save viewers"}
                        </Button>
                      </section>
                    </>
                  ) : null}

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
                  {canManageJds ? (
                    <Button variant="primary" onPress={() => openEdit(activeRow)}>
                      Hiring details
                    </Button>
                  ) : null}
                </Drawer.Footer>
              </>
            ) : null}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </div>
  );
}
