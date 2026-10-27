import type { QueryExecutor } from "@/lib/db/config/client";
import { buildSetClause } from "@/lib/db/query-helpers";

// Ported as-is (DB7X2K item 4): PKs stay `gen_random_uuid()`, not
// `uuid_generate_v7()` like every other new table — changing PK type on
// tables this widely FK'd is a separate, riskier migration than this one.

export type PipelineStageRow = {
  id: string;
  code: string;
  label: string;
  desc: string | null;
  color: string | null;
  allow_schedule: boolean;
  /** none | schedule | offer | probation (free text, extensible). */
  stage_type: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type CreatePipelineStageInput = {
  code: string;
  label: string;
  desc?: string | null;
  color?: string | null;
  allowSchedule?: boolean;
  stageType?: string;
};

export type UpdatePipelineStageInput = Partial<CreatePipelineStageInput>;

/** Keeps `allow_schedule` and `stage_type = 'schedule'` in sync; stageType wins when both are given. */
function resolveStageType(input: {
  stageType?: string;
  allowSchedule?: boolean;
}): { stageType: string | undefined; allowSchedule: boolean | undefined } {
  if (input.stageType !== undefined) {
    return { stageType: input.stageType, allowSchedule: input.stageType === "schedule" };
  }
  if (input.allowSchedule === true) return { stageType: "schedule", allowSchedule: true };
  return { stageType: undefined, allowSchedule: input.allowSchedule };
}

/**
 * Like {@link getPipelineStageById} but also returns a soft-deleted stage. For resolving a stage
 * that a job mapping / candidate still points at; never for pickers.
 */
export async function getPipelineStageByIdIncludingDeleted(
  db: QueryExecutor,
  id: string,
): Promise<PipelineStageRow | null> {
  const { rows } = await db.query<PipelineStageRow>(
    `SELECT id, code, label, "desc", color, allow_schedule, stage_type, created_at, updated_at, deleted_at
     FROM pipeline_stages WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getPipelineStageById(
  db: QueryExecutor,
  id: string,
): Promise<PipelineStageRow | null> {
  const { rows } = await db.query<PipelineStageRow>(
    `SELECT id, code, label, "desc", color, allow_schedule, stage_type, created_at, updated_at, deleted_at
     FROM pipeline_stages WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Soft-deleted stages that live pipelines still reference. Display-only: never use for pickers.
 */
export async function listDeletedStagesInUse(db: QueryExecutor): Promise<PipelineStageRow[]> {
  const { rows } = await db.query<PipelineStageRow>(
    `SELECT s.id, s.code, s.label, s."desc", s.color, s.allow_schedule, s.stage_type, s.created_at, s.updated_at, s.deleted_at
     FROM pipeline_stages s
     WHERE s.deleted_at IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM pipeline_rows r JOIN pipelines p ON p.id = r.pipeline_id
         WHERE r.pipeline_stage_id = s.id AND p.deleted_at IS NULL
       )
     ORDER BY s.label`,
  );
  return rows;
}

export async function listPipelineStages(
  db: QueryExecutor,
): Promise<PipelineStageRow[]> {
  const { rows } = await db.query<PipelineStageRow>(
    `SELECT id, code, label, "desc", color, allow_schedule, stage_type, created_at, updated_at, deleted_at
     FROM pipeline_stages WHERE deleted_at IS NULL ORDER BY label`,
  );
  return rows;
}

export async function createPipelineStage(
  db: QueryExecutor,
  input: CreatePipelineStageInput,
): Promise<PipelineStageRow> {
  const resolved = resolveStageType(input);
  const { rows } = await db.query<PipelineStageRow>(
    `INSERT INTO pipeline_stages (code, label, "desc", color, allow_schedule, stage_type)
     VALUES ($1, $2, $3, COALESCE($4, 'zinc'), COALESCE($5, false), COALESCE($6, 'none'))
     RETURNING id, code, label, "desc", color, allow_schedule, stage_type, created_at, updated_at, deleted_at`,
    [
      input.code,
      input.label,
      input.desc ?? null,
      input.color ?? null,
      resolved.allowSchedule ?? null,
      resolved.stageType ?? null,
    ],
  );
  return rows[0];
}

export async function updatePipelineStage(
  db: QueryExecutor,
  id: string,
  patch: UpdatePipelineStageInput,
): Promise<PipelineStageRow | null> {
  const resolved = resolveStageType(patch);
  let stageType = resolved.stageType;
  if (stageType === undefined && resolved.allowSchedule === false) {
    // Turning scheduling off only resets the type if it was 'schedule'.
    const current = await getPipelineStageById(db, id);
    if (current?.stage_type === "schedule") stageType = "none";
  }
  const { clause, values } = buildSetClause(
    {
      code: patch.code,
      label: patch.label,
      '"desc"': patch.desc,
      color: patch.color,
      allow_schedule: resolved.allowSchedule,
      stage_type: stageType,
    },
    2,
  );
  if (!clause) return getPipelineStageById(db, id);

  const { rows } = await db.query<PipelineStageRow>(
    `UPDATE pipeline_stages
     SET ${clause}, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, code, label, "desc", color, allow_schedule, stage_type, created_at, updated_at, deleted_at`,
    [id, ...values],
  );
  return rows[0] ?? null;
}

export async function softDeletePipelineStage(
  db: QueryExecutor,
  id: string,
): Promise<PipelineStageRow | null> {
  const { rows } = await db.query<PipelineStageRow>(
    `UPDATE pipeline_stages
     SET deleted_at = now(), updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, code, label, "desc", color, allow_schedule, stage_type, created_at, updated_at, deleted_at`,
    [id],
  );
  return rows[0] ?? null;
}

export type PipelineSubStageRow = {
  id: string;
  pipeline_stage_id: string;
  code: string;
  label: string;
  sequence_number: number;
  is_default: boolean;
  is_passed: boolean;
  is_terminal: boolean;
  requires_reason: boolean;
  requires_decision: boolean;
  is_withdraw: boolean;
  created_at: Date;
  deleted_at: Date | null;
};

export type CreatePipelineSubStageInput = {
  pipelineStageId: string;
  code: string;
  label: string;
  sequenceNumber: number;
  isDefault?: boolean;
  isPassed?: boolean;
  isTerminal?: boolean;
  requiresReason?: boolean;
  requiresDecision?: boolean;
  isWithdraw?: boolean;
};

export type UpdatePipelineSubStageInput = Partial<
  Omit<CreatePipelineSubStageInput, "pipelineStageId">
>;

export async function getPipelineSubStageById(
  db: QueryExecutor,
  id: string,
): Promise<PipelineSubStageRow | null> {
  const { rows } = await db.query<PipelineSubStageRow>(
    `SELECT * FROM pipeline_sub_stages WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listPipelineSubStages(
  db: QueryExecutor,
  pipelineStageId: string,
): Promise<PipelineSubStageRow[]> {
  const { rows } = await db.query<PipelineSubStageRow>(
    `SELECT * FROM pipeline_sub_stages
     WHERE pipeline_stage_id = $1 AND deleted_at IS NULL
     ORDER BY sequence_number`,
    [pipelineStageId],
  );
  return rows;
}

/** Batched variant of {@link listPipelineSubStages} for a set of stage ids in one query (see feedback on N+1 batching). */
export async function listPipelineSubStagesForStages(
  db: QueryExecutor,
  pipelineStageIds: string[],
): Promise<PipelineSubStageRow[]> {
  if (pipelineStageIds.length === 0) return [];
  const { rows } = await db.query<PipelineSubStageRow>(
    `SELECT * FROM pipeline_sub_stages
     WHERE pipeline_stage_id = ANY($1::uuid[]) AND deleted_at IS NULL
     ORDER BY sequence_number`,
    [pipelineStageIds],
  );
  return rows;
}

export async function createPipelineSubStage(
  db: QueryExecutor,
  input: CreatePipelineSubStageInput,
): Promise<PipelineSubStageRow> {
  const { rows } = await db.query<PipelineSubStageRow>(
    `INSERT INTO pipeline_sub_stages
       (pipeline_stage_id, code, label, sequence_number, is_default, is_passed,
        is_terminal, requires_reason, requires_decision, is_withdraw)
     VALUES ($1, $2, $3, $4, COALESCE($5, false), COALESCE($6, false),
             COALESCE($7, false), COALESCE($8, false), COALESCE($9, false), COALESCE($10, false))
     RETURNING *`,
    [
      input.pipelineStageId,
      input.code,
      input.label,
      input.sequenceNumber,
      input.isDefault ?? null,
      input.isPassed ?? null,
      input.isTerminal ?? null,
      input.requiresReason ?? null,
      input.requiresDecision ?? null,
      input.isWithdraw ?? null,
    ],
  );
  return rows[0];
}

export async function updatePipelineSubStage(
  db: QueryExecutor,
  id: string,
  patch: UpdatePipelineSubStageInput,
): Promise<PipelineSubStageRow | null> {
  const { clause, values } = buildSetClause(
    {
      code: patch.code,
      label: patch.label,
      sequence_number: patch.sequenceNumber,
      is_default: patch.isDefault,
      is_passed: patch.isPassed,
      is_terminal: patch.isTerminal,
      requires_reason: patch.requiresReason,
      requires_decision: patch.requiresDecision,
      is_withdraw: patch.isWithdraw,
    },
    2,
  );
  if (!clause) return getPipelineSubStageById(db, id);

  const { rows } = await db.query<PipelineSubStageRow>(
    `UPDATE pipeline_sub_stages
     SET ${clause}
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, ...values],
  );
  return rows[0] ?? null;
}

export async function softDeletePipelineSubStage(
  db: QueryExecutor,
  id: string,
): Promise<PipelineSubStageRow | null> {
  const { rows } = await db.query<PipelineSubStageRow>(
    `UPDATE pipeline_sub_stages
     SET deleted_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}

export type JobStageMappingRow = {
  id: string;
  job_id: string;
  pipeline_stage_id: string;
  sequence_number: number;
  /** Per-job SLA snapshotted from the pipeline row; null = none. */
  sla_days: number | null;
  /** Per-job scheduling flag; null = fall back to `pipeline_stages.allow_schedule`. */
  schedule: boolean | null;
  pipeline_row_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type CreateJobStageMappingInput = {
  jobId: string;
  pipelineStageId: string;
  sequenceNumber: number;
};

export async function getJobStageMappingById(
  db: QueryExecutor,
  id: string,
): Promise<JobStageMappingRow | null> {
  const { rows } = await db.query<JobStageMappingRow>(
    `SELECT * FROM job_stage_mappings WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listJobStageMappings(
  db: QueryExecutor,
  jobId: string,
): Promise<JobStageMappingRow[]> {
  const { rows } = await db.query<JobStageMappingRow>(
    `SELECT * FROM job_stage_mappings
     WHERE job_id = $1 AND deleted_at IS NULL
     ORDER BY sequence_number`,
    [jobId],
  );
  return rows;
}

export async function createJobStageMapping(
  db: QueryExecutor,
  input: CreateJobStageMappingInput,
): Promise<JobStageMappingRow> {
  const { rows } = await db.query<JobStageMappingRow>(
    `INSERT INTO job_stage_mappings (job_id, pipeline_stage_id, sequence_number)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.jobId, input.pipelineStageId, input.sequenceNumber],
  );
  return rows[0];
}

export async function updateJobStageMappingSequence(
  db: QueryExecutor,
  id: string,
  sequenceNumber: number,
): Promise<JobStageMappingRow | null> {
  const { rows } = await db.query<JobStageMappingRow>(
    `UPDATE job_stage_mappings
     SET sequence_number = $2, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, sequenceNumber],
  );
  return rows[0] ?? null;
}

export async function softDeleteJobStageMapping(
  db: QueryExecutor,
  id: string,
): Promise<JobStageMappingRow | null> {
  const { rows } = await db.query<JobStageMappingRow>(
    `UPDATE job_stage_mappings
     SET deleted_at = now(), updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Reconciles a job's `job_stage_mappings` rows with a new ordered list of
 * pipeline stage ids, preserving the `id` (and therefore
 * `campaign_applied.current_job_stage_mapping_id` references) of stages that
 * remain in the list. Replaces the old `upsert_job_stage_mappings` Postgres
 * RPC, which keyed off `job_opening_id` -- a column this table no longer has
 * under DB7X2K's merged `jobs` schema (it's `job_id` now).
 *
 * - Stages already active and present in `stageIds` are updated in place
 *   (only `sequence_number` changes) -- their `id` is never touched.
 * - Stages newly added to `stageIds` are inserted.
 * - Active stages no longer present in `stageIds` are soft-deleted.
 * - A `null`/empty `stageIds` soft-deletes every active mapping.
 * - Duplicate ids in `stageIds` are deduplicated (first occurrence wins).
 *
 * Composed from the CRUD functions above rather than a single statement --
 * caller should run this inside `withTransaction` (see `lib/db/client.ts`)
 * so the soft-delete/update/insert steps commit atomically. This is a
 * deliberate per-stage N+1 (one query per changed mapping): acceptable
 * because a job's pipeline is a handful of stages, not a paginated list --
 * don't reuse this loop-per-row shape for anything that scales with table
 * size (e.g. per-JD calls inside a JD list loop).
 */
export async function reconcileJobStageMappings(
  db: QueryExecutor,
  jobId: string,
  stageIds: string[] | null | undefined,
): Promise<JobStageMappingRow[]> {
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const id of stageIds ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(id);
  }

  const existing = await listJobStageMappings(db, jobId);
  const remainingExisting = new Map(
    existing.map((m) => [m.pipeline_stage_id, m]),
  );

  const result: JobStageMappingRow[] = [];
  for (let i = 0; i < deduped.length; i += 1) {
    const pipelineStageId = deduped[i];
    const sequenceNumber = i + 1;
    const current = remainingExisting.get(pipelineStageId);
    if (current) {
      remainingExisting.delete(pipelineStageId);
      const updated = await updateJobStageMappingSequence(
        db,
        current.id,
        sequenceNumber,
      );
      if (updated) result.push(updated);
    } else {
      const created = await createJobStageMapping(db, {
        jobId,
        pipelineStageId,
        sequenceNumber,
      });
      result.push(created);
    }
  }

  for (const stale of remainingExisting.values()) {
    await softDeleteJobStageMapping(db, stale.id);
  }

  return result;
}
