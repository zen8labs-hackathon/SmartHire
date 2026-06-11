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
import { useToast } from "@/components/admin/toast-provider";

import { VirtualKanbanColumnBody } from "@/components/admin/kanban/virtual-kanban-column-body";
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
/* TODO: LEGACY CODE - To be removed when migrating old features */
// import { isPipelineTransitionAllowed } from "@/lib/candidates/pipeline-allowed-transitions";
/* TODO: LEGACY CODE - To be removed when migrating old features */
import {
  PIPELINE_STATUS_DISPLAY_ORDER,
  candidateStatusUiLabel,
  PIPELINE_PHASES,
  CV_SCAN_STATUSES,
  INTERVIEW_STATUSES,
  candidateStatusMajorPhase,
} from "@/lib/candidates/pipeline-phase";
import {
  isPipelineStatusKey,
  pipelineStatusSurfaceClass,
  pipelineStatusTextClass,
  getStageColorClasses,
  getStageColorStyles,
  getSubStageTextColorClass,
  getSubStageTextColorStyle,
} from "@/lib/candidates/pipeline-status-styles";
import type { CandidateStatus } from "@/lib/candidates/types";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";
import {
  resolveCandidatePipelineIds,
  isCustomTransitionAllowed,
  buildNewPipelineCandidatePatch,
} from "@/lib/pipelines/transition-validator";

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
  stageMappings: any[];
  subStages: any[];
};

/* TODO: LEGACY CODE - To be removed when migrating old features.
   This mapping is used temporarily to translate stage codes to legacy statuses for UI/CSS class reuse. */
const STAGE_SUB_STAGE_TO_LEGACY_STATUS: Record<string, string> = {
  "cv_scan:new": "New",
  "cv_scan:passed": "CvPassed",
  "cv_scan:failed": "CvFailed",
  "cv_scan:consider": "Consider",
  "interview:interview": "Interview",
  "interview:consider": "InterviewConsider",
  "interview:canceled": "InterviewCanceled",
  "interview:passed": "InterviewPassed",
  "interview:failed": "InterviewFailed",
  "offer:offer": "Offer",
  "offer:matched": "Matched",
  "offer:rejected": "Rejected",
};

/* TODO: LEGACY CODE - To be removed when migrating old features */
function getLegacyStatusForSubStage(
  stageCode: string,
  subStageCode: string,
): string {
  const key = `${stageCode}:${subStageCode}`;
  return STAGE_SUB_STAGE_TO_LEGACY_STATUS[key] ?? "New";
}

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

function parseColumnDroppableId(
  id: string | number | undefined,
): CandidateStatus | null {
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
    const pointerHits = pointerWithin({
      ...args,
      droppableContainers: columnContainers,
    });
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

function KanbanColumn<T>({
  columnId,
  label,
  stageCode,
  subStageCode,
  color,
  count,
  items,
  getItemKey,
  renderCard,
}: {
  columnId: string;
  label: string;
  stageCode: string;
  subStageCode: string;
  color?: string | null;
  count: number;
  items: readonly T[];
  getItemKey: (item: T) => string;
  renderCard: (item: T) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnId,
    data: { columnId },
  });
  const mappedStatus = getLegacyStatusForSubStage(
    stageCode,
    subStageCode,
  ) as CandidateStatus;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-full min-w-[240px] flex-col rounded-xl border overflow-hidden",
        getStageColorClasses(color, "column"),
        isOver && "ring-2 ring-accent ring-offset-2 ring-offset-background",
      )}
      style={getStageColorStyles(color, "column")}
    >
      <div className="flex items-center justify-between gap-2 border-b border-divider px-3 py-2.5">
        <span
          className={cn(
            "inline-flex max-w-full items-center font-medium rounded-full border px-2 py-0.5 uppercase",
            getStageColorClasses(color, "badge"),
          )}
          style={getStageColorStyles(color, "badge")}
        >
          <span className="text-[10px] text-foreground">{label}</span>
        </span>
        <span className="text-xs font-semibold tabular-nums text-muted">
          {count}
        </span>
      </div>
      <VirtualKanbanColumnBody
        items={items}
        getItemKey={(item, index) => getItemKey(item)}
        renderItem={(item) => renderCard(item)}
      />
    </div>
  );
}

function CandidateKanbanCard({
  row,
  canEditPipeline,
  jobId,
  stageMappings,
  subStages,
}: {
  row: CandidateDbRow;
  canEditPipeline: boolean;
  jobId: string;
  stageMappings: any[];
  subStages: any[];
}) {
  const tableRow = candidateDbRowToTableRow(row);
  const contact = displayFromParsedPayload(row.parsed_payload);

  const { stageMappingId, subStateId } = resolveCandidatePipelineIds(
    row,
    stageMappings,
    subStages,
  );
  const currentMapping = stageMappings.find((sm) => sm.id === stageMappingId);
  const currentSubStage = subStages.find((ss) => ss.id === subStateId);
  const stageLabel = currentMapping?.pipeline_stages?.label ?? "";
  const subStageLabel = currentSubStage?.label ?? "";
  const stageColor = currentMapping?.pipeline_stages?.color ?? "zinc";
  const mappedStatus = getLegacyStatusForSubStage(
    currentMapping?.pipeline_stages?.code ?? "",
    currentSubStage?.code ?? "",
  ) as CandidateStatus;

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: row.id,
      disabled: !canEditPipeline,
      data: { stageMappingId, subStateId },
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
        <Card.Content className="gap-1.5 p-2.5">
          <div className="flex items-center gap-2">
            <Avatar
              className="size-8 shrink-0 ring-1 ring-divider/20"
              size="sm"
            >
              {tableRow.avatarUrl ? (
                <Avatar.Image alt="" src={tableRow.avatarUrl} />
              ) : null}
              <Avatar.Fallback className="text-[9px] bg-default-100 font-medium">
                {candidateDisplayInitials(tableRow.name)}
              </Avatar.Fallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <Link
                href={`/admin/jd/${jobId}/pipeline/${encodeURIComponent(row.id)}/evaluation`}
                className="line-clamp-1 text-xs font-semibold text-accent hover:underline decoration-accent/40"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {tableRow.name}
              </Link>
              <p className="truncate text-[10px] text-muted-foreground">
                {tableRow.role}
              </p>
            </div>
          </div>
          <div className="space-y-0 text-[10px] text-muted-foreground/80 pl-10">
            <p className="truncate">Email: {contact.email || "—"}</p>
            <p className="tabular-nums">Phone: {contact.phone || "—"}</p>
            {tableRow.ttf || tableRow.tth ? (
              <p className="mt-1 flex gap-2 font-medium text-accent">
                {tableRow.ttf ? <span>TTF: {tableRow.ttf}</span> : null}
                {tableRow.tth ? <span>TTH: {tableRow.tth}</span> : null}
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-divider/20">
            <Chip
              size="sm"
              variant="soft"
              color={jdMatchChipColor(tableRow)}
              className="min-w-[2.5rem] justify-center text-[9px] font-bold tabular-nums h-[18px]"
            >
              {tableRow.jdMatchLabel}
            </Chip>
            <span
              className={cn(
                "inline-flex max-w-full items-center font-medium rounded-full border px-2 py-0.5 uppercase text-[9px]",
                getStageColorClasses(stageColor, "badge"),
              )}
              style={getStageColorStyles(stageColor, "badge")}
            >
              <span
                className="text-foreground"
                style={
                  stageColor.startsWith("#") ? { color: stageColor } : undefined
                }
              >
                {stageLabel}
              </span>
              <span className="mx-1 text-muted">·</span>
              <span
                className={cn(
                  getSubStageTextColorClass(
                    currentSubStage?.code,
                    currentSubStage?.is_passed,
                    currentSubStage?.is_default,
                    stageColor,
                  ),
                )}
                style={getSubStageTextColorStyle(
                  currentSubStage?.code,
                  currentSubStage?.is_passed,
                  currentSubStage?.is_default,
                  stageColor,
                )}
              >
                {subStageLabel}
              </span>
            </span>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}

function CandidateKanbanCardOverlay({
  row,
  jobId,
  stageMappings,
  subStages,
}: {
  row: CandidateDbRow;
  jobId: string;
  stageMappings: any[];
  subStages: any[];
}) {
  return (
    <div className="w-[304px] rotate-[1.5deg] scale-[1.02] shadow-xl">
      <CandidateKanbanCard
        row={row}
        canEditPipeline={false}
        jobId={jobId}
        stageMappings={stageMappings}
        subStages={subStages}
      />
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
  stageMappings,
  subStages,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pipelineRows, setPipelineRows] = useState(initialPipelineCandidates);
  const [pipelineLoadState, setPipelineLoadState] = useState<
    "idle" | "loading" | "error" | "ok"
  >(() => (initialPipelineFetchFailed ? "error" : "ok"));
  const [addCandidatesOpen, setAddCandidatesOpen] = useState(false);
  const [draggingRow, setDraggingRow] = useState<CandidateDbRow | null>(null);
  const [rowUpdating, setRowUpdating] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const jdPipelineCampaign: JdPipelineCampaignOption | undefined =
    useMemo(() => {
      if (linkedJobOpeningId && linkedJobOpeningTitle) {
        return {
          jobOpeningId: linkedJobOpeningId,
          title: linkedJobOpeningTitle,
        };
      }
      return "no_opening_linked";
    }, [linkedJobOpeningId, linkedJobOpeningTitle]);

  const columnsList = useMemo(() => {
    const list: Array<{
      stageMappingId: string;
      stageCode: string;
      stageLabel: string;
      stageColor: string | null;
      subStageId: string;
      subStageCode: string;
      subStageLabel: string;
      isDefault: boolean;
      isPassed: boolean;
    }> = [];
    for (const sm of stageMappings) {
      const stageCode = sm.pipeline_stages?.code ?? "";
      const stageLabel = sm.pipeline_stages?.label ?? "";
      const stageColor = sm.pipeline_stages?.color ?? "zinc";
      const stageSubStages = subStages.filter(
        (ss) => ss.pipeline_stage_id === sm.pipeline_stage_id,
      );
      for (const ss of stageSubStages) {
        list.push({
          stageMappingId: sm.id,
          stageCode,
          stageLabel,
          stageColor,
          subStageId: ss.id,
          subStageCode: ss.code,
          subStageLabel: ss.label,
          isDefault: ss.is_default,
          isPassed: ss.is_passed,
        });
      }
    }
    return list;
  }, [stageMappings, subStages]);

  const filterOptions = useMemo(() => {
    const opts = [{ id: "all", label: "All stages" }];
    for (const col of columnsList) {
      opts.push({
        id: `${col.stageMappingId}:${col.subStageId}`,
        label: `${col.stageLabel} - ${col.subStageLabel}`,
      });
    }
    return opts;
  }, [columnsList]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pipelineRows.filter((r) => {
      if (statusFilter !== "all") {
        const { stageMappingId, subStateId } = resolveCandidatePipelineIds(
          r,
          stageMappings,
          subStages,
        );
        if (`${stageMappingId}:${subStateId}` !== statusFilter) return false;
      }
      if (!q) return true;
      const c = displayFromParsedPayload(r.parsed_payload);
      const hay = [r.name, r.original_filename, c.email, c.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [pipelineRows, query, statusFilter, stageMappings, subStages]);

  const rowsByColumn = useMemo(() => {
    const map = new Map<string, CandidateDbRow[]>();
    for (const col of columnsList) {
      map.set(`${col.stageMappingId}:${col.subStageId}`, []);
    }
    for (const row of filteredRows) {
      const { stageMappingId, subStateId } = resolveCandidatePipelineIds(
        row,
        stageMappings,
        subStages,
      );
      const colKey = `${stageMappingId}:${subStateId}`;
      const bucket = map.get(colKey);
      if (bucket) {
        bucket.push(row);
      } else {
        if (columnsList.length > 0) {
          const firstCol = columnsList[0];
          const firstKey = `${firstCol.stageMappingId}:${firstCol.subStageId}`;
          map.get(firstKey)?.push(row);
        }
      }
    }
    return map;
  }, [filteredRows, columnsList, stageMappings, subStages]);

  const refetchPipeline = useCallback(async () => {
    setPipelineLoadState("loading");
    try {
      const h = await getSessionAuthorizationHeaders(supabase);
      const res = await fetch(
        `/api/admin/candidates?jobDescriptionId=${jobDescriptionId}&all=true&includeParsedPayload=true`,
        {
          credentials: "include",
          headers: { ...h },
        },
      );
      if (!res.ok) {
        setPipelineLoadState("error");
        toast.error("Failed to load candidate data.");
        return;
      }
      const json = (await res.json()) as { candidates?: CandidateDbRow[] };
      setPipelineRows(json.candidates ?? []);
      setPipelineLoadState("ok");
    } catch (e) {
      setPipelineLoadState("error");
      toast.error(
        e instanceof Error ? e.message : "Failed to load candidate data.",
      );
    }
  }, [jobDescriptionId, supabase, toast]);

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
    const row =
      filteredRows.find((r) => r.id === String(event.active.id)) ?? null;
    setDraggingRow(row);
  }

  async function handleStatusChange(
    id: string,
    nextStageMappingId: string,
    nextSubStateId: string,
  ) {
    const prevRow = pipelineRows.find((r) => r.id === id);
    if (!prevRow) return;

    const { stageMappingId: fromStageMappingId, subStateId: fromSubStateId } =
      resolveCandidatePipelineIds(prevRow, stageMappings, subStages);
    if (
      fromStageMappingId === nextStageMappingId &&
      fromSubStateId === nextSubStateId
    )
      return;

    let patch;
    try {
      patch = buildNewPipelineCandidatePatch(
        prevRow,
        { toStageMappingId: nextStageMappingId, toSubStateId: nextSubStateId },
        stageMappings,
        subStages,
      );
    } catch (e) {
      console.error(e);
      return;
    }

    // Optimistic update
    setPipelineRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              ...patch,
            }
          : r,
      ),
    );
    setRowUpdating(id);
    try {
      await postPipeline([
        {
          id,
          current_job_stage_mapping_id: nextStageMappingId,
          current_sub_state_id: nextSubStateId,
          interview_at: patch.interview_at,
          onboarding_at: patch.onboarding_at,
        },
      ]);
    } catch (e) {
      // Rollback
      setPipelineRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                current_job_stage_mapping_id: fromStageMappingId,
                current_sub_state_id: fromSubStateId,
                interview_at: prevRow.interview_at,
                onboarding_at: prevRow.onboarding_at,
                pipeline_status: prevRow.pipeline_status,
              }
            : r,
        ),
      );
      toast.error(e instanceof Error ? e.message : "Update failed.");
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

    const targetKey = String(over.id);
    const actualKey = targetKey.startsWith(COL_PREFIX)
      ? targetKey.slice(COL_PREFIX.length)
      : targetKey;
    const targetCol = columnsList.find(
      (c) => `${c.stageMappingId}:${c.subStageId}` === actualKey,
    );
    if (!targetCol) return;

    const { stageMappingId: fromStageMappingId, subStateId: fromSubStateId } =
      resolveCandidatePipelineIds(row, stageMappings, subStages);

    if (!fromStageMappingId || !fromSubStateId) return;

    if (
      fromStageMappingId === targetCol.stageMappingId &&
      fromSubStateId === targetCol.subStageId
    )
      return;

    if (
      !isCustomTransitionAllowed(
        stageMappings,
        subStages,
        fromStageMappingId,
        fromSubStateId,
        targetCol.stageMappingId,
        targetCol.subStageId,
      )
    ) {
      const fromMapping = stageMappings.find(
        (sm) => sm.id === fromStageMappingId,
      );
      const fromSub = subStages.find((ss) => ss.id === fromSubStateId);
      toast.error(
        `Cannot move from ${fromMapping?.pipeline_stages?.label || "Unknown"} - ${fromSub?.label || "Unknown"} to ${targetCol.stageLabel} - ${targetCol.subStageLabel}.`,
      );
      return;
    }
    if (rowUpdating) return;
    void handleStatusChange(
      candidateId,
      targetCol.stageMappingId,
      targetCol.subStageId,
    );
  }

  console.log("row__qh", pipelineRows);

  return (
    <div className="relative flex flex-col gap-6 pb-20">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Breadcrumbs className="text-xs text-muted">
            <Breadcrumbs.Item href="/admin/jd">Jobs list</Breadcrumbs.Item>
            <Breadcrumbs.Item>{jobTitle}</Breadcrumbs.Item>
          </Breadcrumbs>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {jobTitle} pipeline
          </h1>
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
            <Button
              variant="secondary"
              size="sm"
              onPress={() => void refetchPipeline()}
            >
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

      {/* No pipelineError display block here, using toast overlays */}

      <Card variant="secondary">
        <Card.Content className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
            <SearchField
              value={query}
              onChange={setQuery}
              className="min-w-[220px] flex-1"
            >
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
                {statusFilter !== "all" ? (
                  (() => {
                    const col = columnsList.find(
                      (c) =>
                        `${c.stageMappingId}:${c.subStageId}` === statusFilter,
                    );
                    if (!col) return <Select.Value />;
                    const mappedStatus = getLegacyStatusForSubStage(
                      col.stageCode,
                      col.subStageCode,
                    ) as CandidateStatus;
                    return (
                      <span
                        className={cn(
                          "inline-flex max-w-full items-center font-medium rounded-md border px-1.5 py-0.5 text-xs",
                          getStageColorClasses(col.stageColor, "badge"),
                        )}
                        style={getStageColorStyles(col.stageColor, "badge")}
                      >
                        <span
                          className="text-foreground"
                          style={
                            col.stageColor?.startsWith("#")
                              ? { color: col.stageColor }
                              : undefined
                          }
                        >
                          {col.stageLabel}
                        </span>
                        <span className="mx-1 text-muted">·</span>
                        <span
                          className={cn(
                            getSubStageTextColorClass(
                              col.subStageCode,
                              col.isPassed,
                              col.isDefault,
                              col.stageColor,
                            ),
                          )}
                          style={getSubStageTextColorStyle(
                            col.subStageCode,
                            col.isPassed,
                            col.isDefault,
                            col.stageColor,
                          )}
                        >
                          {col.subStageLabel}
                        </span>
                      </span>
                    );
                  })()
                ) : (
                  <Select.Value />
                )}
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {filterOptions.map((opt) => (
                    <ListBox.Item
                      key={opt.id}
                      id={opt.id}
                      textValue={opt.label}
                    >
                      {opt.id === "all"
                        ? opt.label
                        : (() => {
                            const col = columnsList.find(
                              (c) =>
                                `${c.stageMappingId}:${c.subStageId}` ===
                                opt.id,
                            );
                            if (!col) return opt.label;
                            const mappedStatus = getLegacyStatusForSubStage(
                              col.stageCode,
                              col.subStageCode,
                            ) as CandidateStatus;
                            return (
                              <span
                                className={cn(
                                  "inline-flex max-w-full items-center font-medium rounded-md border px-1.5 py-0.5 text-xs",
                                  getStageColorClasses(col.stageColor, "badge"),
                                )}
                                style={getStageColorStyles(
                                  col.stageColor,
                                  "badge",
                                )}
                              >
                                <span
                                  className="text-foreground"
                                  style={
                                    col.stageColor?.startsWith("#")
                                      ? { color: col.stageColor }
                                      : undefined
                                  }
                                >
                                  {col.stageLabel}
                                </span>
                                <span className="mx-1 text-muted">·</span>
                                <span
                                  className={cn(
                                    getSubStageTextColorClass(
                                      col.subStageCode,
                                      col.isPassed,
                                      col.isDefault,
                                      col.stageColor,
                                    ),
                                  )}
                                  style={getSubStageTextColorStyle(
                                    col.subStageCode,
                                    col.isPassed,
                                    col.isDefault,
                                    col.stageColor,
                                  )}
                                >
                                  {col.subStageLabel}
                                </span>
                              </span>
                            );
                          })()}
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
          ) : (
            <div className="space-y-6">
              {stageMappings.map((sm, index) => {
                const stageSubStages = subStages.filter(
                  (ss) => ss.pipeline_stage_id === sm.pipeline_stage_id,
                );
                const visibleSubStages = stageSubStages.filter((ss) => {
                  if (statusFilter === "all") return true;
                  return `${sm.id}:${ss.id}` === statusFilter;
                });

                if (visibleSubStages.length === 0) return null;

                return (
                  <div
                    key={sm.id}
                    className="space-y-2.5 pb-4 border-b border-divider/30 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">
                        {index + 1}
                      </span>
                      <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                        {sm.pipeline_stages?.label ?? "Stage"}
                      </h2>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                      {visibleSubStages.map((ss) => {
                        const colKey = `${sm.id}:${ss.id}`;
                        const columnRows = rowsByColumn.get(colKey) ?? [];
                        return (
                          <KanbanColumn
                            key={colKey}
                            columnId={`${COL_PREFIX}${colKey}`}
                            label={ss.label}
                            stageCode={sm.pipeline_stages?.code ?? ""}
                            subStageCode={ss.code}
                            color={sm.pipeline_stages?.color ?? "zinc"}
                            count={columnRows.length}
                            items={columnRows}
                            getItemKey={(row) => row.id}
                            renderCard={(row) => (
                              <CandidateKanbanCard
                                row={row}
                                canEditPipeline={canEditPipeline}
                                jobId={jobId}
                                stageMappings={stageMappings}
                                subStages={subStages}
                              />
                            )}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {draggingRow ? (
            <CandidateKanbanCardOverlay
              row={draggingRow}
              jobId={jobId}
              stageMappings={stageMappings}
              subStages={subStages}
            />
          ) : null}
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
