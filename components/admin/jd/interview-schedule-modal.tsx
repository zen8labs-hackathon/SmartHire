import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Calendar,
  Card,
  Chip,
  DateField,
  DatePicker,
  Input,
  Label,
  Modal,
  TimeField,
} from "@heroui/react";
import {
  getLocalTimeZone,
  Time,
  today,
  toCalendarDate,
  toCalendarDateTime,
  type CalendarDate,
  type CalendarDateTime,
} from "@internationalized/date";
import {
  Calendar as CalendarIcon,
  CalendarClock,
  Clock,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  X as XIcon,
} from "lucide-react";
import { Dialog, type TimeValue } from "react-aria-components";

import { BulkEmailModal } from "@/components/admin/jd/bulk-email-modal";
import {
  JdViewerEmailSearch,
  JdViewerEmailsField,
} from "@/components/admin/jd/jd-viewer-email-search";
import type { JdPipelineApplicationRow } from "@/lib/candidates/campaign-applied-table-row";
import { isValidEmail, normalizeEmail } from "@/lib/auth/email";
import {
  calendarDateTimeToIso,
  formatSchedule,
  isoToCalendarDateTime,
} from "@/lib/pipelines/jd-pipeline-row-helpers";

export type ScheduleInterviewer = {
  profileId: string;
  email: string | null;
  displayName: string | null;
  rsvpStatus: string;
};

export type CalendarSyncStatus = "pending" | "synced" | "failed" | "cancelled";

export type ScheduleHistoryItem = {
  id: string;
  round_label: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
  location: string | null;
  status: string;
  interviewers?: ScheduleInterviewer[];
  calendarSync?: { status: CalendarSyncStatus; error_message: string | null } | null;
};

/**
 * Assigned-interviewer chips for one schedule, with the same search-and-pick
 * email field (`JdViewerEmailSearch`) used by the create form's "Interview
 * participants" field, so the two forms look and behave the same way. Every
 * add/remove re-syncs that schedule's Microsoft Graph calendar event (see
 * the interviewers route), so the chip list is always what's actually on
 * interviewers' calendars.
 */
function ScheduleInterviewers({
  campaignAppliedId,
  schedule,
  canEdit,
  onChanged,
  bordered = true,
}: {
  campaignAppliedId: string;
  schedule: ScheduleHistoryItem;
  canEdit: boolean;
  onChanged: () => void;
  /** Top border/padding used to separate this block from the schedule details above it in the list-card view. Turned off when embedded under its own `<Label>` in the edit form, where that border would otherwise read as a stray line under the label instead of a separator. */
  bordered?: boolean;
}) {
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const interviewersUrl = `/api/admin/candidates/${campaignAppliedId}/schedules/${schedule.id}/interviewers`;

  const handleAdd = useCallback(
    async (rawEmail: string) => {
      const email = normalizeEmail(rawEmail);
      if (!isValidEmail(email)) {
        setError("Invalid email.");
        return;
      }
      setError(null);
      try {
        const res = await fetch(interviewersUrl, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to add interviewer.");
        onChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add interviewer.");
      }
    },
    [interviewersUrl, onChanged],
  );

  const handleRemove = useCallback(
    async (profileId: string) => {
      setRemovingId(profileId);
      setError(null);
      try {
        const res = await fetch(interviewersUrl, {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to remove interviewer.");
        onChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to remove interviewer.");
      } finally {
        setRemovingId(null);
      }
    },
    [interviewersUrl, onChanged],
  );

  const interviewers = schedule.interviewers ?? [];

  return (
    <div className={`space-y-2 ${bordered ? "border-t border-divider pt-2" : ""}`}>
      {canEdit ? (
        <JdViewerEmailSearch
          getHeaders={async () => ({ "Content-Type": "application/json" })}
          onPickEmail={(email) => void handleAdd(email)}
          searchUrl={`/api/admin/candidates/${campaignAppliedId}/interview-participant-suggestions`}
        />
      ) : null}
      {interviewers.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-divider p-2">
          {interviewers.map((i) => (
            <Chip key={i.profileId} size="sm" variant="soft" color="default" className="gap-1 pr-1">
              <Chip.Label className="font-mono text-[11px]">{i.email ?? i.profileId}</Chip.Label>
              {canEdit ? (
                <button
                  type="button"
                  aria-label={`Remove ${i.email ?? i.profileId}`}
                  disabled={removingId === i.profileId}
                  onClick={() => void handleRemove(i.profileId)}
                  className="rounded-full p-0.5 hover:bg-foreground/10"
                >
                  <XIcon className="size-3" />
                </button>
              ) : null}
            </Chip>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">No interviewer assigned yet.</p>
      )}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

const ACTIVE_SCHEDULE_STATUSES = new Set(["Scheduled", "Confirmed"]);

/** Chip colour per `candidate_schedules.status` -- see `CandidateScheduleStatus` in `lib/db/candidate-schedules.ts`. */
const SCHEDULE_STATUS_CHIP_COLOR: Record<
  string,
  "accent" | "success" | "danger" | "warning" | "default"
> = {
  Scheduled: "accent",
  Confirmed: "success",
  Canceled: "danger",
  Completed: "default",
};

/** `candidate_schedules.id` is a bigint identity column, so higher id = created later -- used to sort the merged list newest-first. */
function byNewestId(a: ScheduleHistoryItem, b: ScheduleHistoryItem): number {
  const diff = BigInt(a.id) - BigInt(b.id);
  const zero = BigInt(0);
  return diff > zero ? -1 : diff < zero ? 1 : 0;
}

/** Sort tier: the soonest-upcoming schedule first, then the rest of the active ones, then inactive (canceled/completed) last. */
function scheduleTier(s: ScheduleHistoryItem, nextUpcomingId: string | null): number {
  if (s.id === nextUpcomingId) return 0;
  if (ACTIVE_SCHEDULE_STATUSES.has(s.status)) return 1;
  return 2;
}

/** Shared header-action button style so the "list" and "form" views of the schedule modal read consistently when switching between them. */
const SCHEDULE_HEADER_BUTTON_CLASS =
  "h-7 gap-1 rounded-lg px-2.5 text-[11px] font-semibold";

/**
 * Merges a picked time-of-day into the current date value -- the calendar
 * popover only lets you pick a day, so without this the hour/minute silently
 * default to 00:00 with no visible way to set them. Falls back to today when
 * no date has been picked yet (picking the time first still produces a valid
 * value).
 */
function applyTimeToScheduledAt(
  date: CalendarDateTime | null,
  time: TimeValue | null,
): CalendarDateTime | null {
  if (!time) return date;
  const base = date ?? toCalendarDateTime(today(getLocalTimeZone()));
  return base.set({ hour: time.hour, minute: time.minute });
}

/**
 * Merges a picked calendar day into the current value, keeping whatever
 * time-of-day was already set -- the nested `Calendar` doesn't reliably pick
 * up the DatePicker's value/onChange through react-aria's implicit context
 * wiring here, so it's driven as an explicit controlled value instead.
 */
function applyDateToScheduledAt(
  prev: CalendarDateTime | null,
  date: CalendarDate | null,
): CalendarDateTime | null {
  if (!date) return prev;
  const time = prev ? { hour: prev.hour, minute: prev.minute } : { hour: 0, minute: 0 };
  return toCalendarDateTime(date).set(time);
}

function scheduleEmailSubject(
  row: JdPipelineApplicationRow,
  schedule: ScheduleHistoryItem,
): string {
  const label = schedule.round_label?.trim() || "Lịch hẹn";
  const position = row.job_position ? ` – ${row.job_position}` : "";
  return `[SmartHire] ${label}${position}`;
}

type InterviewScheduleModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  row: JdPipelineApplicationRow | null;
  canEdit: boolean;
  onSaved: () => void;
};

/**
 * Round label + date/time + duration + location, backed by `candidate_schedules`
 * via the existing `PATCH /api/admin/candidates/[id]/timeline` contract (a
 * reschedule creates a new row server-side; this modal just supplies the
 * fields). Replaces the old single-datetime-field inline editor, which wrote
 * to the now-dropped `candidates.interview_at` column.
 *
 * Not scoped to any particular pipeline stage, and not limited to a single
 * "active" schedule -- a candidate can have several `Scheduled`/`Confirmed`
 * rows at once (e.g. two interview rounds in parallel). The form always adds
 * a new, independent schedule unless "Edit" is clicked on an existing active
 * one, which switches the form into reschedule/cancel mode for that specific
 * row only.
 */
export function InterviewScheduleModal({
  isOpen,
  onOpenChange,
  row,
  canEdit,
  onSaved,
}: InterviewScheduleModalProps) {
  const [view, setView] = useState<"list" | "form">("list");
  const [roundLabel, setRoundLabel] = useState("");
  const [scheduledAt, setScheduledAt] = useState<CalendarDateTime | null>(null);
  const [durationMinutes, setDurationMinutes] = useState("");
  const [location, setLocation] = useState("");
  const [schedules, setSchedules] = useState<ScheduleHistoryItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailModalSchedule, setEmailModalSchedule] = useState<ScheduleHistoryItem | null>(null);
  const [participantEmails, setParticipantEmails] = useState<string[]>([]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setRoundLabel("");
    setScheduledAt(null);
    setDurationMinutes("");
    setLocation("");
    setParticipantEmails([]);
    setView("list");
  }, []);

  /**
   * `silent` skips the `loading` flag -- used when this is just a background
   * refresh after an interviewer add/remove (see `ScheduleInterviewers`'s
   * `onChanged`), so the whole modal body (including the open form) doesn't
   * flash to "Loading…" and back while the user is mid-edit. Full loads (on
   * open, after save/cancel) still show it.
   */
  const loadSchedules = useCallback(async (rowId: string, options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/candidates/${rowId}/timeline`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        schedules?: ScheduleHistoryItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not load schedules.");
      setSchedules(json.schedules ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load schedules.");
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !row) return;
    resetForm();
    void loadSchedules(row.id);
  }, [isOpen, row, resetForm, loadSchedules]);

  const startEdit = useCallback((item: ScheduleHistoryItem) => {
    setEditingId(item.id);
    setRoundLabel(item.round_label ?? "");
    setScheduledAt(isoToCalendarDateTime(item.scheduled_at));
    setDurationMinutes(
      item.duration_minutes != null ? String(item.duration_minutes) : "",
    );
    setLocation(item.location ?? "");
    setError(null);
    setView("form");
  }, []);

  const startAdd = useCallback(() => {
    resetForm();
    setView("form");
    if (row) {
      void (async () => {
        try {
          const res = await fetch(
            `/api/admin/candidates/${row.id}/interview-participant-suggestions`,
            { credentials: "include" },
          );
          const json = (await res.json()) as { suggestions?: string[] };
          if (res.ok) setParticipantEmails(json.suggestions ?? []);
        } catch {
          // Auto-fill is a convenience, not required -- leave the field empty on failure.
        }
      })();
    }
  }, [resetForm, row]);

  const handleSave = useCallback(async () => {
    if (!row) return;
    const iso = calendarDateTimeToIso(scheduledAt);
    if (!iso) {
      setError("Please set a valid date and time.");
      return;
    }
    if (!roundLabel.trim()) {
      setError("Please enter a round label.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/candidates/${row.id}/timeline`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: editingId ?? undefined,
          scheduledAt: iso,
          roundLabel: roundLabel.trim() || undefined,
          durationMinutes: durationMinutes.trim()
            ? Number(durationMinutes)
            : undefined,
          location: location.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { schedule?: { id: string }; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save schedule.");

      // Only on creation (not edit/reschedule) -- attaches the auto-filled /
      // hand-picked participant list in one bulk call so the calendar event
      // only syncs once, not once per interviewer.
      if (!editingId && json.schedule && participantEmails.length > 0) {
        await fetch(
          `/api/admin/candidates/${row.id}/schedules/${json.schedule.id}/interviewers`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emails: participantEmails }),
          },
        );
      }

      onSaved();
      resetForm();
      await loadSchedules(row.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save schedule.");
    } finally {
      setSaving(false);
    }
  }, [row, scheduledAt, editingId, roundLabel, durationMinutes, location, participantEmails, onSaved, resetForm, loadSchedules]);

  const handleCancelSchedule = useCallback(
    async (item: ScheduleHistoryItem) => {
      if (!row) return;
      setCancelingId(item.id);
      setError(null);
      try {
        const res = await fetch(`/api/admin/candidates/${row.id}/timeline`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduleId: item.id, status: "Canceled" }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to cancel schedule.");
        if (editingId === item.id) resetForm();
        onSaved();
        await loadSchedules(row.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to cancel schedule.");
      } finally {
        setCancelingId(null);
      }
    },
    [row, editingId, resetForm, onSaved, loadSchedules],
  );

  /** The active schedule with the soonest still-upcoming `scheduled_at` -- pinned to the top of the list and highlighted. Computed in an effect (not during render) since it depends on the current time. */
  const [nextUpcomingId, setNextUpcomingId] = useState<string | null>(null);
  useEffect(() => {
    const now = Date.now();
    let soonest: ScheduleHistoryItem | null = null;
    for (const s of schedules) {
      if (!ACTIVE_SCHEDULE_STATUSES.has(s.status)) continue;
      const t = new Date(s.scheduled_at).getTime();
      if (t < now) continue;
      if (!soonest || t < new Date(soonest.scheduled_at).getTime()) soonest = s;
    }
    setNextUpcomingId(soonest?.id ?? null);
  }, [schedules]);

  /** Soonest-upcoming first, then the rest of the active schedules (soonest date first), then inactive ones (canceled/completed) newest-created-first. */
  const sortedSchedules = useMemo(() => {
    return [...schedules].sort((a, b) => {
      const tierA = scheduleTier(a, nextUpcomingId);
      const tierB = scheduleTier(b, nextUpcomingId);
      if (tierA !== tierB) return tierA - tierB;
      if (tierA === 1) {
        return (
          new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
        );
      }
      return byNewestId(a, b);
    });
  }, [schedules, nextUpcomingId]);

  return (
    <>
      <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-lg overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider px-5 py-4">
              <Modal.Heading>Candidate schedule</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="max-h-[70vh] space-y-4 px-5 py-4">
              {loading ? (
                <p className="text-sm text-muted">Loading…</p>
              ) : error && view === "list" ? (
                <p className="text-sm text-danger">{error}</p>
              ) : view === "form" ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {editingId ? "Edit schedule" : "Add schedule"}
                  </p>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">
                      Round label <span className="text-danger">*</span>
                    </Label>
                    <Input
                      value={roundLabel}
                      onChange={(e) => setRoundLabel(e.target.value)}
                      placeholder="e.g. Technical round"
                      maxLength={48}
                      required
                      disabled={!canEdit}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">
                      Date &amp; time <span className="text-danger">*</span>
                    </Label>
                    <DatePicker
                      value={scheduledAt}
                      onChange={setScheduledAt}
                      granularity="minute"
                      hourCycle={24}
                      isDisabled={!canEdit}
                      className="w-full"
                      // The calendar grid only picks a day -- without this the
                      // popover closes the instant a date is clicked, before
                      // the time can be set below, silently defaulting to 00:00.
                      shouldCloseOnSelect={false}
                    >
                      <DateField.Group
                        fullWidth
                        variant="primary"
                        className="h-10 rounded-xl border-divider bg-surface-secondary/40 px-3 py-1 text-sm text-foreground shadow-sm"
                      >
                        <DateField.InputContainer className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none]">
                          <DateField.Input className="outline-none">
                            {(segment) =>
                              // `en-ZA`'s date+time pattern joins the two halves with
                              // ", " -- drop the comma so it reads as a plain space.
                              segment.type === "literal" ? (
                                <span aria-hidden="true">
                                  {segment.text.replace(",", "")}
                                </span>
                              ) : (
                                <DateField.Segment segment={segment} />
                              )
                            }
                          </DateField.Input>
                        </DateField.InputContainer>
                        <DateField.Suffix>
                          <DatePicker.Trigger className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted outline-none hover:bg-surface-tertiary">
                            <CalendarIcon className="h-3.5 w-3.5" />
                          </DatePicker.Trigger>
                        </DateField.Suffix>
                      </DateField.Group>
                      <DatePicker.Popover>
                        <Dialog className="z-50 rounded-2xl border border-divider bg-surface-primary p-4 shadow-2xl outline-none">
                          <Calendar
                            value={scheduledAt ? toCalendarDate(scheduledAt) : null}
                            onChange={(date) =>
                              setScheduledAt((prev) => applyDateToScheduledAt(prev, date))
                            }
                          >
                            <Calendar.Header className="mb-2 flex items-center justify-between">
                              <Calendar.NavButton slot="previous" />
                              <Calendar.Heading className="text-xs font-bold" />
                              <Calendar.NavButton slot="next" />
                            </Calendar.Header>
                            <Calendar.Grid weekdayStyle="short" className="border-collapse">
                              <Calendar.GridHeader>
                                {(day) => (
                                  <Calendar.HeaderCell className="py-1 text-[10px] font-bold text-muted">
                                    {day}
                                  </Calendar.HeaderCell>
                                )}
                              </Calendar.GridHeader>
                              <Calendar.GridBody>
                                {(date) => (
                                  <Calendar.Cell
                                    date={date}
                                    className="relative h-8 w-8 cursor-pointer p-0 text-center text-xs font-medium"
                                  >
                                    {({ formattedDate }) => (
                                      <>
                                        <Calendar.CellIndicator className="absolute inset-0 rounded-lg bg-accent/10" />
                                        <span className="relative z-[1] flex h-full w-full items-center justify-center rounded-lg hover:bg-accent/15">
                                          {formattedDate}
                                        </span>
                                      </>
                                    )}
                                  </Calendar.Cell>
                                )}
                              </Calendar.GridBody>
                            </Calendar.Grid>
                          </Calendar>
                          <div className="mt-3 flex items-center gap-2 border-t border-divider pt-3">
                            <Label className="shrink-0 text-xs font-medium text-muted">
                              Time
                            </Label>
                            <TimeField
                              value={
                                scheduledAt ? new Time(scheduledAt.hour, scheduledAt.minute) : null
                              }
                              onChange={(time) =>
                                setScheduledAt((prev) => applyTimeToScheduledAt(prev, time))
                              }
                              hourCycle={24}
                              granularity="minute"
                              isDisabled={!canEdit}
                            >
                              <TimeField.Group
                                fullWidth
                                variant="primary"
                                className="h-9 rounded-lg border-divider bg-surface-secondary/40 px-2.5 text-sm text-foreground"
                              >
                                <TimeField.InputContainer>
                                  <TimeField.Input className="outline-none">
                                    {(segment) => <TimeField.Segment segment={segment} />}
                                  </TimeField.Input>
                                </TimeField.InputContainer>
                              </TimeField.Group>
                            </TimeField>
                          </div>
                        </Dialog>
                      </DatePicker.Popover>
                    </DatePicker>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">
                        Duration (minutes)
                      </Label>
                      <Input
                        type="number"
                        max={8}
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(e.target.value)}
                        placeholder="60"
                        disabled={!canEdit}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Location</Label>
                      <Input
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="e.g. Meet link, room"
                        maxLength={48}
                        disabled={!canEdit}
                        className="w-full"
                      />
                    </div>
                  </div>
                  {!editingId ? (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Interview participants</Label>
                      <JdViewerEmailsField
                        emails={participantEmails}
                        onChange={setParticipantEmails}
                        getHeaders={async () => ({ "Content-Type": "application/json" })}
                        searchUrl={
                          row
                            ? `/api/admin/candidates/${row.id}/interview-participant-suggestions`
                            : undefined
                        }
                      />
                    </div>
                  ) : row ? (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Interviewers</Label>
                      {(() => {
                        const editingSchedule = schedules.find((s) => s.id === editingId);
                        if (!editingSchedule) return null;
                        return (
                          <ScheduleInterviewers
                            campaignAppliedId={row.id}
                            schedule={editingSchedule}
                            canEdit={canEdit}
                            onChanged={() => void loadSchedules(row.id, { silent: true })}
                            bordered={false}
                          />
                        );
                      })()}
                    </div>
                  ) : null}
                  {error ? <p className="text-sm text-danger">{error}</p> : null}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Schedules
                    </p>
                    {canEdit ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className={SCHEDULE_HEADER_BUTTON_CLASS}
                        onPress={startAdd}
                      >
                        <Plus className="size-3.5" />
                        Add schedule
                      </Button>
                    ) : null}
                  </div>

                  {sortedSchedules.length > 0 ? (
                    <div className="space-y-2 p-2 max-h-[52vh] overflow-y-auto">
                      {sortedSchedules.map((s) => {
                        const isActive = ACTIVE_SCHEDULE_STATUSES.has(s.status);
                        const isNextUpcoming = s.id === nextUpcomingId;
                        const isCanceling = cancelingId === s.id;
                        return (
                          <Card
                            key={s.id}
                            variant="transparent"
                            className={`!block !gap-0 !rounded-xl !p-3 !shadow-none border ${
                              isNextUpcoming
                                ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                                : "border-divider bg-surface-secondary/10 ring-1 ring-accent/20"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-semibold text-foreground">
                                    {s.round_label ?? "Schedule"}
                                  </span>
                                  <Chip
                                    size="sm"
                                    variant="soft"
                                    color={SCHEDULE_STATUS_CHIP_COLOR[s.status] ?? "default"}
                                  >
                                    {s.status}
                                  </Chip>
                                  {isNextUpcoming ? (
                                    <Chip size="sm" variant="primary" color="accent">
                                      Next up
                                    </Chip>
                                  ) : null}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                                  <span className="inline-flex items-center gap-1">
                                    <CalendarClock className="size-3.5 shrink-0" />
                                    {formatSchedule(s.scheduled_at) ?? s.scheduled_at}
                                  </span>
                                  {s.duration_minutes ? (
                                    <span className="inline-flex items-center gap-1">
                                      <Clock className="size-3.5 shrink-0" />
                                      {s.duration_minutes} min
                                    </span>
                                  ) : null}
                                  {s.location ? (
                                    <span className="inline-flex min-w-0 items-center gap-1">
                                      <MapPin className="size-3.5 shrink-0" />
                                      <span className="truncate">{s.location}</span>
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              {isActive ? (
                                <div className="flex shrink-0 items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    isIconOnly
                                    aria-label="Send schedule email"
                                    className="h-7 w-7 rounded-lg border border-divider text-muted hover:bg-surface-tertiary hover:text-foreground"
                                    isDisabled={isCanceling}
                                    onPress={() => setEmailModalSchedule(s)}
                                  >
                                    <Mail className="size-3.5" />
                                  </Button>
                                  {canEdit ? (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        isIconOnly
                                        aria-label="Edit schedule"
                                        className="h-7 w-7 rounded-lg border border-divider text-muted hover:bg-surface-tertiary hover:text-foreground"
                                        isDisabled={saving || isCanceling}
                                        onPress={() => startEdit(s)}
                                      >
                                        <Pencil className="size-3.5" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        isIconOnly
                                        aria-label="Cancel schedule"
                                        className="h-7 w-7 rounded-lg border border-divider text-danger hover:bg-danger/10"
                                        isDisabled={saving || isCanceling}
                                        onPress={() => void handleCancelSchedule(s)}
                                      >
                                        {isCanceling ? (
                                          <Loader2 className="size-3.5 animate-spin" />
                                        ) : (
                                          <Trash2 className="size-3.5" />
                                        )}
                                      </Button>
                                    </>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            {isActive && row ? (
                              <div className="mt-2">
                                {/* Read-only here -- adding/removing interviewers only happens in the edit form (see startEdit / the `editingId` branch below). */}
                                <ScheduleInterviewers
                                  campaignAppliedId={row.id}
                                  schedule={s}
                                  canEdit={false}
                                  onChanged={() => void loadSchedules(row.id, { silent: true })}
                                />
                              </div>
                            ) : null}
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-divider bg-surface-secondary/10 px-3 py-4 text-center text-xs text-muted">
                      No schedules yet.
                    </p>
                  )}
                </>
              )}
            </Modal.Body>
            <Modal.Footer className="justify-end gap-2 border-t border-divider px-5 py-4">
              {view === "list" ? (
                <Button variant="secondary" onPress={() => onOpenChange(false)}>
                  Close
                </Button>
              ) : null}
              {view === "form" ? (
                <Button
                  variant="secondary"
                  isDisabled={saving}
                  onPress={resetForm}
                >
                  Cancel
                </Button>
              ) : null}
              {view === "form" && canEdit ? (
                <Button
                  variant="primary"
                  isDisabled={saving}
                  onPress={() => void handleSave()}
                >
                  {saving ? "Saving…" : editingId ? "Save changes" : "Add schedule"}
                </Button>
              ) : null}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <BulkEmailModal
        isOpen={!!emailModalSchedule}
        onOpenChange={(open) => {
          if (!open) setEmailModalSchedule(null);
        }}
        recipients={
          row
            ? [{ id: row.id, candidate_name: row.candidate_name, candidate_email: row.candidate_email }]
            : []
        }
        initialSubject={
          row && emailModalSchedule ? scheduleEmailSubject(row, emailModalSchedule) : undefined
        }
        job={row ? { position: row.job_position, department: row.job_department } : null}
        onSent={() => {}}
      />
    </>
  );
}
