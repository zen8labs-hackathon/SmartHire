"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import {
  Avatar,
  Button,
  Card,
  Chip,
  DateField,
  DateRangePicker,
  Input,
  Label,
  ListBox,
  Modal,
  Pagination,
  RangeCalendar,
  SearchField,
  Select,
  Table,
  useOverlayState,
} from "@heroui/react";
import { today, getLocalTimeZone, type CalendarDate } from "@internationalized/date";
import { Dialog } from "react-aria-components";
import type { RangeValue } from "react-aria-components";

import { PipelineStatusLabel } from "@/components/admin/candidates/pipeline-status-label";
import {
  candidateDisplayInitials,
  jdMatchChipColor,
} from "@/lib/candidates/candidate-display";
import { isPipelineStatusKey } from "@/lib/candidates/pipeline-status-styles";
import {
  type CandidateDbRow,
  candidateDbRowToTableRow,
} from "@/lib/candidates/db-row";
import { displayFromParsedPayload } from "@/lib/candidates/parsed-contact";
import {
  allowedTargetsFromStatus,
  isPipelineTransitionAllowed,
} from "@/lib/candidates/pipeline-allowed-transitions";
import {
  PIPELINE_STATUS_DISPLAY_ORDER,
  candidateStatusMajorPhase,
  candidateStatusUiLabel,
  isEligibleForBulkMoveToInterview,
} from "@/lib/candidates/pipeline-phase";
import type { CandidateRow, CandidateStatus } from "@/lib/candidates/types";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";


const MONTH_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Jan" }, { value: 2, label: "Feb" }, { value: 3, label: "Mar" },
  { value: 4, label: "Apr" }, { value: 5, label: "May" }, { value: 6, label: "Jun" },
  { value: 7, label: "Jul" }, { value: 8, label: "Aug" }, { value: 9, label: "Sep" },
  { value: 10, label: "Oct" }, { value: 11, label: "Nov" }, { value: 12, label: "Dec" },
];
const YEAR_OPTIONS = Array.from({ length: 2030 - 1990 + 1 }, (_, i) => 1990 + i);

const FILTER_STATUS_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "all", label: "All statuses" },
  ...PIPELINE_STATUS_DISPLAY_ORDER.map((sid) => ({
    id: sid,
    label: candidateStatusUiLabel(sid),
  })),
];

type Props = {
  jobDescriptionId: number;
  jobId: string;
  dbRows: CandidateDbRow[];
  loadState: "idle" | "loading" | "error" | "ok";
  onRefetch: (silent?: boolean) => void;
  /** HR may change pipeline status and schedule; chapter recruiters are view-only here. */
  canEditPipeline?: boolean;
};

function tableStatusRow(r: CandidateDbRow): CandidateRow {
  return candidateDbRowToTableRow(r);
}

function formatSchedule(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(t));
}

function uploadSortKey(r: CandidateDbRow): number {
  const raw = r.cv_uploaded_at ?? r.created_at;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
}

function localDatetimeToIso(local: string): string | null {
  if (!local?.trim()) return null;
  const ms = new Date(local).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function isoToDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function cvDay(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function rowMatchesUploadDateRange(
  r: CandidateDbRow,
  range: RangeValue<CalendarDate> | null,
): boolean {
  if (!range) return true;
  const day = cvDay(r.cv_uploaded_at ?? r.created_at);
  if (!day) return false;
  if (day < range.start.toString()) return false;
  if (day > range.end.toString()) return false;
  return true;
}

function rowMatchesSearch(r: CandidateDbRow, q: string): boolean {
  if (!q.trim()) return true;
  const lower = q.trim().toLowerCase();
  const c = displayFromParsedPayload(r.parsed_payload);
  return (
    (r.name?.toLowerCase().includes(lower) ?? false) ||
    (r.role?.toLowerCase().includes(lower) ?? false) ||
    (r.skills?.some((s) => s.toLowerCase().includes(lower)) ?? false) ||
    (c.email?.toLowerCase().includes(lower) ?? false) ||
    (c.phone?.toLowerCase().includes(lower) ?? false)
  );
}

export function JdAppliedCandidatesPipeline({
  jobDescriptionId,
  jobId,
  dbRows,
  loadState,
  onRefetch,
  canEditPipeline = true,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [rowUpdating, setRowUpdating] = useState<string | null>(null);

  const [rowPendingDelete, setRowPendingDelete] =
    useState<CandidateDbRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        setRowPendingDelete(null);
        setDeleteError(null);
      }
    },
  });

  const handleDeleteCandidate = useCallback(async () => {
    if (!rowPendingDelete) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const h = await getSessionAuthorizationHeaders(supabase);
      const res = await fetch(`/api/admin/candidates/${rowPendingDelete.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          ...(h.Authorization ? { Authorization: h.Authorization } : {}),
        },
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Failed to delete candidate.");
      }
      deleteModal.close();
      onRefetch();
    } catch (e) {
      setDeleteError(
        e instanceof Error ? e.message : "Failed to delete candidate.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }, [rowPendingDelete, deleteModal, onRefetch, supabase]);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [uploadDateRange, setUploadDateRange] = useState<RangeValue<CalendarDate> | null>(null);
  const [calendarFocusedDate, setCalendarFocusedDate] = useState<CalendarDate>(() =>
    today(getLocalTimeZone()),
  );

  const [page, setPage] = useState(1);

  const [onboardingDrafts, setOnboardingDrafts] = useState<
    Record<string, string>
  >({});

  const [interviewDrafts, setInterviewDrafts] = useState<
    Record<string, string>
  >({});

  const offerModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        setOnboardingDrafts({});
        setPipelineError(null);
      }
    },
  });

  const ROWS_PER_PAGE = 50;

  useEffect(() => {
    setSelected(new Set());
  }, [dbRows]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, uploadDateRange]);

  useEffect(() => {
    if (uploadDateRange?.start) {
      setCalendarFocusedDate(uploadDateRange.start);
    }
  }, [uploadDateRange]);

  const filteredRows = useMemo(() => {
    let rows = [...dbRows];
    rows.sort((a, b) => uploadSortKey(b) - uploadSortKey(a));

    const q = query.trim();
    const sf = statusFilter;
    rows = rows.filter((r) => rowMatchesSearch(r, q));
    rows = rows.filter((r) => rowMatchesUploadDateRange(r, uploadDateRange));
    if (sf !== "all") {
      rows = rows.filter((r) => r.status === sf);
    }
    return rows;
  }, [dbRows, query, statusFilter, uploadDateRange]);

  const statusCounts = useMemo(() => {
    let newPool = 0;
    let interviewing = 0;
    let offer = 0;
    let matched = 0;
    for (const r of filteredRows) {
      const st = tableStatusRow(r).status;
      const phase = candidateStatusMajorPhase(st);
      if (phase === "cv_scan") newPool += 1;
      else if (phase === "interview") interviewing += 1;
      else if (phase === "offer") {
        if (st === "Offer") offer += 1;
        else if (st === "Matched") matched += 1;
      }
    }
    return { newPool, interviewing, offer, matched };
  }, [filteredRows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = useMemo(
    () => filteredRows.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE),
    [filteredRows, safePage],
  );
  const startIdx = filteredRows.length === 0 ? 0 : (safePage - 1) * ROWS_PER_PAGE + 1;
  const endIdx = startIdx === 0 ? 0 : startIdx - 1 + paginatedRows.length;

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const postPipeline = useCallback(
    async (updates: unknown[]) => {
      const h = await getSessionAuthorizationHeaders(supabase);
      const res = await fetch("/api/admin/candidates/pipeline", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(h.Authorization ? { Authorization: h.Authorization } : {}),
        },
        body: JSON.stringify({ jobDescriptionId, updates }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Update failed.");
    },
    [jobDescriptionId, supabase],
  );

  const selectedRows = useMemo(() => {
    return [...selected]
      .map((id) => dbRows.find((r) => r.id === id))
      .filter(Boolean) as CandidateDbRow[];
  }, [selected, dbRows]);

  const bulkInterviewEligible = useMemo(
    () =>
      selectedRows.length > 0 &&
      selectedRows.every((r) => isEligibleForBulkMoveToInterview(r.status)),
    [selectedRows],
  );

  const bulkOfferEligible = useMemo(
    () =>
      selectedRows.length > 0 &&
      selectedRows.every((r) => r.status === "InterviewPassed"),
    [selectedRows],
  );

  const bulkFailEligible = useMemo(
    () =>
      selectedRows.length > 0 &&
      (selectedRows.every((r) =>
        isPipelineTransitionAllowed(tableStatusRow(r).status, "CvFailed"),
      ) ||
        selectedRows.every((r) =>
          isPipelineTransitionAllowed(
            tableStatusRow(r).status,
            "InterviewFailed",
          ),
        )),
    [selectedRows],
  );

  const openOfferModal = useCallback(() => {
    const ids = selectedRows
      .filter((r) => r.status === "InterviewPassed")
      .map((r) => r.id);
    if (ids.length === 0) return;
    const drafts: Record<string, string> = {};
    for (const id of ids) drafts[id] = "";
    setOnboardingDrafts(drafts);
    offerModal.open();
  }, [selectedRows, offerModal]);

  const confirmOffer = useCallback(async () => {
    const entries = Object.entries(onboardingDrafts);
    for (const [, v] of entries) {
      if (!v?.trim()) {
        setPipelineError(
          "Please set onboarding date and time for every candidate.",
        );
        return;
      }
    }
    const updates: { id: string; status: "Offer"; onboarding_at: string }[] =
      [];
    for (const [id, local] of entries) {
      const iso = localDatetimeToIso(local);
      if (!iso) {
        setPipelineError("One or more onboarding times are invalid.");
        return;
      }
      updates.push({ id, status: "Offer", onboarding_at: iso });
    }
    setPipelineError(null);
    setPipelineBusy(true);
    try {
      await postPipeline(updates);
      offerModal.close();
      onRefetch(true);
    } catch (e) {
      setPipelineError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setPipelineBusy(false);
    }
  }, [onboardingDrafts, offerModal, onRefetch, postPipeline]);

  const moveSelectedToInterview = useCallback(async () => {
    if (!bulkInterviewEligible) return;
    setPipelineBusy(true);
    setPipelineError(null);
    try {
      await postPipeline(
        selectedRows.map((r) => ({ id: r.id, status: "Interview" as const })),
      );
      onRefetch(true);
    } catch (e) {
      setPipelineError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setPipelineBusy(false);
    }
  }, [bulkInterviewEligible, onRefetch, postPipeline, selectedRows]);

  const markSelectedFailed = useCallback(async () => {
    if (!bulkFailEligible) return;
    const allCvFail =
      selectedRows.length > 0 &&
      selectedRows.every((r) =>
        isPipelineTransitionAllowed(tableStatusRow(r).status, "CvFailed"),
      );
    setPipelineBusy(true);
    setPipelineError(null);
    try {
      await postPipeline(
        selectedRows.map((r) => ({
          id: r.id,
          status: allCvFail
            ? ("CvFailed" as const)
            : ("InterviewFailed" as const),
        })),
      );
      onRefetch(true);
    } catch (e) {
      setPipelineError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setPipelineBusy(false);
    }
  }, [bulkFailEligible, onRefetch, postPipeline, selectedRows]);

  const onStatusChange = useCallback(
    async (id: string, next: CandidateStatus) => {
      setRowUpdating(id);
      setPipelineError(null);
      try {
        await postPipeline([{ id, status: next }]);
        onRefetch(true);
      } catch (e) {
        setPipelineError(e instanceof Error ? e.message : "Update failed.");
      } finally {
        setRowUpdating(null);
      }
    },
    [onRefetch, postPipeline],
  );

  const patchTimeline = useCallback(
    async (
      id: string,
      body: { interview_at?: string | null; onboarding_at?: string | null },
    ) => {
      const h = await getSessionAuthorizationHeaders(supabase);
      const res = await fetch(`/api/admin/candidates/${id}/timeline`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(h.Authorization ? { Authorization: h.Authorization } : {}),
        },
        body: JSON.stringify({ jobDescriptionId, ...body }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Update failed.");
    },
    [jobDescriptionId, supabase],
  );

  const saveInterviewTime = useCallback(
    async (id: string) => {
      const local = interviewDrafts[id] ?? "";
      setPipelineError(null);
      try {
        const iso = local.trim() ? localDatetimeToIso(local) : null;
        await patchTimeline(id, { interview_at: iso });
        onRefetch(true);
      } catch (e) {
        setPipelineError(e instanceof Error ? e.message : "Update failed.");
      }
    },
    [interviewDrafts, onRefetch, patchTimeline],
  );

  const saveOnboardingTime = useCallback(
    async (id: string) => {
      const local = interviewDrafts[`ob-${id}`] ?? "";
      setPipelineError(null);
      try {
        const iso = local.trim() ? localDatetimeToIso(local) : null;
        await patchTimeline(id, { onboarding_at: iso });
        onRefetch(true);
      } catch (e) {
        setPipelineError(e instanceof Error ? e.message : "Update failed.");
      }
    },
    [interviewDrafts, onRefetch, patchTimeline],
  );

  useEffect(() => {
    setInterviewDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const r of dbRows) {
        if (
          (r.status === "Interview" || r.status === "InterviewPassed") &&
          next[r.id] === undefined
        ) {
          next[r.id] = isoToDatetimeLocalValue(r.interview_at);
          changed = true;
        }
        const obKey = `ob-${r.id}`;
        if (r.status === "Offer" && next[obKey] === undefined) {
          next[obKey] = isoToDatetimeLocalValue(r.onboarding_at);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [dbRows]);

  if (loadState === "loading") {
    return <p className="mt-3 text-sm text-muted">Loading…</p>;
  }
  if (loadState === "error") {
    return (
      <div className="mt-3 flex flex-col items-start gap-2">
        <p className="text-sm text-danger">
          Could not load candidates. Try again later.
        </p>
        <Button variant="secondary" size="sm" onPress={() => onRefetch()}>
          Retry load
        </Button>
      </div>
    );
  }
  if (loadState === "ok" && dbRows.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted">
        No candidates yet. Link a job opening to this JD and add applicants from
        the Candidates page or the JD pipeline.
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-4">
      {pipelineError ? (
        <p className="text-sm text-danger">{pipelineError}</p>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl border border-divider bg-surface-secondary/30 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <SearchField
            value={query}
            onChange={setQuery}
            className="min-w-[220px] flex-1"
          >
            <SearchField.Group className="w-full">
              <SearchField.SearchIcon />
              <SearchField.Input
                placeholder="Search by name, position, or skill…"
                className="w-full min-w-0"
              />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <Select
            value={statusFilter}
            onChange={(k) => {
              if (typeof k === "string") {
                setStatusFilter(k);
                if (document.activeElement instanceof HTMLElement) {
                  document.activeElement.blur();
                }
              }
            }}
            className="min-w-[180px]"
          >
            <Label className="sr-only">Status</Label>
            <Select.Trigger className="min-h-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
              {isPipelineStatusKey(statusFilter) ? (
                <PipelineStatusLabel
                  status={statusFilter}
                  variant="inline"
                  uppercase={false}
                />
              ) : (
                <Select.Value />
              )}
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {FILTER_STATUS_OPTIONS.map((opt) => (
                  <ListBox.Item key={opt.id} id={opt.id} textValue={opt.label}>
                    {opt.id === "all" ? (
                      opt.label
                    ) : (
                      <PipelineStatusLabel
                        status={opt.id as CandidateStatus}
                        variant="inline"
                        uppercase={false}
                      />
                    )}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <div className="flex shrink-0 flex-col gap-1">
            <Label className="block text-left text-xs font-medium text-muted">
              Filter by upload date
            </Label>
            <div className="flex items-center gap-2">
              <DateRangePicker
                value={uploadDateRange as any}
                onChange={(next) => setUploadDateRange(next as any)}
                className="w-full min-w-[16rem]"
              >
                <DateField.Group
                  fullWidth
                  variant="primary"
                  className="border-neutral-200 bg-white text-neutral-950 shadow-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
                >
                  <DateField.InputContainer className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none]">
                    <DateField.Input slot="start">
                      {(segment) => <DateField.Segment segment={segment} />}
                    </DateField.Input>
                    <DateRangePicker.RangeSeparator className="shrink-0 px-0.5 text-neutral-500 dark:text-neutral-400" />
                    <DateField.Input slot="end">
                      {(segment) => <DateField.Segment segment={segment} />}
                    </DateField.Input>
                  </DateField.InputContainer>
                  <DateField.Suffix>
                    <DateRangePicker.Trigger className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-neutral-700 outline-none hover:bg-neutral-100 pressed:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10 dark:pressed:bg-white/10">
                      <DateRangePicker.TriggerIndicator />
                    </DateRangePicker.Trigger>
                  </DateField.Suffix>
                </DateField.Group>
                <DateRangePicker.Popover>
                  <Dialog className="outline-none">
                    <RangeCalendar
                      focusedValue={calendarFocusedDate as any}
                      onFocusChange={(next) => setCalendarFocusedDate(next as any)}
                    >
                      <RangeCalendar.Header className="flex items-center gap-2">
                        <RangeCalendar.NavButton slot="previous" />
                        <div className="flex flex-1 items-center gap-2">
                          <Label className="sr-only" htmlFor="jd-cal-month">Month</Label>
                          <select
                            id="jd-cal-month"
                            value={calendarFocusedDate.month}
                            onChange={(e) =>
                              setCalendarFocusedDate((p) => p.set({ month: Number(e.target.value), day: 1 }))
                            }
                            className="h-8 rounded-md border border-neutral-300 bg-background px-2 text-sm outline-none dark:border-neutral-700"
                          >
                            {MONTH_OPTIONS.map((m) => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                          <Label className="sr-only" htmlFor="jd-cal-year">Year</Label>
                          <select
                            id="jd-cal-year"
                            value={calendarFocusedDate.year}
                            onChange={(e) =>
                              setCalendarFocusedDate((p) => p.set({ year: Number(e.target.value), day: 1 }))
                            }
                            className="h-8 rounded-md border border-neutral-300 bg-background px-2 text-sm outline-none dark:border-neutral-700"
                          >
                            {YEAR_OPTIONS.map((y) => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>
                        </div>
                        <RangeCalendar.NavButton slot="next" />
                      </RangeCalendar.Header>
                      <RangeCalendar.Grid weekdayStyle="short">
                        <RangeCalendar.GridHeader>
                          {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
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
              {uploadDateRange ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-w-0 px-2 font-semibold text-muted"
                  aria-label="Clear date filter"
                  onPress={() => setUploadDateRange(null)}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {selected.size > 0 ? (
          <div className="flex flex-wrap gap-2 border-t border-divider pt-3">
            <span className="self-center text-xs text-muted">
              {selected.size} selected
            </span>
            <Button
              size="sm"
              variant="primary"
              className="bg-gradient-to-br from-[#002542] to-[#1b3b5a]"
              isDisabled={
                !canEditPipeline || pipelineBusy || !bulkInterviewEligible
              }
              onPress={() => void moveSelectedToInterview()}
            >
              Move to interview
            </Button>
            <Button
              size="sm"
              variant="primary"
              className="bg-gradient-to-br from-[#002542] to-[#1b3b5a]"
              isDisabled={
                !canEditPipeline || pipelineBusy || !bulkOfferEligible
              }
              onPress={openOfferModal}
            >
              Move to offer…
            </Button>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={!canEditPipeline || pipelineBusy || !bulkFailEligible}
              onPress={() => void markSelectedFailed()}
            >
              Mark failed
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card variant="secondary">
          <Card.Header className="gap-0.5">
            <Card.Title className="text-2xl font-semibold tabular-nums">
              {filteredRows.length}
            </Card.Title>
            <Card.Description>Total CV</Card.Description>
          </Card.Header>
        </Card>
        <Card variant="secondary">
          <Card.Header className="gap-0.5">
            <Card.Title className="text-2xl font-semibold tabular-nums">
              {statusCounts.newPool}
            </Card.Title>
            <Card.Description>CV Scan</Card.Description>
          </Card.Header>
        </Card>
        <Card variant="secondary">
          <Card.Header className="gap-0.5">
            <Card.Title className="text-2xl font-semibold tabular-nums">
              {statusCounts.interviewing}
            </Card.Title>
            <Card.Description>Interview</Card.Description>
          </Card.Header>
        </Card>
        <Card variant="secondary">
          <Card.Header className="gap-0.5">
            <Card.Title className="text-2xl font-semibold tabular-nums">
              {statusCounts.offer}
            </Card.Title>
            <Card.Description>Offer</Card.Description>
          </Card.Header>
        </Card>
        <Card variant="secondary">
          <Card.Header className="gap-0.5">
            <Card.Title className="text-2xl font-semibold tabular-nums">
              {statusCounts.matched}
            </Card.Title>
            <Card.Description>Matched</Card.Description>
          </Card.Header>
        </Card>
      </div>

      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label="Candidates for this job description"
            className="min-w-[1400px]"
          >
            <Table.Header>
              <Table.Column className="w-10" textValue="Select" />
              <Table.Column isRowHeader>Candidate &amp; Role</Table.Column>
              <Table.Column className="text-center">Exp.</Table.Column>
              <Table.Column>Key Skills</Table.Column>
              <Table.Column>Education</Table.Column>
              <Table.Column>Source</Table.Column>
              <Table.Column className="text-center">JD match</Table.Column>
              <Table.Column>Pipeline</Table.Column>
              <Table.Column className="whitespace-nowrap">
                Uploaded at
              </Table.Column>
              <Table.Column>Schedule</Table.Column>
              <Table.Column className="text-center w-[80px]">
                Action
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {paginatedRows.map((r) => {
                const row: CandidateRow = candidateDbRowToTableRow(r);
                const contact = displayFromParsedPayload(r.parsed_payload);
                const skills = (r.skills ?? []).slice(0, 6).join(", ") || "—";
                const edu =
                  [r.degree, r.school].filter(Boolean).join(" · ") || "—";
                const busy = rowUpdating === r.id;
                return (
                  <Table.Row key={r.id} id={r.id}>
                    <Table.Cell>
                      <input
                        type="checkbox"
                        className="mt-1 size-4 rounded border-divider accent-accent"
                        checked={selected.has(r.id)}
                        disabled={!canEditPipeline}
                        onChange={() => toggleSelect(r.id)}
                        aria-label={`Select ${row.name}`}
                      />
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center gap-4">
                        <Avatar className="size-10 shrink-0" size="md">
                          {row.avatarUrl ? (
                            <Avatar.Image alt="" src={row.avatarUrl} />
                          ) : null}
                          <Avatar.Fallback className="text-xs">
                            {candidateDisplayInitials(row.name)}
                          </Avatar.Fallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link
                              href={`/admin/jd/${jobId}/pipeline/${encodeURIComponent(r.id)}/evaluation`}
                              className="font-semibold text-accent hover:underline"
                            >
                              {row.name}
                            </Link>
                            {/* {row.hasCvFile ? (
                              <a
                                href={`/api/admin/candidates/${r.id}/cv-download`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
                              >
                                CV file
                              </a>
                            ) : null} */}
                          </div>
                          <p className="text-xs font-medium text-muted">
                            {row.role}
                          </p>
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="text-center align-middle">
                      <div className="flex flex-col items-center tabular-nums">
                        <span className="text-lg font-semibold leading-none text-foreground">
                          {row.experienceYears}
                        </span>
                        <span className="text-[10px] font-medium text-muted">
                          Years
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex flex-wrap gap-1.5">
                        {row.skills.map((s) => (
                          <Chip
                            key={s}
                            size="sm"
                            variant="soft"
                            color="accent"
                            className="text-[10px] font-bold"
                          >
                            {s}
                          </Chip>
                        ))}
                        {row.moreSkills ? (
                          <Chip
                            size="sm"
                            variant="soft"
                            color="accent"
                            className="text-[10px] font-bold"
                          >
                            +{row.moreSkills}
                          </Chip>
                        ) : null}
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <p className="text-sm font-medium text-foreground">
                        {row.degree}
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-tight text-muted">
                        {row.school}
                      </p>
                    </Table.Cell>
                    <Table.Cell>
                      <p className="max-w-[200px] text-sm text-foreground">
                        {row.sourceLabel}
                      </p>
                    </Table.Cell>
                    <Table.Cell className="text-center align-middle">
                      <Chip
                        size="sm"
                        variant="soft"
                        color={jdMatchChipColor(row)}
                        className="min-w-[3.25rem] justify-center text-xs font-bold tabular-nums"
                      >
                        {row.jdMatchLabel}
                      </Chip>
                    </Table.Cell>
                    <Table.Cell className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 outline-none">
                      <Select
                        value={row.status}
                        isDisabled={!canEditPipeline || busy}
                        onChange={(key) => {
                          if (typeof key === "string") {
                            void onStatusChange(r.id, key as CandidateStatus);
                            if (document.activeElement instanceof HTMLElement) {
                              document.activeElement.blur();
                            }
                          }
                        }}
                      >
                        <Select.Trigger className="h-9 min-h-9 min-w-[11rem] justify-start gap-1 px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
                          <PipelineStatusLabel
                            status={row.status}
                            variant="inline"
                            uppercase={false}
                          />
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            {allowedTargetsFromStatus(r.status).map((s) => (
                              <ListBox.Item
                                key={s}
                                id={s}
                                textValue={candidateStatusUiLabel(s)}
                              >
                                <PipelineStatusLabel
                                  status={s}
                                  variant="inline"
                                  uppercase={false}
                                />
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap text-sm text-foreground">
                      {formatSchedule(r.cv_uploaded_at ?? r.created_at) ?? "—"}
                    </Table.Cell>
                    <Table.Cell className="max-w-[220px] align-top">
                      {r.status === "Interview" ||
                      r.status === "InterviewPassed" ? (
                        <div className="flex flex-col gap-1">
                          <Input
                            type="datetime-local"
                            value={interviewDrafts[r.id] ?? ""}
                            disabled={!canEditPipeline}
                            onChange={(e) =>
                              setInterviewDrafts((d) => ({
                                ...d,
                                [r.id]: e.target.value,
                              }))
                            }
                            className="w-full min-w-[11rem]"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            className="self-start"
                            isDisabled={!canEditPipeline || busy}
                            onPress={() => void saveInterviewTime(r.id)}
                          >
                            Save interview time
                          </Button>
                        </div>
                      ) : r.status === "Offer" ? (
                        <div className="flex flex-col gap-1">
                          <Input
                            type="datetime-local"
                            value={interviewDrafts[`ob-${r.id}`] ?? ""}
                            disabled={!canEditPipeline}
                            onChange={(e) =>
                              setInterviewDrafts((d) => ({
                                ...d,
                                [`ob-${r.id}`]: e.target.value,
                              }))
                            }
                            className="w-full min-w-[11rem]"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            className="self-start"
                            isDisabled={!canEditPipeline || busy}
                            onPress={() => void saveOnboardingTime(r.id)}
                          >
                            Save onboarding
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </Table.Cell>
                    <Table.Cell className="align-top text-center">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="px-2 text-danger hover:bg-danger/5 min-w-0"
                        isDisabled={!canEditPipeline || busy}
                        onPress={() => {
                          setRowPendingDelete(r);
                          deleteModal.open();
                        }}
                        aria-label={`Delete ${row.name}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
        {filteredRows.length > 0 ? (
          <Table.Footer className="border-t border-divider px-4 py-3">
            <Pagination size="sm">
              <Pagination.Summary>
                Showing {startIdx} to {endIdx} of {filteredRows.length} candidates
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
        ) : null}
      </Table>

      {filteredRows.length === 0 ? (
        <p className="text-center text-sm text-muted">
          No candidates match the current filters.
        </p>
      ) : null}

      <Modal.Backdrop
        isOpen={offerModal.isOpen}
        onOpenChange={offerModal.setOpen}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-lg overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider px-5 py-4">
              <Modal.Heading>Onboarding dates</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
              <p className="text-sm text-muted">
                Set the onboarding date and time for each selected candidate.
              </p>
              {Object.keys(onboardingDrafts).map((id) => {
                const row = dbRows.find((x) => x.id === id);
                const label = row
                  ? candidateDbRowToTableRow(row).name
                  : id.slice(0, 8);
                return (
                  <div key={id} className="space-y-1">
                    <Label className="text-xs font-medium">{label}</Label>
                    <Input
                      type="datetime-local"
                      value={onboardingDrafts[id] ?? ""}
                      onChange={(e) =>
                        setOnboardingDrafts((d) => ({
                          ...d,
                          [id]: e.target.value,
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                );
              })}
              {pipelineError && offerModal.isOpen ? (
                <p className="text-sm text-danger">{pipelineError}</p>
              ) : null}
            </Modal.Body>
            <Modal.Footer className="justify-end gap-2 border-t border-divider px-5 py-4">
              <Button variant="secondary" onPress={offerModal.close}>
                Cancel
              </Button>
              <Button
                variant="primary"
                isDisabled={pipelineBusy}
                onPress={() => void confirmOffer()}
              >
                Confirm
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <Modal.Backdrop
        isOpen={deleteModal.isOpen}
        onOpenChange={deleteModal.setOpen}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-md overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider px-5 py-4 bg-muted/10">
              <Modal.Heading className="text-lg font-bold text-foreground">
                Delete Candidate
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="px-5 py-4 space-y-3">
              <p className="text-sm text-muted">
                Are you sure you want to delete candidate{" "}
                <span className="font-semibold text-foreground">
                  {rowPendingDelete
                    ? candidateDbRowToTableRow(rowPendingDelete).name
                    : "this candidate"}
                </span>
                ?
              </p>
              <p className="text-xs text-danger font-medium bg-danger/5 border border-danger/25 rounded-lg p-2.5">
                Warning: This action is permanent and cannot be undone. It will
                remove the candidate from this JD campaign and delete their
                associated CV file.
              </p>
              {deleteError ? (
                <p className="text-sm text-danger" role="alert">
                  {deleteError}
                </p>
              ) : null}
            </Modal.Body>
            <Modal.Footer className="justify-end gap-2 border-t border-divider px-5 py-4 bg-muted/10">
              <Button
                variant="secondary"
                onPress={deleteModal.close}
                isDisabled={deleteBusy}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="bg-danger text-white hover:bg-danger-600"
                isDisabled={deleteBusy}
                onPress={() => void handleDeleteCandidate()}
              >
                {deleteBusy ? "Deleting..." : "Delete"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
