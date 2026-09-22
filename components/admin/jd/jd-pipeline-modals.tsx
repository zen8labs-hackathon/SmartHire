import { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  Button,
  Calendar,
  Chip,
  DateField,
  DatePicker,
  Input,
  Label,
  Modal,
  TimeField,
} from "@heroui/react";
import type { CalendarDateTime } from "@internationalized/date";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  CalendarDays,
  Calendar as CalendarIcon,
  ChevronDown,
  Clock,
  History as HistoryIcon,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { DatePickerStateContext, Dialog } from "react-aria-components";

import { CandidateProfileEditSection } from "@/components/admin/candidates/candidate-profile-edit-section";
import {
  type CandidateDbRow,
  campaignAppliedToCandidateDbRow,
} from "@/lib/candidates/db-row";
import type { JdPipelineApplicationRow } from "@/lib/candidates/campaign-applied-table-row";
import { jdMatchChipColor } from "@/lib/candidates/candidate-display";
import {
  jdRequirementSourceLabel,
  jdRequirementVerdictStyle,
  parseJdMatchRationale,
  sortJdRequirements,
  type JdRequirementCheck,
} from "@/lib/candidates/jd-match-rationale";
import {
  calendarDateTimeToIso,
  formatSchedule,
  isoToCalendarDateTime,
} from "@/lib/pipelines/jd-pipeline-row-helpers";

dayjs.extend(relativeTime);

type ScheduleHistoryItem = {
  id: string;
  round_label: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
  location: string | null;
  status: string;
  created_at: string;
  rescheduled_from_id: string | null;
};

/** Chip color + label per `candidate_schedules.status` (see lib/db/candidate-schedules.ts). */
const SCHEDULE_STATUS_STYLE: Record<
  string,
  {
    label: string;
    color: "accent" | "success" | "warning" | "danger" | "default";
  }
> = {
  Scheduled: { label: "Scheduled", color: "accent" },
  Confirmed: { label: "Confirmed", color: "success" },
  Completed: { label: "Completed", color: "success" },
  Rescheduled: { label: "Rescheduled", color: "default" },
  Canceled: { label: "Canceled", color: "danger" },
  NoShow: { label: "No-show", color: "warning" },
};

function scheduleStatusStyle(status: string) {
  return (
    SCHEDULE_STATUS_STYLE[status] ?? {
      label: status,
      color: "default" as const,
    }
  );
}

/** Sort priority for the schedule history list: actionable statuses first, then how the round wound down. Unknown statuses sort last. */
const SCHEDULE_STATUS_ORDER: Record<string, number> = {
  Scheduled: 0,
  Confirmed: 1,
  Rescheduled: 2,
  Completed: 3,
  NoShow: 4,
  Canceled: 5,
};

/**
 * The time control inside the `DatePicker.Popover`. Must read/write the
 * enclosing `<DatePicker>`'s own picker state via `DatePickerStateContext`
 * (`state.dateValue`/`setTimeValue`) rather than being bound to our own
 * `scheduledAt` -- react-stately's `useDatePickerState` only stages a
 * Calendar click in `dateValue` internally (see
 * node_modules/react-stately/dist/private/datepicker/useDatePickerState.js's
 * `selectDate`) and doesn't call the picker's public `onChange` until a time
 * is also set, so a TimeField controlled by our *own* value/onChange (which
 * only exists once `onChange` has already fired) never sees that pending
 * date and can never supply the missing time -- a deadlock. Reading `state`
 * directly breaks that: `setTimeValue` commits the pending date + this time
 * together, which is what finally fires the picker's `onChange`.
 */
function InterviewTimeField() {
  const state = useContext(DatePickerStateContext);
  const dateValue = state?.dateValue ?? null;

  if (!state || !dateValue) {
    return <span className="text-xs text-muted">Pick a date first</span>;
  }

  return (
    <TimeField
      aria-label="Interview time"
      hourCycle={24}
      defaultValue={state.timeValue ?? undefined}
      onChange={(next) => {
        if (next) state.setTimeValue(next);
      }}
    >
      <TimeField.Group>
        <TimeField.InputContainer>
          <TimeField.Input>
            {(segment) => <TimeField.Segment segment={segment} />}
          </TimeField.Input>
        </TimeField.InputContainer>
      </TimeField.Group>
    </TimeField>
  );
}

type InterviewScheduleModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  row: JdPipelineApplicationRow | null;
  canEdit: boolean;
  /** Lets the parent pick the right toast copy for a save vs. a cancel. */
  onSaved: (action: "saved" | "canceled") => void;
};

/**
 * Round label + date/time + duration + location, backed by `candidate_schedules`
 * via the existing `PATCH /api/admin/candidates/[id]/timeline` contract (a
 * reschedule creates a new row server-side; this modal just supplies the
 * fields). Replaces the old single-datetime-field inline editor, which wrote
 * to the now-dropped `candidates.interview_at` column.
 */
export function InterviewScheduleModal({
  isOpen,
  onOpenChange,
  row,
  canEdit,
  onSaved,
}: InterviewScheduleModalProps) {
  const [mode, setMode] = useState<"list" | "form">("list");
  const [roundLabel, setRoundLabel] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [location, setLocation] = useState("");
  const [history, setHistory] = useState<ScheduleHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const requestIdRef = useRef(0);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Shared by the on-open load and the post-save refresh, so the history list
  // (and the form's prefill from whichever round is currently active) always
  // reflect the latest server state without closing the modal. `requestIdRef`
  // drops a response that resolves after a newer request has already started
  // (e.g. the row changes, or the modal is reopened, mid-flight).
  const refreshSchedules = useCallback(async (applicationId: string) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/candidates/${applicationId}/timeline`,
        {
          credentials: "include",
        },
      );
      const json = (await res.json()) as {
        schedules?: ScheduleHistoryItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not load schedule.");
      if (requestIdRef.current !== requestId) return;
      const schedules = json.schedules ?? [];
      setHistory(schedules);
      const active = schedules.find(
        (s) => s.status === "Scheduled" || s.status === "Confirmed",
      );
      setRoundLabel(active?.round_label ?? "");
      setScheduledAt(active?.scheduled_at ?? "");
      setDurationMinutes(
        active?.duration_minutes != null ? String(active.duration_minutes) : "",
      );
      setLocation(active?.location ?? "");
    } catch (e) {
      if (requestIdRef.current === requestId) {
        setError(e instanceof Error ? e.message : "Could not load schedule.");
      }
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !row) return;
    setMode("list");
    setExpandedIds(new Set());
    void refreshSchedules(row.id);
  }, [isOpen, row, refreshSchedules]);

  // "Add new" starts a fresh round, not an edit of whichever round is
  // currently active -- `refreshSchedules` prefills those fields for its own
  // purposes (so a reload shows the active round's values), but that
  // shouldn't leak into a blank "new round" form.
  const handleAddNew = useCallback(() => {
    setError(null);
    setRoundLabel("");
    setScheduledAt("");
    setDurationMinutes("");
    setLocation("");
    setMode("form");
  }, []);

  const handleSave = useCallback(async () => {
    if (!row) return;
    if (!scheduledAt) {
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
          scheduledAt,
          roundLabel: roundLabel.trim() || undefined,
          durationMinutes: durationMinutes.trim()
            ? Number(durationMinutes)
            : undefined,
          location: location.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save schedule.");
      onSaved("saved");
      await refreshSchedules(row.id);
      setMode("list");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save schedule.");
    } finally {
      setSaving(false);
    }
  }, [
    row,
    scheduledAt,
    roundLabel,
    durationMinutes,
    location,
    onSaved,
    refreshSchedules,
  ]);

  // Prefills the form from a specific history entry (only ever the active
  // one -- see the `isActive` guard around the card's Edit button). Reuses
  // the same PATCH contract as `handleSave`: since this round is still
  // active, saving with the same `scheduledAt` updates it in place, and
  // saving with a different one reschedules it (server-side, not here).
  const handleEdit = useCallback((item: ScheduleHistoryItem) => {
    setError(null);
    setRoundLabel(item.round_label ?? "");
    setScheduledAt(item.scheduled_at);
    setDurationMinutes(
      item.duration_minutes != null ? String(item.duration_minutes) : "",
    );
    setLocation(item.location ?? "");
    setMode("form");
  }, []);

  const [cancelingId, setCancelingId] = useState<string | null>(null);

  // "Delete" in the UI is a cancel: `candidate_schedules` has no soft-delete
  // column (see lib/db/candidate-schedules.ts), so removing a round means
  // marking it `"Canceled"`, which the DELETE route enforces server-side too.
  const handleCancel = useCallback(
    async (scheduleId: string) => {
      if (!row) return;
      if (!confirm("Cancel this scheduled interview?")) return;
      setCancelingId(scheduleId);
      setError(null);
      try {
        const res = await fetch(`/api/admin/candidates/${row.id}/timeline`, {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduleId }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok)
          throw new Error(json.error ?? "Failed to cancel schedule.");
        onSaved("canceled");
        await refreshSchedules(row.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to cancel schedule.");
      } finally {
        setCancelingId(null);
      }
    },
    [row, onSaved, refreshSchedules],
  );

  // Newer entries point back at the round they replaced via `rescheduled_from_id`;
  // index that so a superseded card can link forward to what replaced it.
  const supersededByMap = new Map<string, ScheduleHistoryItem>();
  for (const h of history) {
    if (h.rescheduled_from_id) supersededByMap.set(h.rescheduled_from_id, h);
  }

  // Grouped by status (SCHEDULE_STATUS_ORDER: Scheduled/Confirmed lead,
  // Canceled trails), then newest-first within each group -- a reschedule
  // keeps the *old* row's original timestamp, which can sort later than the
  // round that replaced it, so a plain `scheduled_at DESC` (the API's order)
  // can bury the one round that's actually actionable under stale history.
  const sortedHistory = [...history].sort((a, b) => {
    const byStatus =
      (SCHEDULE_STATUS_ORDER[a.status] ?? 99) -
      (SCHEDULE_STATUS_ORDER[b.status] ?? 99);
    if (byStatus !== 0) return byStatus;
    return (
      new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
    );
  });

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-xl overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-5 py-4">
            <Modal.Heading>Interview schedule</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex max-h-[75vh] flex-col gap-4 px-5 py-4">
            {error ? (
              <p className="shrink-0 text-sm text-danger">{error}</p>
            ) : null}

            {mode === "form" ? (
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border border-divider bg-surface-secondary/10 p-3.5">
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
                    aria-label="Interview date and time"
                    granularity="minute"
                    hourCycle={24}
                    shouldCloseOnSelect={false}
                    value={isoToCalendarDateTime(scheduledAt)}
                    onChange={(next) =>
                      setScheduledAt(
                        calendarDateTimeToIso(
                          next as CalendarDateTime | null,
                        ) ?? "",
                      )
                    }
                    isDisabled={!canEdit}
                    className="w-full"
                  >
                    <DateField.Group fullWidth className="w-full">
                      <DateField.InputContainer>
                        <DateField.Input>
                          {(segment) => <DateField.Segment segment={segment} />}
                        </DateField.Input>
                      </DateField.InputContainer>
                      <DateField.Suffix>
                        <DatePicker.Trigger className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted outline-none hover:bg-surface-tertiary">
                          <CalendarIcon className="size-3.5" />
                        </DatePicker.Trigger>
                      </DateField.Suffix>
                    </DateField.Group>
                    <DatePicker.Popover>
                      <Dialog className="z-50 rounded-2xl border border-divider bg-surface-primary p-4 shadow-2xl outline-none">
                        <Calendar>
                          <Calendar.Header className="mb-2 flex items-center justify-between gap-2">
                            <Calendar.NavButton slot="previous" />
                            <Calendar.Heading className="text-sm font-semibold" />
                            <Calendar.NavButton slot="next" />
                          </Calendar.Header>
                          <Calendar.Grid
                            weekdayStyle="short"
                            className="border-collapse"
                          >
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
                                  className="relative size-8 cursor-pointer p-0 text-center text-xs font-medium"
                                >
                                  {({ formattedDate }) => (
                                    <>
                                      <Calendar.CellIndicator className="absolute inset-0 rounded-lg bg-accent/10" />
                                      <span className="relative z-[1] flex size-full items-center justify-center rounded-lg hover:bg-accent/15">
                                        {formattedDate}
                                      </span>
                                    </>
                                  )}
                                </Calendar.Cell>
                              )}
                            </Calendar.GridBody>
                          </Calendar.Grid>
                        </Calendar>
                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-divider pt-3">
                          <Label className="text-xs font-medium">Time</Label>
                          <InterviewTimeField />
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
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <div className="flex shrink-0 items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                    <HistoryIcon className="size-3.5" />
                    Schedule history
                  </p>
                  {canEdit ? (
                    <Button
                      size="sm"
                      variant="primary"
                      className="gap-1"
                      isDisabled={loading}
                      onPress={handleAddNew}
                    >
                      <Plus className="size-3.5" />
                      Add new
                    </Button>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {loading ? (
                    <div className="animate-pulse space-y-2">
                      {["sk-1", "sk-2"].map((id) => (
                        <div
                          key={id}
                          className="h-20 rounded-xl border border-divider bg-surface-secondary/20"
                        />
                      ))}
                    </div>
                  ) : history.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-divider px-3 py-3 text-xs text-muted">
                      No interview has been scheduled yet for this application.
                    </p>
                  ) : (
                    <ul className="space-y-2 pb-0.5">
                      {sortedHistory.map((h) => {
                        const style = scheduleStatusStyle(h.status);
                        const isActive =
                          h.status === "Scheduled" || h.status === "Confirmed";
                        const isExpanded = expandedIds.has(h.id);
                        const supersededBy = supersededByMap.get(h.id);
                        return (
                          <li
                            key={h.id}
                            className={`rounded-xl border px-3.5 py-3 transition-colors ${
                              isActive
                                ? "border-accent/40 bg-accent/5"
                                : "border-divider bg-surface-secondary/10"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {h.round_label ?? "Interview"}
                              </span>
                              <Chip
                                size="sm"
                                variant="soft"
                                color={style.color}
                              >
                                {style.label}
                              </Chip>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
                              <span className="flex items-center gap-1.5">
                                <CalendarDays className="size-3.5 shrink-0" />
                                {formatSchedule(h.scheduled_at) ??
                                  h.scheduled_at}
                                <span className="text-muted/70">
                                  ({dayjs(h.scheduled_at).fromNow()})
                                </span>
                              </span>
                              {h.duration_minutes ? (
                                <span className="flex items-center gap-1.5">
                                  <Clock className="size-3.5 shrink-0" />
                                  {h.duration_minutes} min
                                </span>
                              ) : null}
                              {h.location ? (
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <MapPin className="size-3.5 shrink-0" />
                                  <span className="truncate">{h.location}</span>
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-2 flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => toggleExpanded(h.id)}
                                className="flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
                              >
                                <ChevronDown
                                  className={`size-3.5 transition-transform ${
                                    isExpanded ? "rotate-180" : ""
                                  }`}
                                />
                                {isExpanded ? "Hide details" : "View details"}
                              </button>
                              {canEdit && isActive ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleEdit(h)}
                                    aria-label="Edit schedule"
                                    title="Edit"
                                    className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-surface-tertiary hover:text-foreground"
                                  >
                                    <Pencil className="size-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={cancelingId === h.id}
                                    onClick={() => void handleCancel(h.id)}
                                    aria-label="Cancel schedule"
                                    title="Cancel"
                                    className="flex size-6 items-center justify-center rounded-md text-danger hover:bg-danger/10 disabled:opacity-50"
                                  >
                                    <Trash2
                                      className={`size-3.5 ${cancelingId === h.id ? "animate-pulse" : ""}`}
                                    />
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            {isExpanded ? (
                              <div className="mt-2 space-y-1 border-t border-divider/70 pt-2 text-[11px] text-muted">
                                <p>
                                  Created{" "}
                                  {formatSchedule(h.created_at) ?? h.created_at}{" "}
                                  ({dayjs(h.created_at).fromNow()})
                                </p>
                                {h.rescheduled_from_id ? (
                                  <p>Rescheduled from an earlier round.</p>
                                ) : null}
                                {supersededBy ? (
                                  <p>
                                    Rescheduled to{" "}
                                    {formatSchedule(
                                      supersededBy.scheduled_at,
                                    ) ?? supersededBy.scheduled_at}
                                    .
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </Modal.Body>
          <Modal.Footer className="justify-end gap-2 border-t border-divider px-5 py-4">
            {mode === "form" ? (
              <>
                <Button
                  variant="secondary"
                  isDisabled={saving}
                  onPress={() => {
                    setError(null);
                    setMode("list");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  isDisabled={saving || loading}
                  onPress={() => void handleSave()}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </>
            ) : (
              <Button variant="secondary" onPress={() => onOpenChange(false)}>
                Close
              </Button>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

type RationaleModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  row: JdPipelineApplicationRow | null;
};

/**
 * One JD requirement and how the candidate measured up against it.
 */
/** Card accent + badge tint per verdict colour. */
const REQUIREMENT_STYLE: Record<
  ReturnType<typeof jdRequirementVerdictStyle>["color"],
  { card: string; badge: string }
> = {
  success: {
    card: "border-l-success bg-success/[0.04]",
    badge: "bg-success/10 text-success",
  },
  warning: {
    card: "border-l-warning bg-warning/[0.04]",
    badge: "bg-warning/10 text-warning",
  },
  danger: {
    card: "border-l-danger bg-danger/[0.04]",
    badge: "bg-danger/10 text-danger",
  },
  default: {
    card: "border-l-divider bg-muted/[0.04]",
    badge: "bg-muted/10 text-muted",
  },
};

function RequirementRow({ check }: { check: JdRequirementCheck }) {
  const style = jdRequirementVerdictStyle(check.verdict);
  const tone = REQUIREMENT_STYLE[style.color];

  return (
    <li className={`rounded-lg border-l-4 px-4 py-3 ${tone.card}`}>
      <div className="flex items-center gap-2">
        <span
          aria-label={style.label}
          className={`flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold leading-none ${tone.badge}`}
        >
          {style.icon}
        </span>
        <span className="whitespace-nowrap text-[0.6875rem] font-bold uppercase tracking-wide text-muted">
          {jdRequirementSourceLabel(check.source)}
        </span>
      </div>
      <p className="mt-1.5 text-sm font-semibold leading-snug text-foreground">
        {check.requirement}
      </p>
      {check.evidence ? (
        <p className="mt-2 rounded-md bg-background/60 px-3 py-2 text-sm leading-snug text-muted">
          {check.evidence}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Read-only view of the AI's JD-match rationale for a candidate's active CV
 * version (`campaign_applied.jd_match_rationale`), alongside the numeric
 * score it explains.
 *
 * Runs scored before the per-requirement checklist shipped (and formula-only
 * fallbacks, which never ran an LLM) hold plain prose in that column --
 * `parseJdMatchRationale` returns those with no `requirements`, and they keep
 * the original single-paragraph layout until someone rescores.
 */
export function RationaleModal({
  isOpen,
  onOpenChange,
  row,
}: RationaleModalProps) {
  const score =
    row?.jd_match_status === "completed" && row.jd_match_score != null
      ? Math.round(row.jd_match_score)
      : null;

  const rationale = parseJdMatchRationale(row?.jd_match_rationale);
  const requirements = rationale
    ? sortJdRequirements(rationale.requirements)
    : [];

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-2xl overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-5 py-4">
            <Modal.Heading className="flex items-center gap-2 text-lg font-bold text-foreground">
              JD match reasoning
              {score != null ? (
                <Chip
                  size="sm"
                  variant="soft"
                  color={jdMatchChipColor({ jdMatchScore: score })}
                  className="min-w-[3.25rem] justify-center text-sm font-bold tabular-nums"
                >
                  {score}
                </Chip>
              ) : null}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
            {row?.jd_match_status === "failed" ? (
              <p className="text-sm text-danger">
                {row.jd_match_error ?? "Scoring failed."}
              </p>
            ) : rationale ? (
              <>
                {rationale.summary ? (
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {rationale.summary}
                  </p>
                ) : null}
                {rationale.meta ? (
                  <p className="whitespace-pre-wrap text-xs text-muted">
                    {rationale.meta}
                  </p>
                ) : null}
                {requirements.length > 0 ? (
                  <ul className="space-y-2 border-t border-divider pt-4 first:border-t-0 first:pt-0">
                    {requirements.map((check, i) => (
                      <RequirementRow
                        key={`${check.requirement}-${i}`}
                        check={check}
                      />
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted">
                No reasoning available for this candidate yet.
              </p>
            )}
          </Modal.Body>
          <Modal.Footer className="justify-end border-t border-divider px-5 py-4">
            <Button variant="secondary" onPress={() => onOpenChange(false)}>
              Close
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

type DeleteCandidateModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string | null;
  deleteError: string | null;
  deleteBusy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteCandidateModal({
  isOpen,
  onOpenChange,
  candidateName,
  deleteError,
  deleteBusy,
  onCancel,
  onConfirm,
}: DeleteCandidateModalProps) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
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
                {candidateName ?? "this candidate"}
              </span>
              ?
            </p>
            <p className="text-xs text-danger font-medium bg-danger/5 border border-danger/25 rounded-lg p-2.5">
              This will remove the candidate from this JD campaign. Their
              application and CV file are kept on record and won&apos;t appear
              in search or reporting anymore. If this candidate has applications
              to other jobs, those are left untouched.
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
              onPress={onCancel}
              isDisabled={deleteBusy}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="bg-danger text-white hover:bg-danger-600"
              isDisabled={deleteBusy}
              onPress={onConfirm}
            >
              {deleteBusy ? "Deleting..." : "Delete"}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

type ConfirmRunJdMatchModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  candidateCount: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmBulkPipelineActionModal({
  isOpen,
  onOpenChange,
  title,
  description,
  confirmLabel,
  candidateCount,
  busy,
  onCancel,
  onConfirm,
}: ConfirmRunJdMatchModalProps & {
  title: string;
  description: string;
  confirmLabel: string;
}) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-md overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-5 py-4">
            <Modal.Heading className="text-lg font-bold text-foreground">
              {title}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="px-5 py-4">
            <p className="text-sm text-muted">
              {description} for{" "}
              <span className="font-semibold text-foreground">
                {candidateCount}
              </span>{" "}
              selected candidate{candidateCount === 1 ? "" : "s"}?
            </p>
          </Modal.Body>
          <Modal.Footer className="justify-end gap-2 border-t border-divider px-5 py-4">
            <Button variant="secondary" onPress={onCancel} isDisabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="bg-accent text-accent-foreground"
              isDisabled={busy}
              onPress={onConfirm}
            >
              {busy ? "Processing…" : confirmLabel}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

type EditCandidateModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Only the id/name are needed from the caller -- the full `CandidateDbRow`
   * `CandidateProfileEditSection` requires is fetched below, mirroring the
   * same `/api/admin/candidates/[id]` + `campaignAppliedToCandidateDbRow`
   * pattern the global candidates dashboard's drawer already uses (see
   * `use-candidate-pipeline-state.ts`). This JD-pipeline table only has the
   * lighter `CampaignAppliedAdminRow` shape, so it can't be passed straight
   * through. */
  row: { id: string; name: string } | null;
  canEdit: boolean;
  onSaved: () => void;
  /** Forwarded to `CandidateProfileEditSection` -- see its docstring. Called
   * instead of `onSaved` when a profile-edit conflict was resolved by
   * merging into a *different* candidate's application (so `row.id` no
   * longer refers to a live application -- the caller must navigate rather
   * than just refresh in place). Falls back to `onSaved` when omitted. */
  onCandidateIdChanged?: (
    newCampaignAppliedId: string,
    candidate: CandidateDbRow,
  ) => void;
  /** Forwarded to `CandidateProfileEditSection` -- see its docstring. */
  hidePipelineAndSource?: boolean;
};

export function EditCandidateModal({
  isOpen,
  onOpenChange,
  row,
  canEdit,
  onSaved,
  onCandidateIdChanged,
  hidePipelineAndSource,
}: EditCandidateModalProps) {
  const [dbRow, setDbRow] = useState<CandidateDbRow | null>(null);
  const [dbLoadState, setDbLoadState] = useState<"loading" | "error" | "ok">(
    "loading",
  );
  const [canEditSalary, setCanEditSalary] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const saveActionRef = useRef<(() => void) | null>(null);

  // The caller clears `row` the instant the modal starts closing (e.g. right
  // after a successful save), but the dialog itself keeps rendering for a
  // bit longer while its close transition plays out. Rendering off `row`
  // directly would blank the header/body/footer for that stretch -- keep
  // showing the last real row instead so the dialog never flashes empty
  // before it actually unmounts.
  const [displayRow, setDisplayRow] = useState(row);
  useEffect(() => {
    if (row) setDisplayRow(row);
  }, [row]);

  useEffect(() => {
    if (!isOpen || !row) {
      return;
    }
    const ac = new AbortController();
    setDbRow(null);
    setDbLoadState("loading");
    setCanEditSalary(false);
    setDirty(false);
    setBusy(false);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/candidates/${row.id}`, {
          credentials: "include",
          cache: "no-store",
          signal: ac.signal,
        });
        if (!res.ok) {
          if (!ac.signal.aborted) setDbLoadState("error");
          return;
        }
        const json = (await res.json()) as {
          candidate?: unknown;
          canViewSalary?: boolean;
        };
        if (ac.signal.aborted || !json.candidate) {
          if (!ac.signal.aborted) setDbLoadState("error");
          return;
        }
        const c =
          json.candidate &&
          typeof json.candidate === "object" &&
          "candidate_id" in json.candidate
            ? campaignAppliedToCandidateDbRow(json.candidate as any)
            : (json.candidate as CandidateDbRow);
        setDbRow(c);
        setCanEditSalary(json.canViewSalary === true);
        setDbLoadState("ok");
      } catch {
        if (!ac.signal.aborted) setDbLoadState("error");
      }
    })();
    return () => ac.abort();
  }, [isOpen, row]);

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-2xl overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-5 py-4 bg-muted/10">
            <Modal.Heading className="text-lg font-bold text-foreground">
              {displayRow?.name ?? "Edit candidate"}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="max-h-[65vh] overflow-y-auto px-5 py-4">
            {displayRow ? (
              dbLoadState === "error" ? (
                <p className="text-sm text-danger">
                  Could not load this candidate's details. Close and try again.
                </p>
              ) : (
                <CandidateProfileEditSection
                  candidateId={displayRow.id}
                  dbRow={dbRow}
                  canEdit={canEdit}
                  canEditSalary={canEditSalary}
                  isPreview={false}
                  dbLoadState={dbLoadState}
                  startInEditMode
                  embedded
                  onDirtyChange={setDirty}
                  onBusyChange={setBusy}
                  saveActionRef={saveActionRef}
                  onSaved={onSaved}
                  onCandidateIdChanged={
                    onCandidateIdChanged ?? (() => onSaved())
                  }
                  hidePipelineAndSource={hidePipelineAndSource}
                  onCancel={() => onOpenChange(false)}
                />
              )
            ) : null}
          </Modal.Body>
          {displayRow && canEdit && dbLoadState !== "error" ? (
            <Modal.Footer className="justify-end gap-2 border-t border-divider px-6 py-4">
              <Button
                variant="tertiary"
                onPress={() => onOpenChange(false)}
                isDisabled={busy}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onPress={() => saveActionRef.current?.()}
                isDisabled={busy || !dirty}
                isPending={busy}
              >
                Save changes
              </Button>
            </Modal.Footer>
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
