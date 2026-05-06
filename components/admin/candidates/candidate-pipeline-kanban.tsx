"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  AlertDialog,
  Avatar,
  Button,
  Card,
  Chip,
  Spinner,
  Tabs,
  Tooltip,
  cn,
} from "@heroui/react";

import { AddCandidateModal } from "@/components/admin/candidates/add-candidate-modal";
import { CandidatePipelineFiltersCard } from "@/components/admin/candidates/candidate-pipeline-filters-card";
import { CvVersionComparisonDrawer } from "@/components/admin/candidates/cv-version-comparison-drawer";
import { useCandidatePipelineState } from "@/components/admin/candidates/use-candidate-pipeline-state";
import {
  candidateDisplayInitials,
  candidateStatusChipColor,
  jdMatchChipColor,
} from "@/lib/candidates/candidate-display";
import {
  PIPELINE_PHASES,
  PIPELINE_STATUS_DISPLAY_ORDER,
  candidateStatusMajorPhase,
  candidateStatusShortLabel,
} from "@/lib/candidates/pipeline-phase";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { ALL_PIPELINE_STATUSES } from "@/lib/candidates/pipeline-allowed-transitions";
import type { CandidateRow, CandidateStatus } from "@/lib/candidates/types";

type Props = {
  initialRows?: CandidateDbRow[];
};

const COL_PREFIX = "col:";

/** Prefer Kanban column rects so dropping onto stacked cards still hits the column. */
function kanbanColumnCollisionDetection(prefix: string): CollisionDetection {
  return (args) => {
    const columnContainers = args.droppableContainers.filter((c) =>
      String(c.id).startsWith(prefix),
    );
    const pointerHits = pointerWithin({ ...args, droppableContainers: columnContainers });
    if (pointerHits.length > 0) return pointerHits;
    return rectIntersection({ ...args, droppableContainers: columnContainers });
  };
}

function columnDroppableId(status: CandidateStatus): string {
  return `${COL_PREFIX}${status}`;
}

function parseColumnDroppableId(id: string | number | undefined): CandidateStatus | null {
  if (id == null) return null;
  const s = String(id);
  if (!s.startsWith(COL_PREFIX)) return null;
  const status = s.slice(COL_PREFIX.length) as CandidateStatus;
  return ALL_PIPELINE_STATUSES.includes(status) ? status : null;
}

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
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
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
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function GripIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <circle cx="9" cy="8" r="1.25" />
      <circle cx="15" cy="8" r="1.25" />
      <circle cx="9" cy="12" r="1.25" />
      <circle cx="15" cy="12" r="1.25" />
      <circle cx="9" cy="16" r="1.25" />
      <circle cx="15" cy="16" r="1.25" />
    </svg>
  );
}

function KanbanColumn({
  status,
  columnTitle,
  children,
  count,
}: {
  status: CandidateStatus;
  columnTitle: string;
  children: React.ReactNode;
  count: number;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDroppableId(status),
    data: { status },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[308px] shrink-0 flex-col rounded-xl border border-divider bg-surface-secondary/35",
        isOver && "ring-2 ring-accent ring-offset-2 ring-offset-background",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-divider px-3 py-2.5">
        <Chip
          size="sm"
          variant="soft"
          color={candidateStatusChipColor(status)}
          className="text-[10px] font-bold uppercase"
        >
          {columnTitle}
        </Chip>
        <span className="text-xs font-semibold tabular-nums text-muted">{count}</span>
      </div>
      <div className="flex min-h-[240px] flex-col gap-2 overflow-y-auto p-2">{children}</div>
    </div>
  );
}

function CandidateKanbanCard({
  row,
  onOpen,
  onDelete,
}: {
  row: CandidateRow;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: row.id,
    data: { row },
    /** Avoid role="button" on a container that holds real buttons (View / Delete). */
    attributes: { role: "group", tabIndex: 0 },
  });

  const style = transform
    ? {
        transform: CSS.Transform.toString(transform),
      }
    : undefined;

  const visibleSkills = row.skills.slice(0, 5);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      aria-label={`Drag ${row.name} to change pipeline status`}
      className={cn(
        "touch-none transition-[opacity,transform] duration-200",
        "cursor-grab outline-none active:cursor-grabbing",
        "rounded-xl focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isDragging && "z-10 opacity-[0.88]",
      )}
    >
      <Card
        variant="secondary"
        className={cn(
          "group relative overflow-hidden rounded-xl border border-divider/70 bg-background",
          "shadow-sm transition-[box-shadow,border-color] duration-200",
          "hover:border-divider hover:shadow-md",
          isDragging && "border-accent/40 shadow-lg ring-2 ring-accent/25",
        )}
      >
        <Card.Content className="relative gap-0 p-0">
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-[#0c2844] via-[#143a58] to-[#1b3b5a]"
            aria-hidden
          />
          <div className="flex min-h-[7.5rem] pl-[3px]">
            <div
              className="flex w-6 shrink-0 flex-col items-center justify-center border-r border-divider/40 bg-muted/15 text-muted select-none"
              aria-hidden
            >
              <GripIcon className="size-3 opacity-55 group-hover:opacity-90" />
            </div>

            <div className="relative min-w-0 flex-1 px-2.5 pb-2.5 pt-2">
              <div
                className="absolute right-1 top-1 z-10 flex gap-0 rounded-lg bg-background/90 p-0.5 shadow-sm ring-1 ring-divider/40 backdrop-blur-sm dark:bg-background/80"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Tooltip delay={0}>
                  <Button
                    isIconOnly
                    variant="ghost"
                    size="sm"
                    className="size-7 min-w-7 text-accent hover:bg-accent/10"
                    aria-label="View details"
                    onPress={onOpen}
                  >
                    <EyeIcon className="size-4" />
                  </Button>
                  <Tooltip.Content placement="top" showArrow>
                    <Tooltip.Arrow />
                    <p>View details</p>
                  </Tooltip.Content>
                </Tooltip>
                <Tooltip delay={0}>
                  <Button
                    isIconOnly
                    variant="ghost"
                    size="sm"
                    className="size-7 min-w-7 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                    aria-label="Delete CV"
                    onPress={onDelete}
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                  <Tooltip.Content placement="top" showArrow>
                    <Tooltip.Arrow />
                    <p>Delete CV</p>
                  </Tooltip.Content>
                </Tooltip>
              </div>

              <div className="flex gap-2 pr-[4.25rem]">
                <Avatar className="size-9 shrink-0" size="sm">
                  {row.avatarUrl ? (
                    <Avatar.Image alt="" src={row.avatarUrl} />
                  ) : null}
                  <Avatar.Fallback className="text-[10px] font-semibold">
                    {candidateDisplayInitials(row.name)}
                  </Avatar.Fallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold leading-snug text-foreground [overflow-wrap:anywhere] line-clamp-2">
                    {row.name}
                  </p>
                  <p className="mt-1 break-words text-[12px] leading-snug text-muted line-clamp-2 [overflow-wrap:anywhere]">
                    {row.role}
                  </p>
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                <span className="text-muted">Match</span>
                <Chip
                  size="sm"
                  variant="soft"
                  color={jdMatchChipColor(row)}
                  className="h-5 min-w-[2rem] px-1.5 text-[10px] font-bold tabular-nums"
                >
                  {row.jdMatchLabel}
                </Chip>
                <span className="select-none text-muted opacity-50">·</span>
                <span className="tabular-nums text-foreground">
                  <span className="font-medium">{row.experienceYears}</span>
                  <span className="text-muted"> yrs</span>
                </span>
              </div>

              {visibleSkills.length > 0 || row.moreSkills ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {visibleSkills.map((s) => (
                    <span
                      key={s}
                      className="max-w-[9rem] truncate rounded border border-divider/70 bg-transparent px-1.5 py-px text-[10px] font-medium text-muted"
                      title={s}
                    >
                      {s}
                    </span>
                  ))}
                  {row.moreSkills ? (
                    <span className="rounded border border-dashed border-divider/80 px-1.5 py-px text-[10px] tabular-nums text-muted">
                      +{row.moreSkills}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}

function CandidateKanbanCardOverlay({ row }: { row: CandidateRow }) {
  const visibleSkills = row.skills.slice(0, 5);
  return (
    <Card
      variant="secondary"
      className="w-[300px] cursor-grabbing overflow-hidden rounded-xl border border-divider bg-background shadow-2xl ring-2 ring-accent/30"
    >
      <Card.Content className="relative gap-0 p-0">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-[#0c2844] via-[#143a58] to-[#1b3b5a]"
          aria-hidden
        />
        <div className="flex gap-2 pl-[calc(3px+0.625rem)] pr-3 pb-2.5 pt-2.5">
          <Avatar className="size-9 shrink-0" size="sm">
            {row.avatarUrl ? <Avatar.Image alt="" src={row.avatarUrl} /> : null}
            <Avatar.Fallback className="text-[10px] font-semibold">
              {candidateDisplayInitials(row.name)}
            </Avatar.Fallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold leading-snug line-clamp-2 [overflow-wrap:anywhere]">
              {row.name}
            </p>
            <p className="mt-1 break-words text-[12px] leading-snug text-muted line-clamp-2 [overflow-wrap:anywhere]">
              {row.role}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <span className="text-muted">Match</span>
              <Chip
                size="sm"
                variant="soft"
                color={jdMatchChipColor(row)}
                className="h-5 px-1.5 text-[10px] font-bold tabular-nums"
              >
                {row.jdMatchLabel}
              </Chip>
              <span className="text-muted opacity-50">·</span>
              <span className="tabular-nums text-foreground">
                <span className="font-medium">{row.experienceYears}</span>
                <span className="text-muted"> yrs</span>
              </span>
            </div>
            {visibleSkills.length > 0 || row.moreSkills ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {visibleSkills.map((s) => (
                  <span
                    key={s}
                    className="max-w-[9rem] truncate rounded border border-divider/70 px-1.5 py-px text-[10px] text-muted"
                    title={s}
                  >
                    {s}
                  </span>
                ))}
                {row.moreSkills ? (
                  <span className="rounded border border-dashed border-divider/80 px-1.5 py-px text-[10px] text-muted">
                    +{row.moreSkills}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </Card.Content>
    </Card>
  );
}

export function CandidatePipelineKanban({ initialRows }: Props) {
  const [draggingRow, setDraggingRow] = useState<CandidateRow | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const {
    setPage,
    query,
    setQuery,
    statusKey,
    setStatusKey,
    jdFilterKey,
    setJdFilterKey,
    uploadDateRangeFilter,
    setUploadDateRangeFilter,
    calendarFocusedDate,
    setCalendarFocusedDate,
    drawerOpen,
    setDrawerOpen,
    activeRow,
    addModalOpen,
    setAddModalOpen,
    deleteDialogOpen,
    setDeleteDialogOpen,
    rowPendingDelete,
    setRowPendingDelete,
    deleteInProgress,
    deleteError,
    setDeleteError,
    statusUpdateBusy,
    statusUpdateError,
    cvHistoryRows,
    cvHistoryLoading,
    cvHistoryError,
    dbLoadState,
    fetchCandidates,
    statusFilterOptions,
    jdFilterOptions,
    filteredRows,
    tableSourceRows,
    activeDbRow,
    noResultsForUploadDate,
    openRow,
    drawerStatusOptions,
    patchCandidateStatus,
    confirmDeleteCandidate,
  } = useCandidatePipelineState(initialRows);

  const rowsByStatus = useMemo(() => {
    const map = new Map<CandidateStatus, CandidateRow[]>();
    for (const s of PIPELINE_STATUS_DISPLAY_ORDER) {
      map.set(s, []);
    }
    for (const row of filteredRows) {
      const bucket = map.get(row.status);
      if (bucket) bucket.push(row);
    }
    return map;
  }, [filteredRows]);

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    const row = filteredRows.find((r) => r.id === id) ?? null;
    setDraggingRow(row);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingRow(null);
    const { active, over } = event;
    if (!over) return;

    const candidateId = String(active.id);
    const row = filteredRows.find((r) => r.id === candidateId);
    if (!row) return;

    const overId = String(over.id);
    let targetStatus = parseColumnDroppableId(overId);
    if (!targetStatus && over.data?.current && typeof over.data.current === "object") {
      const cur = over.data.current as { status?: CandidateStatus };
      if (cur.status && ALL_PIPELINE_STATUSES.includes(cur.status)) {
        targetStatus = cur.status;
      }
    }

    if (!targetStatus || targetStatus === row.status) return;

    void patchCandidateStatus(candidateId, targetStatus);
  }

  const emptyKanban =
    dbLoadState === "ok" &&
    filteredRows.length === 0 &&
    tableSourceRows.length === 0;

  const phaseHeadingCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of PIPELINE_PHASES) {
      map.set(p.id, 0);
    }
    for (const row of filteredRows) {
      const phaseId = candidateStatusMajorPhase(row.status);
      map.set(phaseId, (map.get(phaseId) ?? 0) + 1);
    }
    return map;
  }, [filteredRows]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Smart Hire Suite
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Active Talent Pool
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Board view — drag cards between columns to update pipeline status. Drag again anytime to
            fix a wrong drop.{" "}
            <Link
              href="/admin/candidates"
              className="font-semibold text-accent underline-offset-2 hover:underline"
            >
              Switch to table view
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            className="bg-gradient-to-br from-[#002542] to-[#1b3b5a] shadow-sm"
            onPress={() => setAddModalOpen(true)}
          >
            <span className="text-lg leading-none">+</span>
            Add Candidate
          </Button>
        </div>
      </div>

      {dbLoadState === "error" ? (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
          Could not load candidates from the database. Showing sample data until the connection
          works.
        </p>
      ) : null}

      {deleteError ? (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{deleteError}</p>
      ) : null}

      {statusUpdateError ? (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
          {statusUpdateError}
        </p>
      ) : null}

      <AddCandidateModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onCandidatesChanged={fetchCandidates}
      />

      <CandidatePipelineFiltersCard
        query={query}
        setQuery={setQuery}
        statusKey={statusKey}
        setStatusKey={setStatusKey}
        statusFilterOptions={statusFilterOptions}
        jdFilterKey={jdFilterKey}
        setJdFilterKey={setJdFilterKey}
        jdFilterOptions={jdFilterOptions}
        uploadDateRangeFilter={uploadDateRangeFilter}
        setUploadDateRangeFilter={setUploadDateRangeFilter}
        calendarFocusedDate={calendarFocusedDate}
        setCalendarFocusedDate={setCalendarFocusedDate}
        onFiltersAdjusted={() => setPage(1)}
        calendarIdsSuffix="-kanban"
      />

      <DndContext
        sensors={sensors}
        collisionDetection={kanbanColumnCollisionDetection(COL_PREFIX)}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="pb-2">
          {dbLoadState === "loading" && tableSourceRows.length === 0 ? (
            <div className="flex min-h-[40vh] w-full items-center justify-center rounded-xl border border-dashed border-divider bg-surface-secondary/30">
              <span className="text-sm text-muted">Loading candidates…</span>
            </div>
          ) : noResultsForUploadDate ? (
            <div className="flex min-h-[40vh] w-full items-center justify-center rounded-xl border border-dashed border-divider bg-surface-secondary/30">
              <span className="text-sm text-muted">No results found for this date.</span>
            </div>
          ) : emptyKanban ? (
            <div className="flex min-h-[40vh] w-full items-center justify-center rounded-xl border border-dashed border-divider bg-surface-secondary/30">
              <span className="text-sm text-muted">
                No candidates yet. Use Add Candidate to upload CVs.
              </span>
            </div>
          ) : (
            <Tabs
              className="w-full min-w-0"
              defaultSelectedKey="cv_scan"
              aria-label="Pipeline phases"
            >
              <Tabs.ListContainer className="w-full border-b border-divider">
                <Tabs.List
                  aria-label="CV Scan, Interview, Offer"
                  className="min-h-11 w-full min-w-0 flex-wrap gap-1 pb-px sm:flex-nowrap"
                >
                  {PIPELINE_PHASES.map((phase, index) => {
                    const count = phaseHeadingCounts.get(phase.id) ?? 0;
                    return (
                      <Tabs.Tab key={phase.id} id={phase.id} className="gap-1.5 px-3 py-2 text-sm">
                        {index > 0 ? <Tabs.Separator /> : null}
                        <span className="font-semibold">{phase.title}</span>
                        <span className="tabular-nums text-muted">({count})</span>
                        <Tabs.Indicator />
                      </Tabs.Tab>
                    );
                  })}
                </Tabs.List>
              </Tabs.ListContainer>

              {PIPELINE_PHASES.map((phase) => (
                <Tabs.Panel key={phase.id} id={phase.id} className="pt-4 outline-none">
                  <p className="mb-3 text-xs text-muted">
                    Within{" "}
                    <span className="font-medium text-foreground">{phase.title}</span>, drag between
                    any column — sub-statuses can move forward or backward freely. Switch tabs to
                    move someone to another major phase. Drag again anytime to fix a wrong drop.
                  </p>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {phase.statuses.map((status) => {
                      const columnRows = rowsByStatus.get(status) ?? [];
                      return (
                        <KanbanColumn
                          key={status}
                          status={status}
                          columnTitle={candidateStatusShortLabel(status)}
                          count={columnRows.length}
                        >
                          {columnRows.map((row) => (
                            <CandidateKanbanCard
                              key={row.id}
                              row={row}
                              onOpen={() => openRow(row)}
                              onDelete={() => {
                                setDeleteError(null);
                                setRowPendingDelete(row);
                                setDeleteDialogOpen(true);
                              }}
                            />
                          ))}
                        </KanbanColumn>
                      );
                    })}
                  </div>
                </Tabs.Panel>
              ))}
            </Tabs>
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {draggingRow ? <CandidateKanbanCardOverlay row={draggingRow} /> : null}
        </DragOverlay>
      </DndContext>

      {statusUpdateBusy ? (
        <p className="text-xs font-medium text-muted" aria-live="polite">
          Updating status…
        </p>
      ) : null}

      {activeRow ? (
        <CvVersionComparisonDrawer
          key={activeRow.id}
          isOpen={drawerOpen}
          onOpenChange={setDrawerOpen}
          tableRow={activeRow}
          dbRow={activeDbRow}
          cvHistoryRows={cvHistoryRows}
          cvHistoryLoading={cvHistoryLoading}
          cvHistoryError={cvHistoryError}
          drawerStatusOptions={drawerStatusOptions}
          statusUpdateBusy={statusUpdateBusy}
          statusUpdateError={statusUpdateError}
          dbLoadState={dbLoadState}
          onStatusChange={(next) => {
            if (!activeRow) return;
            void patchCandidateStatus(activeRow.id, next);
          }}
        />
      ) : null}

      <AlertDialog.Backdrop
        isOpen={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setRowPendingDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Delete CV candidate?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-sm text-muted">
                This will permanently remove{" "}
                <strong className="text-foreground">
                  {rowPendingDelete?.name ?? "this candidate"}
                </strong>{" "}
                and the stored CV file. This cannot be undone.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary" isDisabled={deleteInProgress}>
                Cancel
              </Button>
              <Button
                variant="danger"
                isPending={deleteInProgress}
                onPress={() => void confirmDeleteCandidate()}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <Spinner color="current" size="sm" className="mr-1.5" />
                    ) : null}
                    Delete
                  </>
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}
