"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { Button, Chip, ListBox, Modal, Select, cn } from "@heroui/react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Undo2,
} from "lucide-react";

import { CvViewer } from "@/components/admin/candidates/cv-viewer";
import { useToast } from "@/components/admin/toast-provider";
import {
  campaignAppliedAdminRowToTableRow,
  type JdPipelineApplicationRow,
} from "@/lib/candidates/campaign-applied-table-row";
import { jdMatchChipColor } from "@/lib/candidates/candidate-display";
import {
  jdRequirementSourceLabel,
  jdRequirementVerdictStyle,
  parseJdMatchRationale,
  sortJdRequirements,
  type JdRequirementCheck,
} from "@/lib/candidates/jd-match-rationale";
import {
  getStageColorClasses,
  getStageColorStyles,
  getSubStageTextColorClass,
} from "@/lib/candidates/pipeline-status-styles";
import {
  allowedStageTargets,
  resolveRowPipeline,
  stageSubStageOptionKey,
} from "@/lib/pipelines/jd-pipeline-row-helpers";
import {
  QUICK_REVIEW_PREFETCH_THRESHOLD,
  reviewQueueNeighbors,
  groupRequirementsByVerdict,
  type QuickReviewTarget,
} from "@/lib/pipelines/quick-review";
import type {
  StageMapping,
  SubStage,
} from "@/lib/pipelines/transition-validator";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  /** Rows the table is showing; the modal keeps its own copy so a refetch can't reshuffle the queue mid-review. */
  rows: JdPipelineApplicationRow[];
  /** Queue order, snapshotted by the table when the modal opens (from wherever it was clicked, not necessarily the start of the list) and extended in both directions as more batches load. */
  queueIds: string[];
  /** Whether more rows exist past the end of `queueIds` (same filter/sort, next batch) -- gates calls to `onLoadMoreAfter`. */
  hasMoreAfter: boolean;
  /** Fetches and appends the next batch past the end of `rows`/`queueIds`. Called once the reviewer is within `QUICK_REVIEW_PREFETCH_THRESHOLD` rows of the end of what's loaded; safe to call repeatedly -- the caller dedupes overlapping loads. */
  onLoadMoreAfter: () => void;
  /** Whether more rows exist before the start of `queueIds` -- gates calls to `onLoadMoreBefore`. */
  hasMoreBefore: boolean;
  /** Fetches and prepends the batch just before the start of `rows`/`queueIds`. Called once the reviewer is within `QUICK_REVIEW_PREFETCH_THRESHOLD` rows of the start of what's loaded; safe to call repeatedly -- the caller dedupes overlapping loads. */
  onLoadMoreBefore: () => void;
  /** The application shown when the modal opens. */
  initialId: string | null;
  stageMappings: StageMapping[];
  subStages: SubStage[];
  /** `candidate.manage` on this job -- same permission the pipeline POST checks. */
  canDecide: boolean;
  /** Called after every committed move (status change or revert) so the table can refetch. */
  onPipelineChanged: () => void;
};

/** A candidate's pipeline position when the reviewer first changed it in this session -- what "Revert" goes back to. */
type StatusBaseline = {
  stageMappingId: string;
  subStateId: string;
  label: string;
};

/** Verdict icon colour -- same tokens the table's JD-match reasoning modal uses. */
const VERDICT_TEXT: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  default: "text-muted",
};

/** Gaps first, wins last. */
const VERDICT_ORDER = ["missing", "partial", "unclear", "met"] as const;
/** Group headings -- plain words so "no evidence" can't be mistaken for "not met". */
const VERDICT_GROUP_LABEL: Record<JdRequirementCheck["verdict"], string> = {
  missing: "Not met",
  partial: "Partially met",
  unclear: "No info in CV",
  met: "Met",
};

/** AI-summary length above which it is clamped behind "Read more". */
const SUMMARY_CLAMP_CHARS = 240;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  ) {
    return true;
  }
  // The status `<Select>` uses its own arrow-key navigation between
  // options while its popover is open -- never treated as a typing target
  // then. But react-aria keeps real DOM focus on the *trigger* button even
  // while the popover is open (the highlighted option is virtual, via
  // `aria-activedescendant`), so `target` alone can't tell "popover open,
  // arrows pick an option" apart from "popover already closed, trigger
  // merely still has focus" -- both report the trigger as `target`.
  // Require the popover to actually be mounted (react-aria only renders it
  // while open) so a closed-but-focused trigger doesn't swallow ← / → /
  // ↑ / ↓: previously that let react-aria's native-`<select>`-style
  // arrow-key value-cycling silently change the pipeline status instead of
  // moving between CVs.
  if (target.closest('[data-slot="select"], [data-slot="select-popover"]')) {
    return !!document.querySelector('[data-slot="select-popover"]');
  }
  return false;
}

/** `Stage · Sub-stage` pill in the stage's configured colour; ellipsizes on one line if space is short. */
function StageBadge({
  stageLabel,
  stageColor,
  subStageCode,
  subStageLabel,
  isPassed,
  isDefault,
  className,
}: {
  stageLabel: string | null;
  stageColor: string | null;
  subStageCode: string | null;
  subStageLabel: string | null;
  isPassed: boolean | null;
  isDefault?: boolean;
  className?: string;
}) {
  if (!stageLabel || !subStageLabel) {
    return <span className="shrink-0 text-xs text-muted">No stage</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex min-w-0 shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold",
        getStageColorClasses(stageColor, "badge"),
        className,
      )}
      style={getStageColorStyles(stageColor, "badge")}
      title={`${stageLabel} · ${subStageLabel}`}
    >
      <span className="min-w-0 truncate text-foreground">{stageLabel}</span>
      <span className="shrink-0 text-muted">·</span>
      <span
        className={cn(
          "shrink-0 truncate",
          getSubStageTextColorClass(
            subStageCode ?? "",
            isPassed ?? undefined,
            isDefault,
            stageColor,
          ),
        )}
      >
        {subStageLabel}
      </span>
    </span>
  );
}

/** One JD requirement under its verdict group: text and source; click to reveal the AI's evidence. */
function RequirementItem({ check }: { check: JdRequirementCheck }) {
  const style = jdRequirementVerdictStyle(check.verdict);
  const head = (
    <>
      <span
        aria-hidden
        className={cn(
          "mt-2 size-1.5 shrink-0 rounded-full bg-current",
          VERDICT_TEXT[style.color],
        )}
      />
      <span className="min-w-0 flex-1 text-sm leading-5 text-foreground">
        {check.requirement}
        <span className="ml-1.5 text-xs text-muted">
          · {jdRequirementSourceLabel(check.source)}
        </span>
      </span>
    </>
  );
  if (!check.evidence) {
    return <li className="flex items-start gap-2.5 pl-1">{head}</li>;
  }
  return (
    <li className="pl-1">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/50 [&::-webkit-details-marker]:hidden">
          {head}
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <p className="m-0 ml-4 mt-1 text-xs leading-relaxed text-muted">
          {check.evidence}
        </p>
      </details>
    </li>
  );
}

/** Keycap for the footer hint. */
function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-divider bg-surface-secondary px-1.5 font-mono text-xs font-bold text-foreground shadow-sm">
      {children}
    </kbd>
  );
}

function targetFromOption(option: {
  stageMapping: StageMapping;
  subStage: SubStage;
}): QuickReviewTarget {
  return {
    stageMappingId: option.stageMapping.id,
    subStateId: option.subStage.id,
    label: `${option.stageMapping.pipeline_stages?.label ?? option.stageMapping.pipeline_stages?.code} · ${option.subStage.label}`,
  };
}

/**
 * Quick CV screening from the pipeline table: CV on the left, a compact
 * screening panel on the right (JD-match, one-line facts, other
 * applications, reason), and a footer with the same pipeline-move `<Select>`
 * the table uses plus explicit Back / Next buttons. Opened from the CV file
 * tag next to a candidate's name, or the toolbar's "Quick review" button.
 */
export function QuickReviewModal(props: Props) {
  return (
    <Modal.Backdrop isOpen={props.isOpen} onOpenChange={props.onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="flex h-[85vh] max-h-[820px] w-full max-w-[1120px] flex-col overflow-hidden p-0">
          <Modal.CloseTrigger />
          {/* Mounted only while open, so each opening starts from fresh state. */}
          {props.isOpen && props.initialId ? (
            <QuickReviewBody {...props} initialId={props.initialId} />
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function QuickReviewBody({
  jobId,
  rows,
  queueIds,
  hasMoreAfter,
  onLoadMoreAfter,
  hasMoreBefore,
  onLoadMoreBefore,
  initialId,
  stageMappings,
  subStages,
  canDecide,
  onPipelineChanged,
}: Props & { initialId: string }) {
  const toast = useToast();

  const [currentId, setCurrentId] = useState(initialId);
  // Local copy of every row seen since opening: a refetch may drop a row from
  // the table (e.g. a stage filter hides it once failed) but it must stay
  // reviewable -- and undoable -- here.
  const [rowsById, setRowsById] = useState(
    () => new Map(rows.map((r) => [r.id, r])),
  );
  useEffect(() => {
    setRowsById((prev) => {
      const next = new Map(prev);
      for (const r of rows) next.set(r.id, r);
      return next;
    });
  }, [rows]);

  // Keyed by candidate id, not a single flag -- a save can still be in
  // flight for the candidate the reviewer just navigated away from, and
  // must not show up as "busy"/"saved" on whichever CV is now on screen.
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  // Per candidate: the status it had before the first change made here. ↑ / ↓ steps one sub-stage at a time, so "the previous status" is meaningless -- Revert restores this instead.
  const [baselines, setBaselines] = useState<Record<string, StatusBaseline>>({});
  const [showFullSummary, setShowFullSummary] = useState(false);
  // The candidate whose save most recently completed -- drives the "Saved"
  // line, but only while that candidate is still the one on screen.
  const [justSavedId, setJustSavedId] = useState<string | null>(null);

  const row = rowsById.get(currentId) ?? null;
  const { index, total, prevId, nextId } = reviewQueueNeighbors(
    queueIds,
    currentId,
  );
  const busy = busyIds.has(currentId);
  const justSaved = justSavedId === currentId;

  // Keep the queue topped up in whichever direction the reviewer is
  // heading, so Back/Next never run out just because a batch hasn't
  // arrived yet -- whether the modal was opened at the start of the list
  // or from the middle of it.
  useEffect(() => {
    if (index === -1) return;
    if (hasMoreAfter && total - 1 - index <= QUICK_REVIEW_PREFETCH_THRESHOLD) {
      onLoadMoreAfter();
    }
    if (hasMoreBefore && index <= QUICK_REVIEW_PREFETCH_THRESHOLD) {
      onLoadMoreBefore();
    }
  }, [
    hasMoreAfter,
    onLoadMoreAfter,
    hasMoreBefore,
    onLoadMoreBefore,
    index,
    total,
  ]);

  const goTo = useCallback((id: string) => {
    setCurrentId(id);
    setShowFullSummary(false);
    setJustSavedId(null);
  }, []);

  const resolved = useMemo(
    () => (row ? resolveRowPipeline(row, stageMappings, subStages) : null),
    [row, stageMappings, subStages],
  );

  // Same option set + key format as the table's own status `<Select>` (see
  // `PipelineTableRow`) -- this is the exact same control, just in the modal.
  const stageOptions = useMemo(
    () =>
      resolved?.stageMappingId && resolved.subStateId
        ? allowedStageTargets(
            resolved.stageMappingId,
            resolved.subStateId,
            stageMappings,
            subStages,
          )
        : [],
    [resolved, stageMappings, subStages],
  );
  const currentOptionKey =
    resolved?.stageMappingId && resolved.subStateId
      ? stageSubStageOptionKey(resolved.stageMappingId, resolved.subStateId)
      : undefined;

  const display = row ? campaignAppliedAdminRowToTableRow(row) : null;
  const rationale = useMemo(
    () => parseJdMatchRationale(row?.jd_match_rationale),
    [row?.jd_match_rationale],
  );
  const requirementGroups = useMemo(() => {
    const groups = groupRequirementsByVerdict(
      sortJdRequirements(rationale?.requirements ?? []),
    );
    return VERDICT_ORDER.filter((v) => groups[v].length > 0).map((v) => ({
      verdict: v,
      items: groups[v],
    }));
  }, [rationale]);
  const score =
    display?.jdMatchScore != null ? Math.round(display.jdMatchScore) : null;

  // Label/value rows for the profile facts; empty ones are dropped.
  const facts: Array<{ label: string; value: string }> = row
    ? [
        {
          label: "Experience",
          value: row.candidate_experience_years?.trim()
            ? `${row.candidate_experience_years.trim()} yrs`
            : "",
        },
        { label: "Education", value: row.candidate_education?.trim() ?? "" },
        { label: "English", value: row.cv_english_level?.trim() ?? "" },
      ].filter((f) => f.value)
    : [];

  /** Reflect a committed move in the local copy right away (the table refetch may not include this row). */
  const patchRowPosition = useCallback(
    (id: string, stageMappingId: string, subStateId: string) => {
      setRowsById((prev) => {
        const r = prev.get(id);
        if (!r) return prev;
        const next = new Map(prev);
        next.set(id, {
          ...r,
          current_job_stage_mapping_id: stageMappingId,
          current_sub_state_id: subStateId,
        });
        return next;
      });
    },
    [],
  );

  const postPipeline = useCallback(
    async (id: string, stageMappingId: string, subStateId: string) => {
      const res = await fetch("/api/admin/candidates/pipeline", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          updates: [
            {
              id,
              current_job_stage_mapping_id: stageMappingId,
              current_sub_state_id: subStateId,
            },
          ],
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Update failed.");
      patchRowPosition(id, stageMappingId, subStateId);
      onPipelineChanged();
    },
    [jobId, onPipelineChanged, patchRowPosition],
  );

  const decide = useCallback(
    async (target: QuickReviewTarget) => {
      const id = currentId;
      if (
        !canDecide ||
        busyIds.has(id) ||
        !display ||
        !resolved?.stageMappingId ||
        !resolved.subStateId
      ) {
        return;
      }
      setBusyIds((prev) => new Set(prev).add(id));
      try {
        const before: StatusBaseline = {
          stageMappingId: resolved.stageMappingId,
          subStateId: resolved.subStateId,
          label: `${resolved.stageMapping?.pipeline_stages?.label ?? resolved.stageMapping?.pipeline_stages?.code ?? "Stage"} · ${resolved.subStage?.label ?? ""}`,
        };
        await postPipeline(id, target.stageMappingId, target.subStateId);
        setBaselines((prev) => (prev[id] ? prev : { ...prev, [id]: before }));

        setJustSavedId(id);
        // Stay on this candidate -- the reviewer moves on with Back/Next
        // (or ← / →) on their own; a status change alone doesn't advance.
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Update failed.");
      } finally {
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [busyIds, canDecide, currentId, display, postPipeline, resolved, toast],
  );

  const onStatusSelect = useCallback(
    (key: React.Key | null) => {
      if (typeof key !== "string" || key === currentOptionKey) return;
      const [toStageMappingId, toSubStateId] = key.split(":");
      const option = stageOptions.find(
        ({ stageMapping, subStage }) =>
          stageMapping.id === toStageMappingId && subStage.id === toSubStateId,
      );
      if (!option) return;
      void decide(targetFromOption(option));
    },
    [currentOptionKey, decide, stageOptions],
  );

  /** ↑ / ↓ step through this stage's sub-stages in the same order the `<Select>` lists them, one step at a time. */
  const changeSubStage = useCallback(
    (direction: 1 | -1) => {
      if (!canDecide || busy || stageOptions.length === 0) return;
      const idx = stageOptions.findIndex(
        ({ stageMapping, subStage }) =>
          stageSubStageOptionKey(stageMapping.id, subStage.id) ===
          currentOptionKey,
      );
      const nextIdx = idx + direction;
      if (idx === -1 || nextIdx < 0 || nextIdx >= stageOptions.length) return;
      void decide(targetFromOption(stageOptions[nextIdx]!));
    },
    [busy, canDecide, currentOptionKey, decide, stageOptions],
  );

  const baseline = baselines[currentId];
  const canRevert =
    !!baseline &&
    !!resolved &&
    (baseline.stageMappingId !== resolved.stageMappingId ||
      baseline.subStateId !== resolved.subStateId);

  const revert = useCallback(async () => {
    const id = currentId;
    if (!baseline || busyIds.has(id)) return;
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await postPipeline(id, baseline.stageMappingId, baseline.subStateId);
      setJustSavedId(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revert failed.");
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [baseline, busyIds, currentId, postPipeline, toast]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Arrow keys belong to the status `<Select>` while it is in use.
      if (isTypingTarget(e.target)) return;
      // ← / → move between CVs; ↑ / ↓ step the current CV through its
      // sub-stages -- the only two things arrow keys do here, no letter
      // shortcuts for picking a status. `stopPropagation` (not just
      // `preventDefault`) so the closed-but-still-focused status `<Select>`
      // trigger never also sees the key and cycles its own value -- see
      // `isTypingTarget`.
      if (e.key === "ArrowRight" && nextId) {
        e.preventDefault();
        e.stopPropagation();
        goTo(nextId);
      } else if (e.key === "ArrowLeft" && prevId) {
        e.preventDefault();
        e.stopPropagation();
        goTo(prevId);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        changeSubStage(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        changeSubStage(-1);
      }
    };
    // Capture phase so the arrows are seen before react-aria's dialog/CV viewer handle them.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [changeSubStage, goTo, nextId, prevId]);

  const decisionsDisabled = !canDecide || busy;
  const stageColor = resolved?.stageMapping?.pipeline_stages?.color ?? null;

  return (
    <>
      <Modal.Header className="flex flex-row items-center gap-3 border-b border-divider px-5 py-3 pr-14">
        <Modal.Heading className="min-w-0 truncate text-lg font-bold text-foreground">
          {display?.name ?? "Candidate"}
        </Modal.Heading>
        <StageBadge
          stageLabel={
            resolved?.stageMapping?.pipeline_stages?.label ??
            resolved?.stageMapping?.pipeline_stages?.code ??
            null
          }
          stageColor={stageColor}
          subStageCode={resolved?.subStage?.code ?? null}
          subStageLabel={resolved?.subStage?.label ?? null}
          isPassed={resolved?.subStage?.is_passed ?? null}
          isDefault={resolved?.subStage?.is_default}
        />
        {index !== -1 ? (
          <span className="ml-auto shrink-0 text-xs font-semibold tabular-nums text-muted">
            {index + 1} / {total}
          </span>
        ) : null}
      </Modal.Header>

      <Modal.Body className="flex min-h-0 flex-1 gap-0 overflow-hidden p-0">
        <div className="h-full min-w-0 flex-1 border-r border-divider">
          {row?.cv_storage_path ? (
            <CvViewer
              key={currentId}
              cvUrl={`/api/admin/candidates/${encodeURIComponent(currentId)}/cv-download`}
              title={`CV - ${display?.name ?? ""}`}
              className="h-full w-full"
            />
          ) : (
            <p className="p-6 text-sm text-muted">
              No CV file stored for this candidate.
            </p>
          )}
        </div>

        <div className="flex h-full w-[18rem] shrink-0 flex-col gap-5 overflow-y-auto p-4 xl:w-[22rem]">
          {canDecide ? (
            <section
              className="flex flex-col gap-2 rounded-xl border border-divider bg-surface-secondary/30 p-3"
              aria-live="polite"
            >
              <p
                className={cn(
                  "m-0 flex items-center gap-1.5 text-sm font-medium",
                  justSaved ? "text-success" : "text-foreground",
                )}
              >
                {busy ? (
                  "Saving…"
                ) : justSaved ? (
                  <>
                    <Check className="size-4 shrink-0" />
                    Saved — status updated
                  </>
                ) : (
                  <>
                    <Info className="size-4 shrink-0 text-accent" />
                    Changing the status saves it immediately.
                  </>
                )}
              </p>
            </section>
          ) : null}

          {facts.length > 0 ? (
            <dl className="m-0 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
              {facts.map((f) => (
                <div key={f.label} className="contents">
                  <dt className="text-muted">{f.label}</dt>
                  <dd className="m-0 font-medium text-foreground">{f.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="m-0 text-xs font-bold uppercase tracking-wider text-muted">
                JD match
              </h3>
              {score != null ? (
                <Chip
                  size="sm"
                  variant="soft"
                  color={jdMatchChipColor({ jdMatchScore: score })}
                  className="min-w-[3.25rem] justify-center text-xs font-bold tabular-nums"
                >
                  {score}
                </Chip>
              ) : null}
            </div>

            {row?.jd_match_status === "failed" ? (
              <p className="m-0 text-sm text-danger">
                {row.jd_match_error ?? "Scoring failed."}
              </p>
            ) : !rationale && score == null ? (
              <p className="m-0 text-sm text-muted">
                Not scored yet — run AI match from the pipeline table.
              </p>
            ) : null}

            {requirementGroups.map(({ verdict, items }) => {
              const style = jdRequirementVerdictStyle(verdict);
              return (
                <div
                  key={verdict}
                  className="flex flex-col gap-2 border-t border-divider pt-3"
                >
                  <h4
                    className={cn(
                      "m-0 flex items-center gap-1.5 text-xs font-bold",
                      VERDICT_TEXT[style.color],
                    )}
                  >
                    <span className="w-4 text-center">{style.icon}</span>
                    {VERDICT_GROUP_LABEL[verdict]}
                    <span className="font-medium text-muted">
                      ({items.length})
                    </span>
                  </h4>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {items.map((r, i) => (
                      <RequirementItem
                        key={`${r.requirement}-${i}`}
                        check={r}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}

            {rationale?.summary ? (
              <div className="flex flex-col gap-1 border-t border-divider pt-3">
                <p
                  className={cn(
                    "m-0 whitespace-pre-wrap text-sm leading-relaxed text-muted",
                    !showFullSummary &&
                      rationale.summary.length > SUMMARY_CLAMP_CHARS &&
                      "line-clamp-3",
                  )}
                >
                  {rationale.summary}
                </p>
                {rationale.summary.length > SUMMARY_CLAMP_CHARS ? (
                  <button
                    type="button"
                    className="self-start text-xs font-semibold text-accent hover:cursor-pointer hover:underline"
                    onClick={() => setShowFullSummary((v) => !v)}
                  >
                    {showFullSummary ? "Show less" : "Read more"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>

          <Link
            href={`/admin/jd/${jobId}/pipeline/${encodeURIComponent(currentId)}/evaluation`}
            className="text-xs font-semibold text-accent hover:underline"
          >
            Full evaluation (edit profile, interview notes) →
          </Link>
        </div>
      </Modal.Body>

      <Modal.Footer className="flex flex-wrap items-center gap-2 border-t border-divider px-5 py-3">
        <div className="mr-auto flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex gap-0.5">
              <Kbd>←</Kbd>
              <Kbd>→</Kbd>
            </span>
            Previous / next CV
          </span>
          {canDecide ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex gap-0.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
              </span>
              Change status
            </span>
          ) : (
            <span className="text-muted">
              View only — you can't change status.
            </span>
          )}
        </div>

        {canDecide ? (
          <Button
            variant="secondary"
            className="h-9 gap-1 px-3 text-sm font-bold"
            isDisabled={!canRevert}
            onPress={() => void revert()}
          >
            <Undo2 className="size-4" />
            Undo
          </Button>
        ) : null}

        <Button
          variant="secondary"
          className="h-9 gap-1 px-3 text-sm font-bold"
          isDisabled={!prevId}
          onPress={() => prevId && goTo(prevId)}
        >
          <ChevronLeft className="size-4" />
          Back
        </Button>

        <Select
          aria-label="Move to pipeline status"
          value={currentOptionKey}
          isDisabled={decisionsDisabled || stageOptions.length === 0}
          onChange={onStatusSelect}
          className="w-56"
        >
          <Select.Trigger className="h-9 min-h-9 min-w-0 justify-between gap-2 overflow-hidden px-3 text-xs">
            {resolved?.stageMapping && resolved.subStage ? (
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-left text-sm font-medium",
                  getSubStageTextColorClass(
                    resolved.subStage.code,
                    resolved.subStage.is_passed,
                    resolved.subStage.is_default,
                    resolved.stageMapping.pipeline_stages?.color,
                  ),
                )}
              >
                {resolved.stageMapping.pipeline_stages?.label ??
                  resolved.stageMapping.pipeline_stages?.code}
                {" · "}
                {resolved.subStage.label}
              </span>
            ) : (
              <span className="min-w-0 flex-1 text-left text-sm text-muted">
                Unassigned
              </span>
            )}
            <Select.Indicator className="shrink-0" />
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

        <Button
          variant="primary"
          className="h-9 gap-1 px-3 text-sm font-bold"
          isDisabled={!nextId}
          onPress={() => nextId && goTo(nextId)}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
      </Modal.Footer>
    </>
  );
}
