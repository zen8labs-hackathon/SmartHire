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
  ArrowLeft,
  Calendar as CalendarIcon,
  CalendarClock,
  Clock,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Dialog, type TimeValue } from "react-aria-components";

import { BulkEmailModal } from "@/components/admin/jd/bulk-email-modal";
import type { JdPipelineApplicationRow } from "@/lib/candidates/campaign-applied-table-row";
import {
  calendarDateTimeToIso,
  formatSchedule,
  isoToCalendarDateTime,
} from "@/lib/pipelines/jd-pipeline-row-helpers";

export type ScheduleHistoryItem = {
  id: string;
  round_label: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
  location: string | null;
  status: string;
};

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

function scheduleEmailBody(schedule: ScheduleHistoryItem): string {
  const when = formatSchedule(schedule.scheduled_at) ?? schedule.scheduled_at;
  const details: string[] = [`<p><strong>Thời gian:</strong> ${when}</p>`];
  if (schedule.duration_minutes) {
    details.push(`<p><strong>Thời lượng:</strong> ${schedule.duration_minutes} phút</p>`);
  }
  if (schedule.location) {
    details.push(`<p><strong>Địa điểm:</strong> ${schedule.location}</p>`);
  }
  return [
    `<p>Kính gửi {{candidate_name}},</p>`,
    `<p>Chúng tôi xin thông báo lịch "${schedule.round_label?.trim() || "hẹn"}" cho vị trí <strong>{{position}}</strong> như sau:</p>`,
    ...details,
    `<p>Vui lòng phản hồi email này nếu bạn cần đổi thời gian. Hẹn gặp bạn!</p>`,
  ].join("");
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

  const resetForm = useCallback(() => {
    setEditingId(null);
    setRoundLabel("");
    setScheduledAt(null);
    setDurationMinutes("");
    setLocation("");
    setView("list");
  }, []);

  const loadSchedules = useCallback(async (rowId: string) => {
    setLoading(true);
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
      setLoading(false);
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
  }, [resetForm]);

  const handleSave = useCallback(async () => {
    if (!row) return;
    const iso = calendarDateTimeToIso(scheduledAt);
    if (!iso) {
      setError("Please set a valid date and time.");
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
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save schedule.");
      onSaved();
      resetForm();
      await loadSchedules(row.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save schedule.");
    } finally {
      setSaving(false);
    }
  }, [row, scheduledAt, editingId, roundLabel, durationMinutes, location, onSaved, resetForm, loadSchedules]);

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
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      {editingId ? "Edit schedule" : "Add schedule"}
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className={SCHEDULE_HEADER_BUTTON_CLASS}
                      isDisabled={saving}
                      onPress={resetForm}
                    >
                      <ArrowLeft className="size-3.5" />
                      Back to list
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Round label</Label>
                    <Input
                      value={roundLabel}
                      onChange={(e) => setRoundLabel(e.target.value)}
                      placeholder="e.g. Technical round"
                      disabled={!canEdit}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Date &amp; time</Label>
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
                            {(segment) => <DateField.Segment segment={segment} />}
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
                        min={1}
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(e.target.value)}
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
                        disabled={!canEdit}
                        className="w-full"
                      />
                    </div>
                  </div>
                  {error ? <p className="text-sm text-danger">{error}</p> : null}
                  {canEdit ? (
                    <Button
                      variant="primary"
                      className="w-full"
                      isDisabled={saving}
                      onPress={() => void handleSave()}
                    >
                      {saving ? "Saving…" : editingId ? "Save changes" : "Add schedule"}
                    </Button>
                  ) : null}
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
                                : "border-divider bg-surface-secondary/20"
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
              <Button variant="secondary" onPress={() => onOpenChange(false)}>
                Close
              </Button>
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
        initialBody={emailModalSchedule ? scheduleEmailBody(emailModalSchedule) : undefined}
        onSent={() => {}}
      />
    </>
  );
}
