"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import Link from "next/link";
import { Pencil, Trash2, Users as UsersIcon, Layers as LayersIcon, Calendar as CalendarIcon } from "lucide-react";
import {
  DataTableStats,
  DataTableToolbar,
  DataTablePagination,
  DataTableFilterButton,
  DataTableFilterModal,
} from "@/components/admin/shell/table-system";
import { usePageQueryParam } from "@/components/admin/shell/use-page-query-param";
import { useDebouncedValue } from "@/components/admin/shell/use-debounced-value";
import {
  Avatar,
  Button,
  Calendar,
  Card,
  Chip,
  cn,
  DateField,
  DatePicker,
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
import {
  today,
  getLocalTimeZone,
  fromDate,
  toCalendarDateTime,
  type CalendarDate,
  type CalendarDateTime,
} from "@internationalized/date";
import { Dialog } from "react-aria-components";
import type { RangeValue } from "react-aria-components";

import { CandidateProfileEditSection } from "@/components/admin/candidates/candidate-profile-edit-section";
import { PipelineStatusLabel } from "@/components/admin/candidates/pipeline-status-label";
import {
  candidateDisplayInitials,
  jdMatchChipColor,
} from "@/lib/candidates/candidate-display";
import {
  getStageColorClasses,
  getStageColorStyles,
  getSubStageTextColorClass,
  getSubStageTextColorStyle,
  isCandidateInOfferStage,
} from "@/lib/candidates/pipeline-status-styles";
import {
  type CandidateDbRow,
  candidateDbRowToTableRow,
} from "@/lib/candidates/db-row";
import { displayFromParsedPayload } from "@/lib/candidates/parsed-contact";
import {
  isEligibleForBulkMoveToInterview,
  isFailSubStageCode,
} from "@/lib/candidates/pipeline-phase";
import type { CandidateRow } from "@/lib/candidates/types";
import {
  isCustomTransitionAllowed,
  resolveCandidatePipelineIds,
  wasCandidateStageOrphaned,
  type StageMapping,
  type SubStage,
} from "@/lib/pipelines/transition-validator";
import {
  buildPipelineStageSubStageFilterOptions,
  countByStageMappingId,
  type PipelineStageSubStageFilterOption,
} from "@/lib/pipelines/jd-pipeline-filter-options";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";
import { buildCandidatesListSearchParams } from "@/lib/candidates/candidates-list-query";

const MONTH_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
];
const YEAR_OPTIONS = Array.from(
  { length: 2030 - 1990 + 1 },
  (_, i) => 1990 + i,
);

type Props = {
  jobDescriptionId: number;
  jobId: string;
  dbRows: CandidateDbRow[];
  loadState: "idle" | "loading" | "error" | "ok";
  onRefetch: (silent?: boolean) => void;
  /** HR may change pipeline status and schedule; chapter recruiters are view-only here. */
  canEditPipeline?: boolean;
  stageMappings: StageMapping[];
  subStages: SubStage[];
};

/** A candidate's resolved current stage mapping + sub-stage, with the full objects for display/eligibility checks. */
type ResolvedRowPipeline = {
  stageMappingId: string | null;
  subStateId: string | null;
  stageMapping: StageMapping | null;
  subStage: SubStage | null;
  orphaned: boolean;
};

function resolveRowPipeline(
  r: CandidateDbRow,
  stageMappings: StageMapping[],
  subStages: SubStage[],
): ResolvedRowPipeline {
  const { stageMappingId, subStateId } = resolveCandidatePipelineIds(
    r,
    stageMappings,
    subStages,
  );
  return {
    stageMappingId,
    subStateId,
    stageMapping: stageMappings.find((sm) => sm.id === stageMappingId) ?? null,
    subStage: subStages.find((ss) => ss.id === subStateId) ?? null,
    orphaned: wasCandidateStageOrphaned(r, stageMappings, subStages),
  };
}

/** All (stageMappingId, subStateId) targets reachable from a candidate's current position, per `isCustomTransitionAllowed`. */
function allowedStageTargets(
  fromStageMappingId: string,
  fromSubStateId: string,
  stageMappings: StageMapping[],
  subStages: SubStage[],
): Array<{ stageMapping: StageMapping; subStage: SubStage }> {
  const options: Array<{ stageMapping: StageMapping; subStage: SubStage }> = [];
  for (const sm of stageMappings) {
    const subs = subStages.filter(
      (ss) => ss.pipeline_stage_id === sm.pipeline_stage_id,
    );
    for (const ss of subs) {
      if (
        isCustomTransitionAllowed(
          stageMappings,
          subStages,
          fromStageMappingId,
          fromSubStateId,
          sm.id,
          ss.id,
        )
      ) {
        options.push({ stageMapping: sm, subStage: ss });
      }
    }
  }
  return options;
}

/** The "mark as failed" target sub-stage for a given stage: the sub-stage under that stage whose code matches the fail/reject naming convention, if any (see `isFailSubStageCode`). */
function findFailSubStage(
  stageMappingId: string | null,
  stageMappings: StageMapping[],
  subStages: SubStage[],
): SubStage | null {
  if (!stageMappingId) return null;
  const stageMapping = stageMappings.find((sm) => sm.id === stageMappingId);
  if (!stageMapping) return null;
  return (
    subStages.find(
      (ss) =>
        ss.pipeline_stage_id === stageMapping.pipeline_stage_id &&
        isFailSubStageCode(ss.code),
    ) ?? null
  );
}

function stageSubStageOptionKey(
  stageMappingId: string,
  subStateId: string,
): string {
  return `${stageMappingId}:${subStateId}`;
}

/**
 * Renders a (stageMapping, subStage) pair that has no legacy `CandidateStatus`
 * analog — i.e. a fully custom pipeline stage/sub-stage. Mirrors the markup
 * and color helpers of `PipelineStatusLabel`'s "inline" variant so custom and
 * legacy-analog options in the status filter dropdown look consistent.
 */
function PipelineStageSubStageInlineLabel({
  stageMapping,
  subStage,
}: {
  stageMapping: StageMapping;
  subStage: SubStage;
}) {
  const stageColor = stageMapping.pipeline_stages?.color ?? null;
  const surfaceClass = getStageColorClasses(stageColor, "badge");
  const surfaceStyle = getStageColorStyles(stageColor, "badge");
  const detailClass = getSubStageTextColorClass(
    subStage.code,
    subStage.is_passed,
    subStage.is_default,
    stageColor,
  );
  const detailStyle = getSubStageTextColorStyle(
    subStage.code,
    subStage.is_passed,
    subStage.is_default,
    stageColor,
  );
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 font-medium",
        surfaceClass,
      )}
      style={surfaceStyle}
    >
      <span className="text-xs text-foreground">
        {stageMapping.pipeline_stages?.label ?? stageMapping.pipeline_stages?.code}
      </span>
      <span className="mx-1 text-xs text-muted">·</span>
      <span className={cn("text-xs", detailClass)} style={detailStyle}>
        {subStage.label}
      </span>
    </span>
  );
}

/**
 * Fixed green wash for rows anywhere in the offer stage — intentionally
 * independent of the pipeline stage's configured DB color (which only
 * drives the status tag). Applied per-`Table.Cell` rather than `Table.Row`:
 * HeroUI table cells paint their own opaque background on top of the row,
 * so a row-level background never shows. `!important` keeps it visible
 * through the row's hover background too.
 */
const OFFER_ROW_CELL_CLASS = "!bg-emerald-100 dark:!bg-emerald-500/25";

/**
 * Responsive grid-column count for the stat-card row: one "Total CV" card
 * plus one per configured pipeline stage. Falls back to a fixed 4-column
 * layout (wrapping to multiple rows) once the stage count grows large,
 * rather than trying to fit an arbitrarily wide single row.
 */
function statCardGridClass(cardCount: number): string {
  switch (cardCount) {
    case 1:
      return "grid-cols-1";
    case 2:
      return "grid-cols-2";
    case 3:
      return "grid-cols-2 lg:grid-cols-3";
    case 4:
      return "grid-cols-2 lg:grid-cols-4";
    case 5:
      return "grid-cols-2 lg:grid-cols-5";
    case 6:
      return "grid-cols-2 lg:grid-cols-6";
    default:
      return "grid-cols-2 lg:grid-cols-4";
  }
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

function isoToCalendarDateTime(
  iso: string | null | undefined,
): CalendarDateTime | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return toCalendarDateTime(fromDate(d, getLocalTimeZone()));
}

function calendarDateTimeToIso(value: CalendarDateTime | null): string | null {
  if (!value) return null;
  return value.toDate(getLocalTimeZone()).toISOString();
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

/**
 * Resolves email/phone for search matching, preferring the lightweight
 * `parsed_contact_email` / `parsed_contact_phone` projections (used by the JD
 * pipeline fetch, which omits the full `parsed_payload` blob) and falling
 * back to `displayFromParsedPayload(r.parsed_payload)` for callers/paths that
 * still provide the full payload. `displayFromParsedPayload` returns the
 * literal placeholder "—" when a value is absent, so that case is normalized
 * to "" here to avoid accidentally matching a search for "—".
 */
function resolveContactForSearch(r: CandidateDbRow): {
  email: string;
  phone: string;
} {
  const hasLightweightEmail = r.parsed_contact_email !== undefined;
  const hasLightweightPhone = r.parsed_contact_phone !== undefined;
  const fallback =
    hasLightweightEmail && hasLightweightPhone
      ? null
      : displayFromParsedPayload(r.parsed_payload);
  const email = hasLightweightEmail
    ? (r.parsed_contact_email ?? "")
    : fallback!.email === "—"
      ? ""
      : fallback!.email;
  const phone = hasLightweightPhone
    ? (r.parsed_contact_phone ?? "")
    : fallback!.phone === "—"
      ? ""
      : fallback!.phone;
  return { email, phone };
}

function rowMatchesSearch(r: CandidateDbRow, q: string): boolean {
  if (!q.trim()) return true;
  const lower = q.trim().toLowerCase();
  const c = resolveContactForSearch(r);
  return (
    (r.name?.toLowerCase().includes(lower) ?? false) ||
    (r.role?.toLowerCase().includes(lower) ?? false) ||
    (r.skills?.some((s) => s.toLowerCase().includes(lower)) ?? false) ||
    c.email.toLowerCase().includes(lower) ||
    c.phone.toLowerCase().includes(lower)
  );
}

type PipelineTableRowProps = {
  r: CandidateDbRow;
  jobId: string;
  canEditPipeline: boolean;
  selected: Set<string>;
  toggleSelect: (id: string) => void;
  rowUpdating: string | null;
  resolveRow: (r: CandidateDbRow) => ResolvedRowPipeline;
  stageMappings: StageMapping[];
  subStages: SubStage[];
  offerStageSubStateIds: Set<string> | null;
  onStatusChange: (
    id: string,
    next: { toStageMappingId: string; toSubStateId: string },
  ) => Promise<void>;
  interviewDrafts: Record<string, CalendarDateTime | null>;
  setInterviewDrafts: Dispatch<
    SetStateAction<Record<string, CalendarDateTime | null>>
  >;
  saveInterviewTime: (
    id: string,
    value: CalendarDateTime | null,
  ) => Promise<void>;
  saveOnboardingTime: (
    id: string,
    value: CalendarDateTime | null,
  ) => Promise<void>;
  setRowPendingEdit: Dispatch<SetStateAction<CandidateDbRow | null>>;
  /** `editModal.open` — only `.open()` is called from within a row, so we pass
   * just that (stable, `useCallback`-wrapped) function rather than the whole
   * `useOverlayState()` object, which is a fresh literal on every render and
   * would defeat memoization below. */
  openEditModal: () => void;
  setRowPendingDelete: Dispatch<SetStateAction<CandidateDbRow | null>>;
  /** `deleteModal.open` — see {@link openEditModal}. */
  openDeleteModal: () => void;
};

/**
 * Custom equality for `React.memo` below, tailored to how this table's state
 * actually changes:
 * - `selected` and `rowUpdating` are compared by their effect on *this* row
 *   only (`.has(r.id)` / `=== r.id`), because the parent creates a new `Set`
 *   / string on every toggle or status change — comparing them by reference
 *   would force every row to re-render whenever any single row's selection
 *   or busy state changes.
 * - `interviewDrafts` is compared only for this row's two possible keys
 *   (`r.id` and `ob-${r.id}`), for the same reason.
 * - Everything else (including `r` itself) is compared by reference, which
 *   is safe here: `stageMappings`/`subStages`/`offerStageSubStateIds` come
 *   from `useMemo`, and the various callbacks come from `useCallback` /
 *   `useState` setters in the parent, so they're stable across renders that
 *   don't actually change them.
 */
function pipelineTableRowPropsAreEqual(
  prev: PipelineTableRowProps,
  next: PipelineTableRowProps,
): boolean {
  return (
    prev.r === next.r &&
    prev.jobId === next.jobId &&
    prev.canEditPipeline === next.canEditPipeline &&
    prev.selected.has(prev.r.id) === next.selected.has(next.r.id) &&
    prev.toggleSelect === next.toggleSelect &&
    (prev.rowUpdating === prev.r.id) === (next.rowUpdating === next.r.id) &&
    prev.resolveRow === next.resolveRow &&
    prev.stageMappings === next.stageMappings &&
    prev.subStages === next.subStages &&
    prev.offerStageSubStateIds === next.offerStageSubStateIds &&
    prev.onStatusChange === next.onStatusChange &&
    (prev.interviewDrafts[prev.r.id] ?? null) ===
      (next.interviewDrafts[next.r.id] ?? null) &&
    (prev.interviewDrafts[`ob-${prev.r.id}`] ?? null) ===
      (next.interviewDrafts[`ob-${next.r.id}`] ?? null) &&
    prev.setInterviewDrafts === next.setInterviewDrafts &&
    prev.saveInterviewTime === next.saveInterviewTime &&
    prev.saveOnboardingTime === next.saveOnboardingTime &&
    prev.setRowPendingEdit === next.setRowPendingEdit &&
    prev.openEditModal === next.openEditModal &&
    prev.setRowPendingDelete === next.setRowPendingDelete &&
    prev.openDeleteModal === next.openDeleteModal
  );
}

/**
 * A single row of the JD pipeline table, memoized so that unrelated state
 * changes in the parent (e.g. opening the inline profile-edit modal for one
 * candidate, typing in the search box) don't force every row's JSX tree to
 * re-render — see {@link pipelineTableRowPropsAreEqual}.
 */
const PipelineTableRow = memo(function PipelineTableRow({
  r,
  jobId,
  canEditPipeline,
  selected,
  toggleSelect,
  rowUpdating,
  resolveRow,
  stageMappings,
  subStages,
  offerStageSubStateIds,
  onStatusChange,
  interviewDrafts,
  setInterviewDrafts,
  saveInterviewTime,
  saveOnboardingTime,
  setRowPendingEdit,
  openEditModal,
  setRowPendingDelete,
  openDeleteModal,
}: PipelineTableRowProps) {
  const row: CandidateRow = candidateDbRowToTableRow(r);
  const skills = (r.skills ?? []).slice(0, 6).join(", ") || "—";
  const edu = [r.degree, r.school].filter(Boolean).join(" · ") || "—";
  const busy = rowUpdating === r.id;
  const resolved = resolveRow(r);
  const inOfferStage = isCandidateInOfferStage(
    {
      currentSubStateId: r.current_sub_state_id,
      pipelineStatus: r.pipeline_status,
      status: r.status,
    },
    offerStageSubStateIds,
  );
  const offerCellClass = inOfferStage ? OFFER_ROW_CELL_CLASS : "";
  const stageOptions =
    resolved.stageMappingId && resolved.subStateId
      ? allowedStageTargets(
          resolved.stageMappingId,
          resolved.subStateId,
          stageMappings,
          subStages,
        )
      : [];
  const currentOptionKey =
    resolved.stageMappingId && resolved.subStateId
      ? stageSubStageOptionKey(resolved.stageMappingId, resolved.subStateId)
      : undefined;
  return (
    <Table.Row id={r.id}>
      <Table.Cell className={offerCellClass}>
        <input
          type="checkbox"
          className="mt-1 size-4 rounded border-divider accent-accent"
          checked={selected.has(r.id)}
          disabled={!canEditPipeline}
          onChange={() => toggleSelect(r.id)}
          aria-label={`Select ${row.name}`}
        />
      </Table.Cell>
      <Table.Cell className={offerCellClass}>
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
            <p className="text-xs font-medium text-muted">{row.role}</p>
          </div>
        </div>
      </Table.Cell>
      <Table.Cell className={`text-center align-middle ${offerCellClass}`}>
        <div className="flex flex-col items-center tabular-nums">
          <span className="text-lg font-semibold leading-none text-foreground">
            {row.experienceYears}
          </span>
          <span className="text-[10px] font-medium text-muted">Years</span>
        </div>
      </Table.Cell>
      <Table.Cell className={offerCellClass}>
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
      <Table.Cell className={offerCellClass}>
        <p className="text-sm font-medium text-foreground">{row.degree}</p>
        <p className="text-[10px] font-bold uppercase tracking-tight text-muted">
          {row.school}
        </p>
      </Table.Cell>
      <Table.Cell className={offerCellClass}>
        <p className="max-w-[200px] text-sm text-foreground">
          {row.sourceLabel}
        </p>
      </Table.Cell>
      <Table.Cell className={`text-center align-middle ${offerCellClass}`}>
        <Chip
          size="sm"
          variant="soft"
          color={jdMatchChipColor(row)}
          className="min-w-[3.25rem] justify-center text-xs font-bold tabular-nums"
        >
          {row.jdMatchLabel}
        </Chip>
      </Table.Cell>
      <Table.Cell
        className={`focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 outline-none ${offerCellClass}`}
      >
        <Select
          value={currentOptionKey}
          isDisabled={!canEditPipeline || busy || stageOptions.length === 0}
          onChange={(key) => {
            if (typeof key === "string") {
              const [toStageMappingId, toSubStateId] = key.split(":");
              if (toStageMappingId && toSubStateId) {
                void onStatusChange(r.id, {
                  toStageMappingId,
                  toSubStateId,
                });
              }
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
            }
          }}
        >
          <Select.Trigger className="h-9 min-h-9 min-w-[11rem] justify-start gap-1 px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            {resolved.stageMapping && resolved.subStage ? (
              <span
                className={`truncate text-sm font-medium ${getSubStageTextColorClass(
                  resolved.subStage.code,
                  resolved.subStage.is_passed,
                  resolved.subStage.is_default,
                  resolved.stageMapping.pipeline_stages?.color,
                )}`}
              >
                {resolved.stageMapping.pipeline_stages?.label ??
                  resolved.stageMapping.pipeline_stages?.code}
                {" · "}
                {resolved.subStage.label}
              </span>
            ) : (
              <span className="text-sm text-muted">Unassigned</span>
            )}
            {resolved.orphaned ? (
              <span
                className="text-sm leading-none"
                title="Previous pipeline stage was removed — this status may be inaccurate"
              >
                ⚠
              </span>
            ) : null}
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {stageOptions.map(({ stageMapping, subStage }) => {
                const key = stageSubStageOptionKey(
                  stageMapping.id,
                  subStage.id,
                );
                return (
                  <ListBox.Item
                    key={key}
                    id={key}
                    textValue={`${stageMapping.pipeline_stages?.label ?? stageMapping.pipeline_stages?.code} - ${subStage.label}`}
                  >
                    <span
                      className={getSubStageTextColorClass(
                        subStage.code,
                        subStage.is_passed,
                        subStage.is_default,
                        stageMapping.pipeline_stages?.color,
                      )}
                    >
                      {stageMapping.pipeline_stages?.label ??
                        stageMapping.pipeline_stages?.code}
                      {" · "}
                      {subStage.label}
                    </span>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                );
              })}
            </ListBox>
          </Select.Popover>
        </Select>
      </Table.Cell>
      <Table.Cell
        className={`whitespace-nowrap text-sm text-foreground ${offerCellClass}`}
      >
        {formatSchedule(r.cv_uploaded_at ?? r.created_at) ?? "—"}
      </Table.Cell>
      <Table.Cell className={`max-w-[220px] align-top ${offerCellClass}`}>
        {r.status === "Interview" || r.status === "InterviewPassed" ? (
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-medium text-muted">
              Interview date
            </Label>
            <DatePicker
              value={interviewDrafts[r.id] ?? null}
              granularity="minute"
              hourCycle={24}
              shouldCloseOnSelect={false}
              isDisabled={!canEditPipeline || busy}
              onChange={(value) => {
                setInterviewDrafts((d) => ({
                  ...d,
                  [r.id]: value,
                }));
              }}
              onBlur={() => {
                void saveInterviewTime(r.id, interviewDrafts[r.id] ?? null);
              }}
              className="w-full min-w-[11rem]"
            >
              <DateField.Group
                fullWidth
                variant="primary"
                className="border-neutral-200 bg-white text-neutral-950 shadow-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
              >
                <DateField.InputContainer className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none]">
                  <DateField.Input>
                    {(segment) => <DateField.Segment segment={segment} />}
                  </DateField.Input>
                </DateField.InputContainer>
                <DateField.Suffix>
                  <DatePicker.Trigger className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-700 outline-none hover:bg-neutral-100 pressed:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10 dark:pressed:bg-white/10">
                    <DatePicker.TriggerIndicator />
                  </DatePicker.Trigger>
                </DateField.Suffix>
              </DateField.Group>
              <DatePicker.Popover>
                <Dialog className="outline-none">
                  <Calendar>
                    <Calendar.Header className="flex items-center gap-2">
                      <Calendar.NavButton slot="previous" />
                      <Calendar.Heading className="flex-1 text-center text-sm font-medium" />
                      <Calendar.NavButton slot="next" />
                    </Calendar.Header>
                    <Calendar.Grid weekdayStyle="short">
                      <Calendar.GridHeader>
                        {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                      </Calendar.GridHeader>
                      <Calendar.GridBody>
                        {(date) => (
                          <Calendar.Cell date={date}>
                            {({ formattedDate }) => (
                              <>
                                <Calendar.CellIndicator />
                                <span className="relative z-[1]">
                                  {formattedDate}
                                </span>
                              </>
                            )}
                          </Calendar.Cell>
                        )}
                      </Calendar.GridBody>
                    </Calendar.Grid>
                  </Calendar>
                </Dialog>
              </DatePicker.Popover>
            </DatePicker>
          </div>
        ) : r.status === "Offer" ? (
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-medium text-muted">
              Onboarding date
            </Label>
            <DatePicker
              value={interviewDrafts[`ob-${r.id}`] ?? null}
              granularity="minute"
              hourCycle={24}
              shouldCloseOnSelect={false}
              isDisabled={!canEditPipeline || busy}
              onChange={(value) => {
                setInterviewDrafts((d) => ({
                  ...d,
                  [`ob-${r.id}`]: value,
                }));
              }}
              onBlur={() => {
                void saveOnboardingTime(
                  r.id,
                  interviewDrafts[`ob-${r.id}`] ?? null,
                );
              }}
              className="w-full min-w-[11rem]"
            >
              <DateField.Group
                fullWidth
                variant="primary"
                className="border-neutral-200 bg-white text-neutral-950 shadow-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
              >
                <DateField.InputContainer className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none]">
                  <DateField.Input>
                    {(segment) => <DateField.Segment segment={segment} />}
                  </DateField.Input>
                </DateField.InputContainer>
                <DateField.Suffix>
                  <DatePicker.Trigger className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-700 outline-none hover:bg-neutral-100 pressed:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10 dark:pressed:bg-white/10">
                    <DatePicker.TriggerIndicator />
                  </DatePicker.Trigger>
                </DateField.Suffix>
              </DateField.Group>
              <DatePicker.Popover>
                <Dialog className="outline-none">
                  <Calendar>
                    <Calendar.Header className="flex items-center gap-2">
                      <Calendar.NavButton slot="previous" />
                      <Calendar.Heading className="flex-1 text-center text-sm font-medium" />
                      <Calendar.NavButton slot="next" />
                    </Calendar.Header>
                    <Calendar.Grid weekdayStyle="short">
                      <Calendar.GridHeader>
                        {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                      </Calendar.GridHeader>
                      <Calendar.GridBody>
                        {(date) => (
                          <Calendar.Cell date={date}>
                            {({ formattedDate }) => (
                              <>
                                <Calendar.CellIndicator />
                                <span className="relative z-[1]">
                                  {formattedDate}
                                </span>
                              </>
                            )}
                          </Calendar.Cell>
                        )}
                      </Calendar.GridBody>
                    </Calendar.Grid>
                  </Calendar>
                </Dialog>
              </DatePicker.Popover>
            </DatePicker>
          </div>
        ) : (
          <span className="text-xs text-muted">—</span>
        )}
      </Table.Cell>
      <Table.Cell className={`align-top text-center ${offerCellClass}`}>
        <div className="flex items-center justify-center gap-1">
          <Button
            size="sm"
            variant="secondary"
            className="px-2 min-w-0"
            isDisabled={!canEditPipeline || busy}
            onPress={() => {
              setRowPendingEdit(r);
              openEditModal();
            }}
            aria-label={`Edit ${row.name}`}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="px-2 text-danger hover:bg-danger/5 min-w-0"
            isDisabled={!canEditPipeline || busy}
            onPress={() => {
              setRowPendingDelete(r);
              openDeleteModal();
            }}
            aria-label={`Delete ${row.name}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </Table.Cell>
    </Table.Row>
  );
}, pipelineTableRowPropsAreEqual);

PipelineTableRow.displayName = "PipelineTableRow";

export function JdAppliedCandidatesPipeline({
  jobDescriptionId,
  jobId,
  dbRows,
  loadState,
  onRefetch,
  canEditPipeline = true,
  stageMappings,
  subStages,
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  const resolveRow = useCallback(
    (r: CandidateDbRow) => resolveRowPipeline(r, stageMappings, subStages),
    [stageMappings, subStages],
  );

  /** One status-filter option per (stageMapping, subStage) pair configured for this job. */
  const filterOptions = useMemo(
    () => buildPipelineStageSubStageFilterOptions(stageMappings, subStages),
    [stageMappings, subStages],
  );

  /** Ordered by `sequence_number`; drives both filter options and the per-stage stat cards. */
  const orderedStageMappings = useMemo(
    () => [...stageMappings].sort((a, b) => a.sequence_number - b.sequence_number),
    [stageMappings],
  );

  /** The "offer" stage's default ("currently offered") sub-stage — id used by "Move to offer". */
  const offerDefaultSubStage = useMemo(() => {
    const offerStage = stageMappings.find(
      (sm) => (sm.pipeline_stages?.code ?? "").toLowerCase() === "offer",
    );
    if (!offerStage) return null;
    return (
      subStages.find(
        (ss) =>
          ss.pipeline_stage_id === offerStage.pipeline_stage_id &&
          ss.is_default,
      ) ?? null
    );
  }, [stageMappings, subStages]);

  const offerStageMapping = useMemo(
    () =>
      stageMappings.find(
        (sm) => (sm.pipeline_stages?.code ?? "").toLowerCase() === "offer",
      ) ?? null,
    [stageMappings],
  );

  /** Every sub-stage id under the "offer" stage — used for the offer-row highlight. */
  const offerStageSubStateIds = useMemo(() => {
    if (!offerStageMapping) return null;
    return new Set(
      subStages
        .filter(
          (ss) => ss.pipeline_stage_id === offerStageMapping.pipeline_stage_id,
        )
        .map((ss) => ss.id),
    );
  }, [offerStageMapping, subStages]);

  const interviewStageMapping = useMemo(
    () =>
      stageMappings.find(
        (sm) => (sm.pipeline_stages?.code ?? "").toLowerCase() === "interview",
      ) ?? null,
    [stageMappings],
  );

  const interviewDefaultSubStage = useMemo(() => {
    if (!interviewStageMapping) return null;
    return (
      subStages.find(
        (ss) =>
          ss.pipeline_stage_id === interviewStageMapping.pipeline_stage_id &&
          ss.is_default,
      ) ?? null
    );
  }, [interviewStageMapping, subStages]);
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

  const [rowPendingEdit, setRowPendingEdit] = useState<CandidateDbRow | null>(
    null,
  );

  const editModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setRowPendingEdit(null);
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
      onRefetch(true);
    } catch (e) {
      setDeleteError(
        e instanceof Error ? e.message : "Failed to delete candidate.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }, [rowPendingDelete, deleteModal, onRefetch, supabase]);

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 350);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const selectedFilterOption: PipelineStageSubStageFilterOption | null =
    useMemo(
      () => filterOptions.find((opt) => opt.id === statusFilter) ?? null,
      [filterOptions, statusFilter],
    );
  const [uploadDateRange, setUploadDateRange] =
    useState<RangeValue<CalendarDate> | null>(null);
  const [calendarFocusedDate, setCalendarFocusedDate] = useState<CalendarDate>(
    () => today(getLocalTimeZone()),
  );
  const filterModal = useOverlayState();
  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) + (uploadDateRange ? 1 : 0);
  const clearAllFilters = () => {
    setStatusFilter("all");
    setUploadDateRange(null);
  };

  const [page, setPage] = usePageQueryParam();
  const skipInitialPageResetRef = useRef(true);

  const [onboardingDrafts, setOnboardingDrafts] = useState<
    Record<string, string>
  >({});

  const [interviewDrafts, setInterviewDrafts] = useState<
    Record<string, CalendarDateTime | null>
  >({});

  const offerModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        setOnboardingDrafts({});
        setPipelineError(null);
      }
    },
  });

  const [pageSize, setPageSize] = useState(10);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, [setPage]);

  useEffect(() => {
    setSelected(new Set());
  }, [dbRows]);

  useEffect(() => {
    if (skipInitialPageResetRef.current) {
      skipInitialPageResetRef.current = false;
      return;
    }
    setPage(1);
  }, [debouncedQuery, statusFilter, uploadDateRange]);

  // If the selected filter's stage/sub-stage was removed by a JD pipeline
  // edit (stale composite id), reset to "all" instead of silently showing
  // zero rows.
  useEffect(() => {
    if (statusFilter === "all") return;
    if (!filterOptions.some((opt) => opt.id === statusFilter)) {
      setStatusFilter("all");
    }
  }, [statusFilter, filterOptions]);

  useEffect(() => {
    if (uploadDateRange?.start) {
      setCalendarFocusedDate(uploadDateRange.start);
    }
  }, [uploadDateRange]);

  // Stage-count summary row: derived from the full `dbRows` (all=true, every
  // candidate for this JD) fetch, filtered by search/date only — not by the
  // stage/sub-stage filter itself, so selecting one stage doesn't zero out
  // every other stage's card.
  const statsSourceRows = useMemo(() => {
    let rows = dbRows;
    if (debouncedQuery.trim()) {
      rows = rows.filter((r) => rowMatchesSearch(r, debouncedQuery));
    }
    rows = rows.filter((r) => rowMatchesUploadDateRange(r, uploadDateRange));
    return rows;
  }, [dbRows, debouncedQuery, uploadDateRange]);

  const stageMappingCounts = useMemo(
    () =>
      countByStageMappingId(
        statsSourceRows.map((r) => resolveRow(r).stageMappingId),
        stageMappings,
      ),
    [statsSourceRows, resolveRow, stageMappings],
  );

  // The rendered table is its own backend-paginated query (scoped by
  // jobDescriptionId + the same filters, including the stage/sub-stage
  // filter), independent of the `dbRows` full fetch used for stats above.
  const [pageRows, setPageRows] = useState<CandidateDbRow[]>([]);
  const [pageTotal, setPageTotal] = useState(0);
  const [pageLoadState, setPageLoadState] = useState<
    "loading" | "error" | "ok"
  >("loading");

  const fetchPage = useCallback(async () => {
    setPageLoadState((s) => (s === "ok" ? "ok" : "loading"));
    try {
      const h = await getSessionAuthorizationHeaders(supabase);
      const params = buildCandidatesListSearchParams({
        jobDescriptionId,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        q: debouncedQuery.trim() || undefined,
        uploadFrom: uploadDateRange?.start.toString(),
        uploadTo: uploadDateRange?.end.toString(),
        stageMappingId: selectedFilterOption?.stageMapping.id,
        subStateId: selectedFilterOption?.subStage.id,
        legacyStatus: selectedFilterOption?.legacyStatus ?? undefined,
        contactFieldsOnly: true,
      });
      const res = await fetch(`/api/admin/candidates?${params}`, {
        credentials: "include",
        headers: { ...h },
      });
      if (!res.ok) {
        setPageLoadState("error");
        return;
      }
      const json = (await res.json()) as {
        candidates?: CandidateDbRow[];
        pagination?: { total: number };
      };
      setPageRows(json.candidates ?? []);
      setPageTotal(json.pagination?.total ?? json.candidates?.length ?? 0);
      setPageLoadState("ok");
    } catch {
      setPageLoadState("error");
    }
  }, [
    supabase,
    jobDescriptionId,
    page,
    debouncedQuery,
    uploadDateRange,
    selectedFilterOption,
    pageSize,
  ]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const paginatedRows = pageRows;
  const totalPages = Math.max(1, Math.ceil(pageTotal / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = pageTotal === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = startIdx === 0 ? 0 : startIdx - 1 + paginatedRows.length;

  const tableLoadState: "loading" | "error" | "empty" | "data" =
    loadState === "loading" || pageLoadState === "loading"
      ? "loading"
      : loadState === "error" || pageLoadState === "error"
        ? "error"
        : paginatedRows.length === 0
          ? "empty"
          : "data";

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
      selectedRows.every((r) => {
        const { stageMapping, subStage } = resolveRow(r);
        return isEligibleForBulkMoveToInterview(
          stageMapping?.pipeline_stages?.code ?? null,
          subStage?.code ?? null,
        );
      }),
    [selectedRows, resolveRow],
  );

  const bulkOfferEligible = useMemo(
    () =>
      selectedRows.length > 0 &&
      selectedRows.every((r) => {
        const { stageMapping, subStage } = resolveRow(r);
        return (
          (stageMapping?.pipeline_stages?.code ?? "").toLowerCase() ===
            "interview" && subStage?.is_passed === true
        );
      }),
    [selectedRows, resolveRow],
  );

  const bulkFailEligible = useMemo(
    () =>
      selectedRows.length > 0 &&
      selectedRows.every((r) => {
        const { stageMappingId } = resolveRow(r);
        return (
          findFailSubStage(stageMappingId, stageMappings, subStages) != null
        );
      }),
    [selectedRows, resolveRow, stageMappings, subStages],
  );

  const openOfferModal = useCallback(() => {
    const ids = selectedRows
      .filter((r) => {
        const { stageMapping, subStage } = resolveRow(r);
        return (
          (stageMapping?.pipeline_stages?.code ?? "").toLowerCase() ===
            "interview" && subStage?.is_passed === true
        );
      })
      .map((r) => r.id);
    if (ids.length === 0) return;
    const drafts: Record<string, string> = {};
    for (const id of ids) drafts[id] = "";
    setOnboardingDrafts(drafts);
    offerModal.open();
  }, [selectedRows, offerModal, resolveRow]);

  const confirmOffer = useCallback(async () => {
    if (!offerStageMapping || !offerDefaultSubStage) {
      setPipelineError("Offer stage is not configured for this job.");
      return;
    }
    const entries = Object.entries(onboardingDrafts);
    for (const [, v] of entries) {
      if (!v?.trim()) {
        setPipelineError(
          "Please set onboarding date and time for every candidate.",
        );
        return;
      }
    }
    const updates: {
      id: string;
      current_job_stage_mapping_id: string;
      current_sub_state_id: string;
      onboarding_at: string;
    }[] = [];
    for (const [id, local] of entries) {
      const iso = localDatetimeToIso(local);
      if (!iso) {
        setPipelineError("One or more onboarding times are invalid.");
        return;
      }
      updates.push({
        id,
        current_job_stage_mapping_id: offerStageMapping.id,
        current_sub_state_id: offerDefaultSubStage.id,
        onboarding_at: iso,
      });
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
  }, [
    onboardingDrafts,
    offerModal,
    onRefetch,
    postPipeline,
    offerStageMapping,
    offerDefaultSubStage,
  ]);

  const moveSelectedToInterview = useCallback(async () => {
    if (!bulkInterviewEligible) return;
    if (!interviewStageMapping || !interviewDefaultSubStage) {
      setPipelineError("Interview stage is not configured for this job.");
      return;
    }
    setPipelineBusy(true);
    setPipelineError(null);
    try {
      await postPipeline(
        selectedRows.map((r) => ({
          id: r.id,
          current_job_stage_mapping_id: interviewStageMapping.id,
          current_sub_state_id: interviewDefaultSubStage.id,
        })),
      );
      onRefetch(true);
    } catch (e) {
      setPipelineError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setPipelineBusy(false);
    }
  }, [
    bulkInterviewEligible,
    onRefetch,
    postPipeline,
    selectedRows,
    interviewStageMapping,
    interviewDefaultSubStage,
  ]);

  const markSelectedFailed = useCallback(async () => {
    if (!bulkFailEligible) return;
    setPipelineBusy(true);
    setPipelineError(null);
    try {
      const updates = selectedRows.map((r) => {
        const { stageMappingId } = resolveRow(r);
        const failSubStage = findFailSubStage(
          stageMappingId,
          stageMappings,
          subStages,
        );
        if (!stageMappingId || !failSubStage) {
          throw new Error(
            `No failure sub-stage configured for candidate ${r.id}'s current stage.`,
          );
        }
        return {
          id: r.id,
          current_job_stage_mapping_id: stageMappingId,
          current_sub_state_id: failSubStage.id,
        };
      });
      await postPipeline(updates);
      onRefetch(true);
    } catch (e) {
      setPipelineError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setPipelineBusy(false);
    }
  }, [
    bulkFailEligible,
    onRefetch,
    postPipeline,
    selectedRows,
    resolveRow,
    stageMappings,
    subStages,
  ]);

  const onStatusChange = useCallback(
    async (
      id: string,
      next: { toStageMappingId: string; toSubStateId: string },
    ) => {
      setRowUpdating(id);
      setPipelineError(null);
      try {
        await postPipeline([
          {
            id,
            current_job_stage_mapping_id: next.toStageMappingId,
            current_sub_state_id: next.toSubStateId,
          },
        ]);
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
    async (id: string, value: CalendarDateTime | null) => {
      setPipelineError(null);
      setRowUpdating(id);
      try {
        const iso = calendarDateTimeToIso(value);
        await patchTimeline(id, { interview_at: iso });
        onRefetch(true);
      } catch (e) {
        setPipelineError(e instanceof Error ? e.message : "Update failed.");
      } finally {
        setRowUpdating(null);
      }
    },
    [onRefetch, patchTimeline],
  );

  const saveOnboardingTime = useCallback(
    async (id: string, value: CalendarDateTime | null) => {
      setPipelineError(null);
      setRowUpdating(id);
      try {
        const iso = calendarDateTimeToIso(value);
        await patchTimeline(id, { onboarding_at: iso });
        onRefetch(true);
      } catch (e) {
        setPipelineError(e instanceof Error ? e.message : "Update failed.");
      } finally {
        setRowUpdating(null);
      }
    },
    [onRefetch, patchTimeline],
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
          next[r.id] = isoToCalendarDateTime(r.interview_at);
          changed = true;
        }
        const obKey = `ob-${r.id}`;
        if (r.status === "Offer" && next[obKey] === undefined) {
          next[obKey] = isoToCalendarDateTime(r.onboarding_at);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [dbRows]);


  const filtersElement = (
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
      placeholder="All statuses"
      className="w-full"
    >
      <Label className="mb-1 block text-xs font-semibold text-muted">Status</Label>
      <Select.Trigger className="w-full h-9 rounded-xl border border-divider bg-surface-secondary/40 text-xs">
        {statusFilter !== "all" && selectedFilterOption ? (
          selectedFilterOption.legacyStatus ? (
            <PipelineStatusLabel
              status={selectedFilterOption.legacyStatus}
              variant="inline"
              uppercase={false}
              stageMappings={stageMappings}
              subStages={subStages}
            />
          ) : (
            <PipelineStageSubStageInlineLabel
              stageMapping={selectedFilterOption.stageMapping}
              subStage={selectedFilterOption.subStage}
            />
          )
        ) : (
          <Select.Value />
        )}
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox className="p-1 border border-divider rounded-2xl bg-surface-primary shadow-xl max-h-[300px] overflow-y-auto">
          <ListBox.Item id="all" textValue="All statuses" className="text-xs font-semibold py-1.5 px-2.5 rounded-lg hover:bg-surface-secondary cursor-pointer">
            All statuses
            <ListBox.ItemIndicator />
          </ListBox.Item>
          {filterOptions.map((opt) => (
            <ListBox.Item
              key={opt.id}
              id={opt.id}
              textValue={`${opt.stageMapping.pipeline_stages?.label ?? opt.stageMapping.pipeline_stages?.code} - ${opt.subStage.label}`}
              className="text-xs font-semibold py-1.5 px-2.5 rounded-lg hover:bg-surface-secondary cursor-pointer"
            >
              {opt.legacyStatus ? (
                <PipelineStatusLabel
                  status={opt.legacyStatus}
                  variant="inline"
                  uppercase={false}
                  stageMappings={stageMappings}
                  subStages={subStages}
                />
              ) : (
                <PipelineStageSubStageInlineLabel
                  stageMapping={opt.stageMapping}
                  subStage={opt.subStage}
                />
              )}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );

  const dateRangeElement = (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-semibold text-muted">Upload date</Label>
      <div className="flex items-center gap-2">
      <DateRangePicker
        value={uploadDateRange as any}
        onChange={(next) => setUploadDateRange(next as any)}
        className="w-full"
      >
        <DateField.Group
          fullWidth
          variant="primary"
          className="border-divider bg-surface-secondary/40 text-foreground shadow-sm h-9 rounded-xl py-1 px-3 text-xs"
        >
          <DateField.InputContainer className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none]">
            <DateField.Input slot="start" className="outline-none">
              {(segment) => <DateField.Segment segment={segment} />}
            </DateField.Input>
            <DateRangePicker.RangeSeparator className="shrink-0 px-0.5 text-muted" />
            <DateField.Input slot="end" className="outline-none">
              {(segment) => <DateField.Segment segment={segment} />}
            </DateField.Input>
          </DateField.InputContainer>
          <DateField.Suffix>
            <DateRangePicker.Trigger className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted outline-none hover:bg-surface-tertiary">
              <CalendarIcon className="h-3.5 w-3.5" />
            </DateRangePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <DateRangePicker.Popover>
          <Dialog className="outline-none border border-divider rounded-2xl bg-surface-primary p-4 shadow-2xl z-50">
            <RangeCalendar
              focusedValue={calendarFocusedDate as any}
              onFocusChange={(next) => setCalendarFocusedDate(next as any)}
            >
              <RangeCalendar.Header className="flex items-center justify-between mb-2 gap-2">
                <RangeCalendar.NavButton slot="previous" />
                <div className="flex flex-1 items-center gap-1 justify-center">
                  <select
                    id="jd-cal-month"
                    value={calendarFocusedDate.month}
                    onChange={(e) =>
                      setCalendarFocusedDate((p) =>
                        p.set({
                          month: Number(e.target.value),
                          day: 1,
                        }),
                      )
                    }
                    className="h-7 rounded-lg border border-divider bg-surface-secondary px-1 text-[11px] font-semibold outline-none"
                  >
                    {MONTH_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <select
                    id="jd-cal-year"
                    value={calendarFocusedDate.year}
                    onChange={(e) =>
                      setCalendarFocusedDate((p) =>
                        p.set({ year: Number(e.target.value), day: 1 }),
                      )
                    }
                    className="h-7 rounded-lg border border-divider bg-surface-secondary px-1 text-[11px] font-semibold outline-none"
                  >
                    {YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <RangeCalendar.NavButton slot="next" />
              </RangeCalendar.Header>
              <RangeCalendar.Grid weekdayStyle="short" className="border-collapse">
                <RangeCalendar.GridHeader>
                  {(day) => (
                    <RangeCalendar.HeaderCell className="text-[10px] text-muted font-bold py-1">{day}</RangeCalendar.HeaderCell>
                  )}
                </RangeCalendar.GridHeader>
                <RangeCalendar.GridBody>
                  {(date) => (
                    <RangeCalendar.Cell date={date} className="w-8 h-8 text-center text-xs font-medium cursor-pointer relative p-0">
                      {({ formattedDate }) => (
                        <>
                          <RangeCalendar.CellIndicator className="absolute inset-0 bg-accent/10 rounded-lg" />
                          <span className="relative z-[1] flex items-center justify-center h-full w-full rounded-lg hover:bg-accent/15">{formattedDate}</span>
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
      {uploadDateRange && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2.5 border border-divider rounded-xl text-xs font-semibold text-muted"
          onPress={() => setUploadDateRange(null)}
        >
          Clear
        </Button>
      )}
      </div>
    </div>
  );

  const bulkActionsElement = selected.size > 0 ? (
    <div className="flex flex-wrap items-center gap-3 border border-accent/25 bg-accent/5 p-3 rounded-xl">
      <span className="text-xs font-semibold text-accent">
        {selected.size} selected candidates
      </span>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          className="bg-accent text-white"
          isDisabled={!canEditPipeline || pipelineBusy || !bulkInterviewEligible}
          onPress={() => void moveSelectedToInterview()}
        >
          Move to interview
        </Button>
        <Button
          size="sm"
          variant="primary"
          className="bg-accent text-white"
          isDisabled={!canEditPipeline || pipelineBusy || !bulkOfferEligible}
          onPress={openOfferModal}
        >
          Move to offer…
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="border border-divider bg-surface-primary"
          isDisabled={!canEditPipeline || pipelineBusy || !bulkFailEligible}
          onPress={() => void markSelectedFailed()}
        >
          Mark failed
        </Button>
      </div>
    </div>
  ) : null;

  const pipelineStats = [
    {
      label: "Total Candidates",
      value: dbRows.length,
      icon: <UsersIcon className="h-4.5 w-4.5" />,
      description: "Applied to opening"
    },
    ...orderedStageMappings.map((sm) => {
      const label = sm.pipeline_stages?.label ?? sm.pipeline_stages?.code ?? "Stage";
      const value = stageMappingCounts[sm.id] ?? 0;
      return {
        label,
        value,
        description: "Candidates in stage",
        icon: <LayersIcon className="h-4.5 w-4.5" />
      };
    })
  ];

  return (
    <div className="mt-3 flex flex-col gap-4">
      {pipelineError ? (
        <p className="text-sm text-danger">{pipelineError}</p>
      ) : null}

      <DataTableToolbar
        searchQuery={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search by name, role, school, or degree…"
        filters={
          <DataTableFilterButton
            onPress={filterModal.open}
            activeCount={activeFilterCount}
          />
        }
        onRefresh={() => {
          onRefetch(false);
          void fetchPage();
        }}
        isRefreshing={loadState === "loading" || pageLoadState === "loading"}
      />
      <DataTableFilterModal
        isOpen={filterModal.isOpen}
        onOpenChange={filterModal.setOpen}
        onClear={activeFilterCount > 0 ? clearAllFilters : undefined}
      >
        {filtersElement}
        {dateRangeElement}
      </DataTableFilterModal>

      {bulkActionsElement}

      <DataTableStats stats={pipelineStats} />

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
              <Table.Column className="text-center w-[110px]">
                Action
              </Table.Column>
            </Table.Header>
            <Table.Body
              key={
                tableLoadState === "loading"
                  ? "pipeline-table-loading"
                  : tableLoadState === "error"
                    ? "pipeline-table-error"
                    : tableLoadState === "empty"
                      ? "pipeline-table-empty"
                      : "pipeline-table-data"
              }
            >
              {tableLoadState === "loading" ? (
                <Table.Row id="pipeline-row-loading">
                  <Table.Cell
                    className="py-8 text-center text-muted"
                    colSpan={11}
                  >
                    Loading…
                  </Table.Cell>
                </Table.Row>
              ) : tableLoadState === "error" ? (
                <Table.Row id="pipeline-row-error">
                  <Table.Cell className="py-8 text-center" colSpan={11}>
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-sm text-danger">
                        Could not load candidates. Try again later.
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onPress={() => {
                          onRefetch();
                          void fetchPage();
                        }}
                      >
                        Retry load
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ) : tableLoadState === "empty" && dbRows.length === 0 ? (
                <Table.Row id="pipeline-row-empty">
                  <Table.Cell
                    className="py-8 text-center text-muted"
                    colSpan={11}
                  >
                    No candidates yet. Link a job opening to this JD and add
                    applicants from the Candidates page or the JD pipeline.
                  </Table.Cell>
                </Table.Row>
              ) : tableLoadState === "empty" ? null : (
                paginatedRows.map((r) => (
                  <PipelineTableRow
                    key={r.id}
                    r={r}
                    jobId={jobId}
                    canEditPipeline={canEditPipeline}
                    selected={selected}
                    toggleSelect={toggleSelect}
                    rowUpdating={rowUpdating}
                    resolveRow={resolveRow}
                    stageMappings={stageMappings}
                    subStages={subStages}
                    offerStageSubStateIds={offerStageSubStateIds}
                    onStatusChange={onStatusChange}
                    interviewDrafts={interviewDrafts}
                    setInterviewDrafts={setInterviewDrafts}
                    saveInterviewTime={saveInterviewTime}
                    saveOnboardingTime={saveOnboardingTime}
                    setRowPendingEdit={setRowPendingEdit}
                    openEditModal={editModal.open}
                    setRowPendingDelete={setRowPendingDelete}
                    openDeleteModal={deleteModal.open}
                  />
                ))
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

      {pageTotal > 0 ? (
        <DataTablePagination
          page={safePage}
          totalPages={totalPages}
          setPage={setPage}
          startIdx={startIdx}
          endIdx={endIdx}
          totalCount={pageTotal}
          itemTypeLabel="candidates"
          pageSize={pageSize}
          setPageSize={handlePageSizeChange}
        />
      ) : null}

      {pageTotal === 0 && tableLoadState !== "loading" ? (
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

      <Modal.Backdrop
        isOpen={editModal.isOpen}
        onOpenChange={editModal.setOpen}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-2xl overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider px-5 py-4 bg-muted/10">
              <Modal.Heading className="text-lg font-bold text-foreground">
                {rowPendingEdit
                  ? candidateDbRowToTableRow(rowPendingEdit).name
                  : "Edit candidate"}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="max-h-[75vh] overflow-y-auto p-0">
              {rowPendingEdit ? (
                <CandidateProfileEditSection
                  candidateId={rowPendingEdit.id}
                  dbRow={rowPendingEdit}
                  canEdit={!!canEditPipeline}
                  isPreview={false}
                  dbLoadState="ok"
                  startInEditMode
                  onSaved={() => {
                    editModal.close();
                    onRefetch(true);
                  }}
                />
              ) : null}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
