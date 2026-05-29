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
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import {
  AddCandidateModal,
  type JdPipelineCampaignOption,
} from "@/components/admin/candidates/add-candidate-modal";
import { PipelineStatusLabel } from "@/components/admin/candidates/pipeline-status-label";
import {
  candidateDisplayInitials,
  jdMatchChipColor,
} from "@/lib/candidates/candidate-display";
import {
  type CandidateDbRow,
  asCandidateStatus,
  candidateDbRowToTableRow,
} from "@/lib/candidates/db-row";
import { displayFromParsedPayload } from "@/lib/candidates/parsed-contact";
import { isPipelineTransitionAllowed } from "@/lib/candidates/pipeline-allowed-transitions";
import {
  PIPELINE_STATUS_DISPLAY_ORDER,
  candidateStatusUiLabel,
} from "@/lib/candidates/pipeline-phase";
import {
  isPipelineStatusKey,
  pipelineStatusSurfaceClass,
} from "@/lib/candidates/pipeline-status-styles";
import type { CandidateStatus } from "@/lib/candidates/types";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";

import {
  Avatar,
  Breadcrumbs,
  Button,
  Card,
  Chip,
  Label,
  ListBox,
  SearchField,
  Select,
  cn,
} from "@heroui/react";

type Props = {
  jobDescriptionId: number;
  jobId: string;
  jobTitle: string;
  initialPipelineCandidates: CandidateDbRow[];
  initialPipelineFetchFailed: boolean;
  linkedJobOpeningId: string | null;
  linkedJobOpeningTitle: string | null;
  canEditPipeline: boolean;
  canAddCandidates: boolean;
};

const COL_PREFIX = "col:";

const FILTER_STATUS_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "all", label: "All statuses" },
  ...PIPELINE_STATUS_DISPLAY_ORDER.map((sid) => ({
    id: sid,
    label: candidateStatusUiLabel(sid),
  })),
];

function columnDroppableId(status: CandidateStatus): string {
  return `${COL_PREFIX}${status}`;
}

function parseColumnDroppableId(id: string | number | undefined): CandidateStatus | null {
  if (id == null) return null;
  const s = String(id);
  if (!s.startsWith(COL_PREFIX)) return null;
  const status = s.slice(COL_PREFIX.length) as CandidateStatus;
  return PIPELINE_STATUS_DISPLAY_ORDER.includes(status) ? status : null;
}

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

function DownloadIcon({ className }: { className?: string }) {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function UserPlusIcon({ className }: { className?: string }) {
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
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}

function KanbanColumn({
  status,
  count,
  children,
}: {
  status: CandidateStatus;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDroppableId(status),
    data: { status },
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[320px] shrink-0 flex-col rounded-xl border",
        pipelineStatusSurfaceClass(status, "column"),
        isOver && "ring-2 ring-accent ring-offset-2 ring-offset-background",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-divider px-3 py-2.5">
        <PipelineStatusLabel status={status} />
        <span className="text-xs font-semibold tabular-nums text-muted">{count}</span>
      </div>
      <div className="flex min-h-[260px] flex-col gap-2 overflow-y-auto p-2">{children}</div>
    </div>
  );
}

function CandidateKanbanCard({
  row,
  canEditPipeline,
  jobId,
}: {
  row: CandidateDbRow;
  canEditPipeline: boolean;
  jobId: string;
}) {
  const tableRow = candidateDbRowToTableRow(row);
  const contact = displayFromParsedPayload(row.parsed_payload);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: row.id,
    disabled: !canEditPipeline,
    data: { status: row.status },
    attributes: { role: "group", tabIndex: canEditPipeline ? 0 : undefined },
  });

  const style = transform
    ? {
        transform: CSS.Transform.toString(transform),
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(canEditPipeline ? { ...listeners, ...attributes } : {})}
      className={cn(
        "transition-[opacity,transform] duration-200",
        canEditPipeline &&
          "touch-none cursor-grab outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
        <Card.Content className="gap-2 p-3">
          <div className="flex items-start gap-2">
            <Avatar className="size-9 shrink-0" size="sm">
              {tableRow.avatarUrl ? <Avatar.Image alt="" src={tableRow.avatarUrl} /> : null}
              <Avatar.Fallback className="text-[10px]">
                {candidateDisplayInitials(tableRow.name)}
              </Avatar.Fallback>
            </Avatar>
            <div className="min-w-0">
              <Link
                href={`/admin/jd/${jobId}/pipeline/${encodeURIComponent(row.id)}/evaluation`}
                className="line-clamp-2 text-sm font-semibold text-accent hover:underline"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {tableRow.name}
              </Link>
              <p className="mt-0.5 truncate text-xs text-muted">{tableRow.role}</p>
            </div>
          </div>
          <div className="space-y-0.5 text-xs text-muted">
            <p className="truncate">{contact.email || "—"}</p>
            <p className="tabular-nums">{contact.phone || "—"}</p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Chip
              size="sm"
              variant="soft"
              color={jdMatchChipColor(tableRow)}
              className="min-w-[3rem] justify-center text-[11px] font-bold tabular-nums"
            >
              {tableRow.jdMatchLabel}
            </Chip>
            <PipelineStatusLabel status={tableRow.status} className="text-[11px]" />
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}

function CandidateKanbanCardOverlay({ row, jobId }: { row: CandidateDbRow; jobId: string }) {
  return (
    <div className="w-[304px] rotate-[1.5deg] scale-[1.02] shadow-xl">
      <CandidateKanbanCard row={row} canEditPipeline={false} jobId={jobId} />
    </div>
  );
}

export function JobPipelineKanban({
  jobDescriptionId,
  jobId,
  jobTitle,
  initialPipelineCandidates,
  initialPipelineFetchFailed,
  linkedJobOpeningId,
  linkedJobOpeningTitle,
  canEditPipeline,
  canAddCandidates,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pipelineRows, setPipelineRows] = useState(initialPipelineCandidates);
  const [pipelineLoadState, setPipelineLoadState] = useState<
    "idle" | "loading" | "error" | "ok"
  >(() => (initialPipelineFetchFailed ? "error" : "ok"));
  const [addCandidatesOpen, setAddCandidatesOpen] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [draggingRow, setDraggingRow] = useState<CandidateDbRow | null>(null);
  const [rowUpdating, setRowUpdating] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const jdPipelineCampaign: JdPipelineCampaignOption | undefined = useMemo(() => {
    if (linkedJobOpeningId && linkedJobOpeningTitle) {
      return { jobOpeningId: linkedJobOpeningId, title: linkedJobOpeningTitle };
    }
    return "no_opening_linked";
  }, [linkedJobOpeningId, linkedJobOpeningTitle]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pipelineRows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      const c = displayFromParsedPayload(r.parsed_payload);
      const hay = [r.name, r.original_filename, c.email, c.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [pipelineRows, query, statusFilter]);

  const visibleStatuses = useMemo(() => {
    if (statusFilter === "all") return PIPELINE_STATUS_DISPLAY_ORDER;
    return PIPELINE_STATUS_DISPLAY_ORDER.filter((s) => s === statusFilter);
  }, [statusFilter]);

  const rowsByStatus = useMemo(() => {
    const map = new Map<CandidateStatus, CandidateDbRow[]>();
    for (const s of PIPELINE_STATUS_DISPLAY_ORDER) {
      map.set(s, []);
    }
    for (const row of filteredRows) {
      const bucket = map.get(asCandidateStatus(row.status));
      if (bucket) bucket.push(row);
    }
    return map;
  }, [filteredRows]);

  const refetchPipeline = useCallback(async () => {
    setPipelineLoadState("loading");
    try {
      const h = await getSessionAuthorizationHeaders(supabase);
      const res = await fetch(
        `/api/admin/candidates?jobDescriptionId=${jobDescriptionId}&all=true`,
        {
          credentials: "include",
          headers: { ...h },
        },
      );
      if (!res.ok) {
        setPipelineLoadState("error");
        return;
      }
      const json = (await res.json()) as { candidates?: CandidateDbRow[] };
      setPipelineRows(json.candidates ?? []);
      setPipelineLoadState("ok");
    } catch {
      setPipelineLoadState("error");
    }
  }, [jobDescriptionId, supabase]);

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

  const handleDuplicateMergedToExisting = useCallback(async () => {
    setAddCandidatesOpen(false);
    await refetchPipeline();
    router.push("/admin/candidates");
  }, [refetchPipeline, router]);

  function handleDragStart(event: DragStartEvent) {
    const row = filteredRows.find((r) => r.id === String(event.active.id)) ?? null;
    setDraggingRow(row);
  }

  async function handleStatusChange(id: string, next: CandidateStatus) {
    const prevRow = pipelineRows.find((r) => r.id === id);
    if (!prevRow) return;
    if (prevRow.status === next) return;

    // Optimistic update: move card immediately, then sync with API.
    setPipelineRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)));
    setRowUpdating(id);
    setPipelineError(null);
    try {
      await postPipeline([{ id, status: next }]);
    } catch (e) {
      // Rollback if server rejects transition/update.
      setPipelineRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: prevRow.status } : r)),
      );
      setPipelineError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setRowUpdating(null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingRow(null);
    if (!canEditPipeline) return;
    const { active, over } = event;
    if (!over) return;

    const candidateId = String(active.id);
    const row = filteredRows.find((r) => r.id === candidateId);
    if (!row) return;

    const targetStatus = parseColumnDroppableId(String(over.id));
    if (!targetStatus || targetStatus === asCandidateStatus(row.status)) return;

    const fromStatus = asCandidateStatus(row.status);
    if (!isPipelineTransitionAllowed(fromStatus, targetStatus)) {
      setPipelineError(
        `Cannot move from ${candidateStatusUiLabel(fromStatus)} to ${candidateStatusUiLabel(targetStatus)}.`,
      );
      return;
    }
    if (rowUpdating) return;
    void handleStatusChange(candidateId, targetStatus);
  }

  return (
    <div className="relative flex flex-col gap-6 pb-20">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Breadcrumbs className="text-xs text-muted">
            <Breadcrumbs.Item href="/admin/jd">Jobs list</Breadcrumbs.Item>
            <Breadcrumbs.Item>{jobTitle}</Breadcrumbs.Item>
          </Breadcrumbs>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{jobTitle} pipeline</h1>
          <div className="inline-flex rounded-xl border border-divider bg-surface-secondary/50 p-1 text-sm">
            <Link
              href={`/admin/jd/${jobId}/pipeline`}
              className="rounded-lg px-3 py-1.5 text-muted hover:text-foreground"
            >
              Table
            </Link>
            <span className="rounded-lg bg-surface-tertiary px-3 py-1.5 font-medium text-foreground">
              Kanban v2
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {pipelineLoadState === "error" ? (
            <Button variant="secondary" size="sm" onPress={() => void refetchPipeline()}>
              Retry load
            </Button>
          ) : null}
          {canAddCandidates ? (
            <Button
              variant="primary"
              size="sm"
              className="gap-2 bg-gradient-to-br from-[#002542] to-[#1b3b5a]"
              onPress={() => setAddCandidatesOpen(true)}
            >
              <UserPlusIcon className="size-4" />
              Add candidates
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" className="gap-2">
            <DownloadIcon className="size-4" />
            Export to Excel
          </Button>
        </div>
      </header>

      {pipelineError ? <p className="text-sm text-danger">{pipelineError}</p> : null}

      <Card variant="secondary">
        <Card.Content className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
            <SearchField value={query} onChange={setQuery} className="min-w-[220px] flex-1">
              <SearchField.Group className="w-full">
                <SearchField.SearchIcon />
                <SearchField.Input
                  placeholder="Search name, email, phone…"
                  className="w-full min-w-0"
                />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <Select
              value={statusFilter}
              onChange={(key) => {
                if (typeof key === "string") setStatusFilter(key);
              }}
              className="min-w-[220px]"
            >
              <Label className="sr-only">Status</Label>
              <Select.Trigger className="min-h-10">
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
          </div>
        </Card.Content>
      </Card>

      <DndContext
        sensors={sensors}
        collisionDetection={kanbanColumnCollisionDetection(COL_PREFIX)}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="pb-2">
          {pipelineLoadState === "loading" ? (
            <div className="flex min-h-[40vh] w-full items-center justify-center rounded-xl border border-dashed border-divider bg-surface-secondary/30">
              <span className="text-sm text-muted">Loading candidates…</span>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex min-h-[40vh] w-full items-center justify-center rounded-xl border border-dashed border-divider bg-surface-secondary/30">
              <span className="text-sm text-muted">No candidates match your filters.</span>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {visibleStatuses.map((status) => {
                const columnRows = rowsByStatus.get(status) ?? [];
                return (
                  <KanbanColumn key={status} status={status} count={columnRows.length}>
                    {columnRows.map((row) => (
                      <CandidateKanbanCard
                        key={row.id}
                        row={row}
                        canEditPipeline={canEditPipeline}
                        jobId={jobId}
                      />
                    ))}
                  </KanbanColumn>
                );
              })}
            </div>
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {draggingRow ? <CandidateKanbanCardOverlay row={draggingRow} jobId={jobId} /> : null}
        </DragOverlay>
      </DndContext>

      {canAddCandidates ? (
        <Button
          variant="primary"
          size="lg"
          className="fixed bottom-8 right-8 z-20 size-14 min-w-0 rounded-full p-0 shadow-lg"
          aria-label="Add candidates to this job"
          onPress={() => setAddCandidatesOpen(true)}
        >
          <UserPlusIcon className="size-6" />
        </Button>
      ) : null}

      {canAddCandidates ? (
        <AddCandidateModal
          open={addCandidatesOpen}
          onOpenChange={setAddCandidatesOpen}
          jdPipelineCampaign={jdPipelineCampaign}
          onCandidatesChanged={() => void refetchPipeline()}
          onDuplicateMergedToExisting={handleDuplicateMergedToExisting}
        />
      ) : null}
    </div>
  );
}
