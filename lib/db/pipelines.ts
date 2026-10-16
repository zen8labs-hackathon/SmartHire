import { withTransaction, type QueryExecutor } from "@/lib/db/config/client";

export type PipelineRecord = {
  id: string;
  name: string;
  by: string | null;
  updated_at: Date;
};

export type PipelineRowRecord = {
  pipeline_id: string;
  stage_code: string;
  sequence_number: number;
  sla_days: number;
  schedule: boolean;
};

export async function listPipelines(
  db: QueryExecutor,
): Promise<PipelineRecord[]> {
  const { rows } = await db.query<PipelineRecord>(
    `SELECT p.id, p.name, COALESCE(u.username, u.email) AS by, p.updated_at
     FROM pipelines p
     LEFT JOIN users u ON u.id = COALESCE(p.updated_by, p.created_by)
     WHERE p.deleted_at IS NULL
     ORDER BY p.created_at`,
  );
  return rows;
}

export async function listPipelineRowsForPipelines(
  db: QueryExecutor,
  pipelineIds: string[],
): Promise<PipelineRowRecord[]> {
  if (pipelineIds.length === 0) return [];
  const { rows } = await db.query<PipelineRowRecord>(
    `SELECT r.pipeline_id, s.code AS stage_code, r.sequence_number, r.sla_days, r.schedule
     FROM pipeline_rows r
     JOIN pipeline_stages s ON s.id = r.pipeline_stage_id
     WHERE r.pipeline_id = ANY($1::uuid[])
     ORDER BY r.pipeline_id, r.sequence_number`,
    [pipelineIds],
  );
  return rows;
}

export class PipelineApplyError extends Error {
  constructor(
    public readonly code:
      "PIPELINE_NOT_FOUND" | "JOB_NOT_FOUND" | "JOB_HAS_STAGES",
    message: string,
  ) {
    super(message);
    this.name = "PipelineApplyError";
  }
}

/**
 * Applies a pipeline to a brand-new job: sets `jobs.pipeline_id` and snapshots the pipeline's rows
 * into `job_stage_mappings` (with sla_days / schedule / pipeline_row_id).
 *
 * Only for jobs that have no active stage mappings yet. A job that already has mappings (every
 * legacy job, or one with candidates) is refused (JOB_HAS_STAGES) so its mappings and the
 * `campaign_applied` rows pointing at them are never touched. Run inside `withTransaction`.
 */
export async function applyPipelineToJob(
  db: QueryExecutor,
  jobId: string,
  pipelineId: string,
  userId: string | null,
): Promise<void> {
  const { rows: jobs } = await db.query(
    `SELECT 1 FROM jobs WHERE id = $1 FOR UPDATE`,
    [jobId],
  );
  if (jobs.length === 0)
    throw new PipelineApplyError("JOB_NOT_FOUND", "Job not found");

  const { rows: existing } = await db.query(
    `SELECT 1 FROM job_stage_mappings WHERE job_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [jobId],
  );
  if (existing.length > 0) {
    throw new PipelineApplyError(
      "JOB_HAS_STAGES",
      "Job already has pipeline stages; a pipeline can only be applied to a new job",
    );
  }

  const { rows: pipelineRows } = await db.query<{
    id: string;
    pipeline_stage_id: string;
    sequence_number: number;
    sla_days: number;
    schedule: boolean;
  }>(
    `SELECT r.id, r.pipeline_stage_id, r.sequence_number, r.sla_days, r.schedule
     FROM pipeline_rows r
     JOIN pipelines p ON p.id = r.pipeline_id AND p.deleted_at IS NULL
     WHERE r.pipeline_id = $1
     ORDER BY r.sequence_number`,
    [pipelineId],
  );
  if (pipelineRows.length === 0) {
    throw new PipelineApplyError(
      "PIPELINE_NOT_FOUND",
      "Pipeline not found or has no stages",
    );
  }

  for (const row of pipelineRows) {
    await db.query(
      `INSERT INTO job_stage_mappings
         (job_id, pipeline_stage_id, sequence_number, sla_days, schedule, pipeline_row_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        jobId,
        row.pipeline_stage_id,
        row.sequence_number,
        row.sla_days,
        row.schedule,
        row.id,
      ],
    );
  }

  await db.query(
    `UPDATE jobs SET pipeline_id = $2, updated_by = $3, updated_at = now() WHERE id = $1`,
    [jobId, pipelineId, userId],
  );
}

/** True when the pipeline exists, is not deleted and has at least one stage row. */
export async function isPipelineUsable(
  db: QueryExecutor,
  pipelineId: string,
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM pipelines p
     WHERE p.id = $1 AND p.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM pipeline_rows r WHERE r.pipeline_id = p.id)`,
    [pipelineId],
  );
  return rows.length > 0;
}

export type PipelineRowInput = {
  stageCode: string;
  slaDays: number;
  schedule: boolean;
};

export class PipelineWriteError extends Error {
  constructor(
    public readonly code: "UNKNOWN_STAGE" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "PipelineWriteError";
  }
}

export async function getPipelineRecordById(
  db: QueryExecutor,
  id: string,
): Promise<PipelineRecord | null> {
  const { rows } = await db.query<PipelineRecord>(
    `SELECT p.id, p.name, COALESCE(u.username, u.email) AS by, p.updated_at
     FROM pipelines p
     LEFT JOIN users u ON u.id = COALESCE(p.updated_by, p.created_by)
     WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

/** Replaces all rows of a pipeline. Stage codes are resolved to live library stages. */
async function replacePipelineRows(
  db: QueryExecutor,
  pipelineId: string,
  rows: PipelineRowInput[],
): Promise<void> {
  const codes = rows.map((r) => r.stageCode);
  const { rows: stages } = await db.query<{ id: string; code: string }>(
    `SELECT id, code FROM pipeline_stages WHERE code = ANY($1::text[]) AND deleted_at IS NULL`,
    [codes],
  );
  const idByCode = new Map(stages.map((s) => [s.code, s.id]));
  const missing = codes.filter((c) => !idByCode.has(c));
  if (missing.length > 0) {
    throw new PipelineWriteError(
      "UNKNOWN_STAGE",
      `Unknown stage: ${[...new Set(missing)].join(", ")}`,
    );
  }

  await db.query(`DELETE FROM pipeline_rows WHERE pipeline_id = $1`, [pipelineId]);
  for (const [i, row] of rows.entries()) {
    await db.query(
      `INSERT INTO pipeline_rows (pipeline_id, pipeline_stage_id, sequence_number, sla_days, schedule)
       VALUES ($1, $2, $3, $4, $5)`,
      [pipelineId, idByCode.get(row.stageCode), i + 1, row.slaDays, row.schedule],
    );
  }
}

/** Creates a pipeline with its ordered rows in one transaction. Throws a unique violation on duplicate name. */
export async function createPipeline(input: {
  name: string;
  rows: PipelineRowInput[];
  userId: string | null;
}): Promise<string> {
  return withTransaction(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO pipelines (name, created_by, updated_by) VALUES ($1, $2, $2) RETURNING id`,
      [input.name, input.userId],
    );
    const id = rows[0].id;
    await replacePipelineRows(db, id, input.rows);
    return id;
  });
}

/**
 * Updates name and/or rows. Jobs that already applied the pipeline keep their own
 * `job_stage_mappings` snapshot, so they are unaffected. Returns false when not found.
 */
export async function updatePipeline(
  id: string,
  patch: { name?: string; rows?: PipelineRowInput[]; userId: string | null },
): Promise<boolean> {
  return withTransaction(async (db) => {
    const { rows } = await db.query(
      `UPDATE pipelines
       SET name = COALESCE($2, name), updated_by = $3, updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id, patch.name ?? null, patch.userId],
    );
    if (rows.length === 0) return false;
    if (patch.rows) await replacePipelineRows(db, id, patch.rows);
    return true;
  });
}

/** Soft-deletes a pipeline. Jobs referencing it keep their snapshotted stage mappings. */
export async function softDeletePipeline(
  db: QueryExecutor,
  id: string,
  userId: string | null,
): Promise<boolean> {
  const { rows } = await db.query(
    `UPDATE pipelines SET deleted_at = now(), updated_at = now(), updated_by = $2
     WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [id, userId],
  );
  return rows.length > 0;
}
