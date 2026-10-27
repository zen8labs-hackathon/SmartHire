import type { QueryExecutor } from "@/lib/db/config/client";
import { listPipelines, listPipelineRowsForPipelines } from "@/lib/db/pipelines";
import { listDeletedStagesInUse, listPipelineStages, listPipelineSubStagesForStages } from "@/lib/db/pipeline-stages";

export type PipelineSub = {
  id: string;
  label: string;
  def?: boolean;
  pass?: boolean;
  terminal?: boolean;
  reason?: boolean;
  decision?: boolean;
  withdraw?: boolean;
};
export type PipelineLibraryStage = {
  id: string;
  label: string;
  color: string;
  desc: string;
  schedule: boolean;
  type: string;
  subs: PipelineSub[];
  /** Soft-deleted but still referenced by a pipeline: display-only, not selectable. */
  deleted?: boolean;
};
export type PipelineView = {
  id: string;
  name: string;
  stages: { sid: string; sla: number; sch: boolean }[];
  by: string;
  at: string;
  /** Positions created from this pipeline (they keep their own stage copy). */
  usedBy: number;
};

const DEFAULT_COLOR = "var(--neutral-400)";

function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Stage library in the shape the pipelines UI expects (stage id = stage code). Live stages first,
 * then soft-deleted stages that live pipelines still use, flagged `deleted` (read-only, so the
 * pipeline chain can still name them).
 */
export async function getPipelineLibrary(db: QueryExecutor): Promise<PipelineLibraryStage[]> {
  const live = await listPipelineStages(db);
  const gone = await listDeletedStagesInUse(db);
  const stages = [...live, ...gone];
  const subs = await listPipelineSubStagesForStages(db, stages.map((s) => s.id));
  return stages.map((s) => ({
    id: s.code,
    label: s.label,
    color: s.color ?? DEFAULT_COLOR,
    desc: s.desc ?? "",
    schedule: s.allow_schedule,
    type: s.stage_type,
    ...(s.deleted_at ? { deleted: true } : {}),
    subs: subs
      .filter((x) => x.pipeline_stage_id === s.id)
      .sort((a, b) => a.sequence_number - b.sequence_number)
      .map((x) => ({
        id: x.code,
        label: x.label,
        ...(x.is_default ? { def: true } : {}),
        ...(x.is_passed ? { pass: true } : {}),
        ...(x.is_terminal ? { terminal: true } : {}),
        ...(x.requires_reason ? { reason: true } : {}),
        ...(x.requires_decision ? { decision: true } : {}),
        ...(x.is_withdraw ? { withdraw: true } : {}),
      })),
  }));
}

export async function getPipelines(db: QueryExecutor): Promise<PipelineView[]> {
  const pipelines = await listPipelines(db);
  const rows = await listPipelineRowsForPipelines(db, pipelines.map((p) => p.id));
  return pipelines.map((p) => ({
    id: p.id,
    name: p.name,
    stages: rows
      .filter((r) => r.pipeline_id === p.id)
      .map((r) => ({ sid: r.stage_code, sla: r.sla_days, sch: r.schedule })),
    by: p.by ?? "",
    at: formatDate(p.updated_at),
    usedBy: p.used_by ?? 0,
  }));
}
