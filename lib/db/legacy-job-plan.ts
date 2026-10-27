import { createHash } from "node:crypto";

import type { QueryExecutor } from "@/lib/db/config/client";

/**
 * Pure planning for converting ONE legacy job onto a pipeline (see
 * docs/legacy-data-migration-plan.md). `loadConversionInputs` reads, and
 * `buildConversionPlan` decides -- the same plan feeds the dry-run diff and
 * the apply step (which rebuilds it under the job lock).
 */

export type MappingPair = { oldMappingId: string; pipelineRowId: string };

export type PlanIssue = { code: string; message: string; ref?: string };

export type PipelineRowInfo = {
  id: string;
  pipeline_stage_id: string;
  sequence_number: number;
  sla_days: number;
  schedule: boolean;
  stage_code: string;
  stage_label: string;
  stage_type: string | null;
  stage_deleted: boolean;
};

export type OldMappingInfo = {
  id: string;
  pipeline_stage_id: string;
  sequence_number: number;
  sla_days: number | null;
  schedule: boolean | null;
  pipeline_row_id: string | null;
  stage_label: string;
  stage_deleted: boolean;
};

export type ApplicationInfo = {
  id: string;
  mapping_id: string;
  sub_state_id: string | null;
  hired_at: Date | string | null;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  mapping_deleted: boolean;
};

export type SubStageInfo = {
  id: string;
  pipeline_stage_id: string;
  code: string;
  is_default: boolean;
  deleted_at: Date | string | null;
};

export type ConversionInputs = {
  job: { id: string; flow_version: number; pipeline_id: string | null } | null;
  pipelineUsable: boolean;
  rows: PipelineRowInfo[];
  oldMappings: OldMappingInfo[];
  applications: ApplicationInfo[];
  subStages: SubStageInfo[];
  stageVersions: { id: string; updated_at: string }[];
  /** Other jobs that would be affected if `probationStageId` becomes probation-type. */
  probationOtherJobs: { id: string; position: string }[];
};

export type Repoint = {
  applicationId: string;
  fromMappingId: string;
  toMappingId: string | null;
  /** Row the target mapping is created from (resolved to a mapping id on apply). */
  toRowId: string;
  fromSubStateId: string | null;
  toSubStateId: string | null;
  subRemapped: boolean;
};

export type HiredAtChange = {
  applicationId: string;
  from: string | null;
  to: string | null;
};

export type ConversionOptions = {
  /** `pipeline_stage_id` HR picked as the probation stage (sets stage_type). */
  probationStageId?: string | null;
};

export type ConversionPlan = {
  jobId: string;
  pipelineId: string;
  mode: "in_place" | "remap";
  pairs: MappingPair[];
  probationStageId: string | null;
  repoints: Repoint[];
  hiredAtChanges: HiredAtChange[];
  probationOtherJobs: { id: string; position: string }[];
  blockers: PlanIssue[];
  warnings: PlanIssue[];
  /** Hash of everything config-related; apply rejects when it differs from the dry-run's. */
  fingerprint: string;
};

const PROBATION = "probation";

const iso = (d: Date | string | null): string | null =>
  d === null ? null : new Date(d).toISOString();

export async function loadConversionInputs(
  db: QueryExecutor,
  jobId: string,
  pipelineId: string,
  opts: ConversionOptions = {},
): Promise<ConversionInputs> {
  const { rows: jobs } = await db.query<{
    id: string;
    flow_version: number;
    pipeline_id: string | null;
  }>(`SELECT id, flow_version, pipeline_id FROM jobs WHERE id = $1`, [jobId]);

  const { rows: usable } = await db.query(
    `SELECT 1 FROM pipelines p
     WHERE p.id = $1 AND p.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM pipeline_rows r
                   JOIN pipeline_stages s ON s.id = r.pipeline_stage_id AND s.deleted_at IS NULL
                   WHERE r.pipeline_id = p.id)`,
    [pipelineId],
  );

  const { rows: pipelineRows } = await db.query<
    Omit<PipelineRowInfo, "stage_deleted"> & { stage_deleted_at: Date | null }
  >(
    `SELECT r.id, r.pipeline_stage_id, r.sequence_number, r.sla_days, r.schedule,
            s.code AS stage_code, s.label AS stage_label, s.stage_type,
            s.deleted_at AS stage_deleted_at
     FROM pipeline_rows r
     JOIN pipeline_stages s ON s.id = r.pipeline_stage_id
     WHERE r.pipeline_id = $1
     ORDER BY r.sequence_number`,
    [pipelineId],
  );

  const { rows: oldMappings } = await db.query<
    Omit<OldMappingInfo, "stage_deleted"> & { stage_deleted_at: Date | null }
  >(
    `SELECT m.id, m.pipeline_stage_id, m.sequence_number, m.sla_days, m.schedule,
            m.pipeline_row_id, s.label AS stage_label, s.deleted_at AS stage_deleted_at
     FROM job_stage_mappings m
     JOIN pipeline_stages s ON s.id = m.pipeline_stage_id
     WHERE m.job_id = $1 AND m.deleted_at IS NULL
     ORDER BY m.sequence_number`,
    [jobId],
  );

  const { rows: applications } = await db.query<
    Omit<ApplicationInfo, "mapping_deleted"> & { mapping_deleted_at: Date | null }
  >(
    `SELECT ca.id, ca.current_job_stage_mapping_id AS mapping_id,
            ca.current_sub_state_id AS sub_state_id, ca.hired_at, ca.updated_at,
            ca.deleted_at, m.deleted_at AS mapping_deleted_at
     FROM campaign_applied ca
     JOIN job_stage_mappings m ON m.id = ca.current_job_stage_mapping_id
     WHERE m.job_id = $1`,
    [jobId],
  );

  const stageIds = [
    ...new Set([
      ...pipelineRows.map((r) => r.pipeline_stage_id),
      ...oldMappings.map((m) => m.pipeline_stage_id),
    ]),
  ];

  const { rows: subStages } = stageIds.length
    ? await db.query<SubStageInfo>(
        `SELECT id, pipeline_stage_id, code, is_default, deleted_at
         FROM pipeline_sub_stages WHERE pipeline_stage_id = ANY($1::uuid[])
         ORDER BY pipeline_stage_id, sequence_number`,
        [stageIds],
      )
    : { rows: [] as SubStageInfo[] };

  const { rows: versions } = stageIds.length
    ? await db.query<{ id: string; updated_at: Date }>(
        `SELECT id, updated_at FROM pipeline_stages WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [stageIds],
      )
    : { rows: [] as { id: string; updated_at: Date }[] };

  let probationOtherJobs: { id: string; position: string }[] = [];
  if (opts.probationStageId) {
    const res = await db.query<{ id: string; position: string }>(
      `SELECT DISTINCT j.id, j.position
       FROM job_stage_mappings m JOIN jobs j ON j.id = m.job_id
       WHERE m.pipeline_stage_id = $1 AND m.deleted_at IS NULL AND j.id <> $2`,
      [opts.probationStageId, jobId],
    );
    probationOtherJobs = res.rows;
  }

  return {
    job: jobs[0] ?? null,
    pipelineUsable: usable.length > 0,
    rows: pipelineRows.map(({ stage_deleted_at, ...r }) => ({
      ...r,
      stage_deleted: stage_deleted_at !== null,
    })),
    oldMappings: oldMappings.map(({ stage_deleted_at, ...m }) => ({
      ...m,
      stage_deleted: stage_deleted_at !== null,
    })),
    applications: applications.map(({ mapping_deleted_at, ...a }) => ({
      ...a,
      mapping_deleted: mapping_deleted_at !== null,
    })),
    subStages,
    stageVersions: versions.map((v) => ({ id: v.id, updated_at: new Date(v.updated_at).toISOString() })),
    probationOtherJobs,
  };
}

/**
 * Sub-stage rule: same stage keeps the sub-state; otherwise the sub-stage
 * with the same `code` in the target stage, else the target's default.
 */
export function resolveSubState(
  currentSubId: string | null,
  fromStageId: string,
  toStageId: string,
  subStages: SubStageInfo[],
): { subId: string | null; remapped: boolean; ok: boolean } {
  if (currentSubId === null) return { subId: null, remapped: false, ok: true };
  if (fromStageId === toStageId) return { subId: currentSubId, remapped: false, ok: true };
  const current = subStages.find((s) => s.id === currentSubId);
  const targets = subStages.filter((s) => s.pipeline_stage_id === toStageId && !s.deleted_at);
  const byCode = current ? targets.find((s) => s.code === current.code) : undefined;
  const target = byCode ?? targets.find((s) => s.is_default);
  if (!target) return { subId: null, remapped: true, ok: false };
  return { subId: target.id, remapped: true, ok: true };
}

export function buildConversionPlan(
  inputs: ConversionInputs,
  pipelineId: string,
  pairs: MappingPair[],
  opts: ConversionOptions = {},
): ConversionPlan {
  const blockers: PlanIssue[] = [];
  const warnings: PlanIssue[] = [];
  const { job, rows, oldMappings, applications, subStages } = inputs;
  const jobId = job?.id ?? "";
  const probationStageId = opts.probationStageId ?? null;

  if (!job) blockers.push({ code: "JOB_NOT_FOUND", message: "Job not found." });
  else if (job.flow_version !== 1)
    blockers.push({ code: "NOT_LEGACY", message: "This job is already on the new flow." });
  if (!inputs.pipelineUsable)
    blockers.push({
      code: "PIPELINE_UNUSABLE",
      message: "The pipeline does not exist, is deleted, or has no live stages.",
    });
  for (const r of rows) {
    if (r.stage_deleted)
      blockers.push({
        code: "PIPELINE_STAGE_DELETED",
        message: `Pipeline stage "${r.stage_label}" is deleted.`,
        ref: r.id,
      });
  }

  // Mapping table: each old mapping -> exactly one pipeline row, rows used once.
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const pairByOld = new Map<string, MappingPair>();
  const usedRows = new Set<string>();
  for (const p of pairs) {
    if (pairByOld.has(p.oldMappingId))
      blockers.push({ code: "MAPPING_DUPLICATE", message: "An old stage is mapped twice.", ref: p.oldMappingId });
    pairByOld.set(p.oldMappingId, p);
    if (!rowById.has(p.pipelineRowId))
      blockers.push({ code: "MAPPING_UNKNOWN_ROW", message: "Mapped pipeline row is not in this pipeline.", ref: p.pipelineRowId });
    if (usedRows.has(p.pipelineRowId))
      blockers.push({ code: "ROW_USED_TWICE", message: "Two old stages map to the same pipeline stage.", ref: p.pipelineRowId });
    usedRows.add(p.pipelineRowId);
  }
  const oldIds = new Set(oldMappings.map((m) => m.id));
  for (const p of pairs) {
    if (!oldIds.has(p.oldMappingId))
      blockers.push({ code: "MAPPING_UNKNOWN_OLD", message: "Mapped old stage does not belong to this job.", ref: p.oldMappingId });
  }

  // UNIQUE (pipeline_id, sequence_number) holds in the source table; guard anyway.
  const seqs = new Set<number>();
  for (const r of rows) {
    if (seqs.has(r.sequence_number))
      blockers.push({ code: "PIPELINE_SEQUENCE_DUPLICATE", message: "Pipeline has duplicate sequence numbers.", ref: r.id });
    seqs.add(r.sequence_number);
  }

  const stageSeen = new Set<string>();
  for (const m of oldMappings) {
    if (stageSeen.has(m.pipeline_stage_id))
      blockers.push({
        code: "DUPLICATE_STAGE_MAPPING",
        message: `Stage "${m.stage_label}" appears more than once in this job.`,
        ref: m.id,
      });
    stageSeen.add(m.pipeline_stage_id);
    if (!pairByOld.has(m.id))
      blockers.push({
        code: m.stage_deleted ? "DELETED_STAGE_UNMAPPED" : "MAPPING_INCOMPLETE",
        message: m.stage_deleted
          ? `Deleted stage "${m.stage_label}" is not mapped to a pipeline stage.`
          : `Stage "${m.stage_label}" is not mapped to a pipeline stage.`,
        ref: m.id,
      });
  }

  const deletedRefs = applications.filter((a) => !a.deleted_at && a.mapping_deleted);
  if (deletedRefs.length > 0)
    blockers.push({
      code: "DELETED_MAPPING_REFERENCED",
      message: `${deletedRefs.length} candidate(s) point at a deleted stage mapping of this job.`,
    });

  // In place when the old stage set equals the pipeline exactly (same stages, same order).
  const inPlace =
    oldMappings.length > 0 &&
    oldMappings.length === rows.length &&
    oldMappings.every(
      (m, i) => rows[i].pipeline_stage_id === m.pipeline_stage_id && pairByOld.get(m.id)?.pipelineRowId === rows[i].id,
    );
  const mode: ConversionPlan["mode"] = inPlace ? "in_place" : "remap";

  // Candidate repoints (remap only; in-place leaves campaign_applied untouched).
  const repoints: Repoint[] = [];
  if (!inPlace) {
    const mappingById = new Map(oldMappings.map((m) => [m.id, m]));
    for (const a of applications) {
      const pair = pairByOld.get(a.mapping_id);
      const old = mappingById.get(a.mapping_id);
      const row = pair ? rowById.get(pair.pipelineRowId) : undefined;
      if (!pair || !old || !row) continue;
      const sub = resolveSubState(a.sub_state_id, old.pipeline_stage_id, row.pipeline_stage_id, subStages);
      if (!sub.ok && !a.deleted_at)
        blockers.push({
          code: "SUBSTATE_UNRESOLVED",
          message: `Stage "${row.stage_label}" has no matching or default sub-stage for a candidate.`,
          ref: a.id,
        });
      repoints.push({
        applicationId: a.id,
        fromMappingId: a.mapping_id,
        toMappingId: null,
        toRowId: row.id,
        fromSubStateId: a.sub_state_id,
        toSubStateId: sub.subId,
        subRemapped: sub.remapped,
      });
    }
    const remapped = repoints.filter((r) => r.subRemapped).length;
    if (remapped > 0)
      warnings.push({ code: "SUBSTATE_REMAPPED", message: `${remapped} candidate(s) get a different sub-state.` });
  }

  // hired_at under the new rule: set iff the candidate sits in a probation stage.
  let probationInPipeline = rows.some((r) => r.stage_type === PROBATION || r.pipeline_stage_id === probationStageId);
  if (probationStageId && !rows.some((r) => r.pipeline_stage_id === probationStageId)) {
    blockers.push({ code: "PROBATION_STAGE_INVALID", message: "The chosen probation stage is not part of the pipeline." });
    probationInPipeline = false;
  }
  const targetStageOf = (a: ApplicationInfo): string | null => {
    const old = oldMappings.find((m) => m.id === a.mapping_id);
    if (!old) return null;
    if (inPlace) return old.pipeline_stage_id;
    const pair = pairByOld.get(old.id);
    return pair ? rowById.get(pair.pipelineRowId)?.pipeline_stage_id ?? null : null;
  };
  const isProbation = (stageId: string): boolean =>
    stageId === probationStageId || rows.find((r) => r.pipeline_stage_id === stageId)?.stage_type === PROBATION;
  const hiredAtChanges: HiredAtChange[] = [];
  for (const a of applications) {
    if (a.deleted_at) continue;
    const stageId = targetStageOf(a);
    if (!stageId) continue;
    const current = iso(a.hired_at);
    const next = isProbation(stageId) ? current ?? iso(a.updated_at) : null;
    if (next !== current) hiredAtChanges.push({ applicationId: a.id, from: current, to: next });
  }
  if (!probationInPipeline && applications.some((a) => !a.deleted_at && a.hired_at)) {
    blockers.push({
      code: "HIRED_WITHOUT_PROBATION",
      message: "Some candidates are marked hired but the pipeline has no probation stage. Choose one.",
    });
  }
  if (hiredAtChanges.length > 0)
    warnings.push({ code: "HIRED_AT_CHANGES", message: `${hiredAtChanges.length} candidate(s) change hired status.` });

  if (probationStageId && inputs.probationOtherJobs.length > 0 && rows.find((r) => r.pipeline_stage_id === probationStageId)?.stage_type !== PROBATION)
    warnings.push({
      code: "PROBATION_TYPE_SHARED",
      message: `Marking this stage as probation also affects ${inputs.probationOtherJobs.length} other job(s).`,
    });

  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        pipelineId,
        probationStageId,
        pairs: [...pairs].sort((a, b) => a.oldMappingId.localeCompare(b.oldMappingId)),
        rows: rows.map((r) => [r.id, r.pipeline_stage_id, r.sequence_number, r.sla_days, r.schedule, r.stage_type]),
        old: oldMappings.map((m) => [m.id, m.pipeline_stage_id, m.sequence_number]),
        stages: inputs.stageVersions,
        subs: subStages.map((s) => [s.id, s.code, s.is_default, iso(s.deleted_at)]),
      }),
    )
    .digest("hex");

  return {
    jobId,
    pipelineId,
    mode,
    pairs,
    probationStageId,
    repoints,
    hiredAtChanges,
    probationOtherJobs: inputs.probationOtherJobs,
    blockers,
    warnings,
    fingerprint,
  };
}
