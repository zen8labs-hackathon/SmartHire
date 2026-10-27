import type { QueryExecutor } from "@/lib/db/config/client";

/** Read models for the migration wizard and Migration Center (all read-only). */

export type MigrationPipelineRow = {
  id: string;
  pipelineStageId: string;
  sequence: number;
  code: string;
  label: string;
  stageType: string | null;
  stageDeleted: boolean;
};

export type MigrationPipeline = { id: string; name: string; rows: MigrationPipelineRow[] };

export type LegacyMappingOption = {
  id: string;
  pipelineStageId: string;
  sequence: number;
  label: string;
  stageDeleted: boolean;
  candidates: number;
  /** Row this mapping already follows (adopt-in-place hint). */
  pipelineRowId: string | null;
};

export type MigrationOptions = {
  job: { id: string; title: string; flowVersion: number };
  mappings: LegacyMappingOption[];
  pipelines: MigrationPipeline[];
  /** Interviews that will show up in Calendar after conversion (informational). */
  scheduledInterviews: number;
};

/** Live pipelines with at least one row on a live stage (the only valid conversion targets). */
export async function listUsablePipelines(db: QueryExecutor): Promise<MigrationPipeline[]> {
  const { rows } = await db.query<{
    pipeline_id: string; name: string; row_id: string; pipeline_stage_id: string; sequence_number: number;
    code: string; label: string; stage_type: string | null; stage_deleted_at: Date | null;
  }>(
    `SELECT p.id AS pipeline_id, p.name, r.id AS row_id, r.pipeline_stage_id, r.sequence_number,
            s.code, s.label, s.stage_type, s.deleted_at AS stage_deleted_at
     FROM pipelines p
     JOIN pipeline_rows r ON r.pipeline_id = p.id
     JOIN pipeline_stages s ON s.id = r.pipeline_stage_id
     WHERE p.deleted_at IS NULL
     ORDER BY p.created_at, p.id, r.sequence_number`,
  );
  const byId = new Map<string, MigrationPipeline>();
  for (const r of rows) {
    const p = byId.get(r.pipeline_id) ?? { id: r.pipeline_id, name: r.name, rows: [] };
    p.rows.push({
      id: r.row_id, pipelineStageId: r.pipeline_stage_id, sequence: r.sequence_number,
      code: r.code, label: r.label, stageType: r.stage_type, stageDeleted: !!r.stage_deleted_at,
    });
    byId.set(r.pipeline_id, p);
  }
  return [...byId.values()].filter((p) => p.rows.some((r) => !r.stageDeleted));
}

export async function getMigrationOptions(db: QueryExecutor, jobId: string): Promise<MigrationOptions | null> {
  const { rows: jobs } = await db.query<{ id: string; position: string; flow_version: number }>(
    `SELECT id, position, flow_version FROM jobs WHERE id = $1 AND deleted_at IS NULL`,
    [jobId],
  );
  if (jobs.length === 0) return null;

  const { rows: maps } = await db.query<{
    id: string; pipeline_stage_id: string; sequence_number: number; label: string;
    stage_deleted_at: Date | null; candidates: number; pipeline_row_id: string | null;
  }>(
    `SELECT m.id, m.pipeline_stage_id, m.sequence_number, s.label, s.deleted_at AS stage_deleted_at,
            m.pipeline_row_id,
            (SELECT count(*)::int FROM campaign_applied ca
              WHERE ca.current_job_stage_mapping_id = m.id AND ca.deleted_at IS NULL) AS candidates
     FROM job_stage_mappings m
     JOIN pipeline_stages s ON s.id = m.pipeline_stage_id
     WHERE m.job_id = $1 AND m.deleted_at IS NULL
     ORDER BY m.sequence_number`,
    [jobId],
  );

  const { rows: sched } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n
     FROM candidate_schedules cs
     JOIN campaign_applied ca ON ca.id = cs.campaign_applied_id
     JOIN job_stage_mappings m ON m.id = ca.current_job_stage_mapping_id
     WHERE m.job_id = $1 AND cs.status IN ('Scheduled', 'Confirmed')`,
    [jobId],
  );

  return {
    job: { id: jobs[0].id, title: jobs[0].position, flowVersion: jobs[0].flow_version },
    mappings: maps.map((m) => ({
      id: m.id, pipelineStageId: m.pipeline_stage_id, sequence: m.sequence_number, label: m.label,
      stageDeleted: !!m.stage_deleted_at, candidates: m.candidates, pipelineRowId: m.pipeline_row_id,
    })),
    pipelines: await listUsablePipelines(db),
    scheduledInterviews: sched[0]?.n ?? 0,
  };
}

export type MigrationProgressRow = {
  jobId: string;
  title: string;
  status: string;
  flowVersion: number;
  candidates: number;
  convertedAt: string | null;
  convertedBy: string | null;
};

export async function listMigrationProgress(db: QueryExecutor): Promise<MigrationProgressRow[]> {
  const { rows } = await db.query<{
    id: string; position: string; status: string; flow_version: number; candidates: number;
    confirmed_at: Date | null; by: string | null;
  }>(
    `SELECT j.id, j.position, j.status, j.flow_version,
            (SELECT count(*)::int FROM campaign_applied ca WHERE ca.job_id = j.id AND ca.deleted_at IS NULL) AS candidates,
            lm.confirmed_at, COALESCE(u.username, u.email) AS by
     FROM jobs j
     LEFT JOIN LATERAL (
       SELECT confirmed_at, confirmed_by FROM legacy_migrations
       WHERE entity_type = 'job' AND entity_id = j.id::text AND status = 'applied'
       ORDER BY confirmed_at DESC LIMIT 1
     ) lm ON true
     LEFT JOIN users u ON u.id = lm.confirmed_by
     WHERE j.deleted_at IS NULL
     ORDER BY j.flow_version, j.position`,
  );
  return rows.map((r) => ({
    jobId: r.id, title: r.position, status: r.status, flowVersion: r.flow_version, candidates: r.candidates,
    convertedAt: r.confirmed_at ? new Date(r.confirmed_at).toISOString() : null, convertedBy: r.by,
  }));
}
