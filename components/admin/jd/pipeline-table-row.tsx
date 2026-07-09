import { memo, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import {
  Avatar,
  Button,
  Calendar,
  Chip,
  DateField,
  DatePicker,
  Label,
  ListBox,
  Select,
  Table,
} from "@heroui/react";
import type { CalendarDateTime } from "@internationalized/date";
import { Dialog } from "react-aria-components";

import {
  candidateDisplayInitials,
  jdMatchChipColor,
} from "@/lib/candidates/candidate-display";
import {
  getSubStageTextColorClass,
  isCandidateInOfferStage,
} from "@/lib/candidates/pipeline-status-styles";
import {
  type CandidateDbRow,
  candidateDbRowToTableRow,
} from "@/lib/candidates/db-row";
import type { CandidateRow } from "@/lib/candidates/types";
import type {
  StageMapping,
  SubStage,
} from "@/lib/pipelines/transition-validator";
import {
  allowedStageTargets,
  formatSchedule,
  stageSubStageOptionKey,
  type ResolvedRowPipeline,
} from "@/lib/pipelines/jd-pipeline-row-helpers";

/**
 * Fixed green wash for rows anywhere in the offer stage — intentionally
 * independent of the pipeline stage's configured DB color (which only
 * drives the status tag). Applied per-`Table.Cell` rather than `Table.Row`:
 * HeroUI table cells paint their own opaque background on top of the row,
 * so a row-level background never shows. `!important` keeps it visible
 * through the row's hover background too.
 */
const OFFER_ROW_CELL_CLASS = "!bg-emerald-100 dark:!bg-emerald-500/25";

export type PipelineTableRowProps = {
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
export const PipelineTableRow = memo(function PipelineTableRow({
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
          className="mt-1 size-4 rounded border-divider accent-accent cursor-pointer disabled:cursor-not-allowed"
          checked={selected.has(r.id)}
          disabled={!canEditPipeline}
          onChange={() => toggleSelect(r.id)}
          aria-label={`Select ${row.name}`}
        />
      </Table.Cell>
      <Table.Cell className={offerCellClass}>
        <div className="flex items-center gap-4">
          <Avatar className="size-10 shrink-0" size="md">
            {row.avatarUrl ? <Avatar.Image alt="" src={row.avatarUrl} /> : null}
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
        <p className="text-sm font-medium text-foreground">
          {row.school || "—"}
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
          <Select.Trigger className="h-9 min-h-9 min-w-[8rem] justify-start gap-1 px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
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
      <Table.Cell className={`text-xs text-foreground ${offerCellClass}`}>
        {formatSchedule(r.cv_uploaded_at ?? r.created_at) ?? "—"}
      </Table.Cell>
      <Table.Cell className={`align-middle ${offerCellClass}`}>
        {r.status === "Interview" || r.status === "InterviewPassed" ? (
          <div className="flex flex-col items-center gap-1">
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
              className="w-full min-w-[9rem]"
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
                        {(day) => (
                          <Calendar.HeaderCell>{day}</Calendar.HeaderCell>
                        )}
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
          <div className="flex flex-col items-center gap-1">
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
              className="w-full min-w-[9rem]"
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
                        {(day) => (
                          <Calendar.HeaderCell>{day}</Calendar.HeaderCell>
                        )}
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
      <Table.Cell className={`align-middle text-center ${offerCellClass}`}>
        <div className="flex items-center justify-center gap-1">
          <Button
            size="sm"
            variant="secondary"
            className="min-w-0"
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
            className="text-danger hover:bg-danger/5 min-w-0"
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
