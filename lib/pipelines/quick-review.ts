import type { JdRequirementCheck } from "@/lib/candidates/jd-match-rationale";

/**
 * Client-safe helpers for the pipeline table's quick-review modal: the
 * shared shape of a pipeline-move option (mirrors the sub-stage `<Select>`
 * on the table itself -- see `PipelineTableRow`) and prev/next navigation over
 * the rows the table is showing.
 */

/** Rows fetched per quick-review queue batch (see `JdAppliedCandidatesPipeline`'s `loadMoreQuickReview`) -- keeps each fetch small instead of loading every matching candidate up front. */
export const QUICK_REVIEW_BATCH_SIZE = 20;
/** Load the next batch once the reviewer is within this many rows of the end of what's loaded (see `QuickReviewModal`). */
export const QUICK_REVIEW_PREFETCH_THRESHOLD = 5;

/** One (stageMapping, subStage) the candidate can be moved to -- same set `allowedStageTargets` returns, shaped for the status `<Select>`. */
export type QuickReviewTarget = {
  stageMappingId: string;
  subStateId: string;
  label: string;
};

/** Requirement checks grouped by verdict, each group keeping the incoming (already sorted) order. */
export function groupRequirementsByVerdict(
  requirements: JdRequirementCheck[],
): Record<JdRequirementCheck["verdict"], JdRequirementCheck[]> {
  const groups: Record<JdRequirementCheck["verdict"], JdRequirementCheck[]> = {
    missing: [],
    partial: [],
    unclear: [],
    met: [],
  };
  for (const r of requirements) groups[r.verdict].push(r);
  return groups;
}

/** Prev/next around `id` in the ordered ids the pipeline table is showing (the review queue). */
export function reviewQueueNeighbors(
  ids: readonly string[],
  id: string | null,
): { index: number; total: number; prevId: string | null; nextId: string | null } {
  const index = id ? ids.indexOf(id) : -1;
  if (index === -1) {
    return { index: -1, total: ids.length, prevId: null, nextId: null };
  }
  return {
    index,
    total: ids.length,
    prevId: index > 0 ? ids[index - 1]! : null,
    nextId: index < ids.length - 1 ? ids[index + 1]! : null,
  };
}
