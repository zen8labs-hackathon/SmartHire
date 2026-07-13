import {
  fromDate,
  getLocalTimeZone,
  toCalendarDateTime,
  type CalendarDate,
  type CalendarDateTime,
} from "@internationalized/date";
import type { RangeValue } from "react-aria-components";

import { type JdPipelineApplicationRow } from "@/lib/candidates/campaign-applied-table-row";
import { isFailSubStageCode } from "@/lib/candidates/pipeline-phase";
import {
  isCustomTransitionAllowed,
  resolveCandidatePipelineIds,
  wasCandidateStageOrphaned,
  type StageMapping,
  type SubStage,
} from "@/lib/pipelines/transition-validator";

/** A candidate's resolved current stage mapping + sub-stage, with the full objects for display/eligibility checks. */
export type ResolvedRowPipeline = {
  stageMappingId: string | null;
  subStateId: string | null;
  stageMapping: StageMapping | null;
  subStage: SubStage | null;
  orphaned: boolean;
};

export function resolveRowPipeline(
  r: JdPipelineApplicationRow,
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
export function allowedStageTargets(
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
export function findFailSubStage(
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

export function stageSubStageOptionKey(
  stageMappingId: string,
  subStateId: string,
): string {
  return `${stageMappingId}:${subStateId}`;
}

export function formatSchedule(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(t));
}

export function localDatetimeToIso(local: string): string | null {
  if (!local?.trim()) return null;
  const ms = new Date(local).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function isoToCalendarDateTime(
  iso: string | null | undefined,
): CalendarDateTime | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return toCalendarDateTime(fromDate(d, getLocalTimeZone()));
}

export function calendarDateTimeToIso(
  value: CalendarDateTime | null,
): string | null {
  if (!value) return null;
  return value.toDate(getLocalTimeZone()).toISOString();
}

function cvDay(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function rowMatchesUploadDateRange(
  r: JdPipelineApplicationRow,
  range: RangeValue<CalendarDate> | null,
): boolean {
  if (!range) return true;
  const day = cvDay(r.cv_created_at ?? r.created_at);
  if (!day) return false;
  if (day < range.start.toString()) return false;
  if (day > range.end.toString()) return false;
  return true;
}

export function rowMatchesSearch(r: JdPipelineApplicationRow, q: string): boolean {
  if (!q.trim()) return true;
  const lower = q.trim().toLowerCase();
  return (
    (r.candidate_name?.toLowerCase().includes(lower) ?? false) ||
    (r.candidate_role?.toLowerCase().includes(lower) ?? false) ||
    (r.candidate_skills?.some((s) => s.toLowerCase().includes(lower)) ?? false) ||
    (r.candidate_email?.toLowerCase().includes(lower) ?? false) ||
    (r.candidate_phone?.toLowerCase().includes(lower) ?? false)
  );
}
