import type { QueryExecutor } from "@/lib/db/config/client";
import {
  buildConversionPlan,
  loadConversionInputs,
  type ConversionOptions,
  type ConversionPlan,
  type MappingPair,
} from "@/lib/db/legacy-job-plan";
import { adoptPipelineForLegacyJob } from "@/lib/db/pipelines";
import { createHash } from "node:crypto";
import {
  applyDataPlan,
  buildDataPlan,
  loadDataInputs,
  type DataDecisions,
  type DataPlan,
} from "@/lib/migration/job-data-plan";

/**
 * Per-job legacy -> new-flow conversion (Track A). Dry-run is read-only;
 * apply runs inside the caller's transaction and is audited in
 * `legacy_migrations`. Exactly one job per call -- never bulk.
 */

const ENTITY = "job";

export class ConversionError extends Error {
  constructor(
    readonly code:
      | "BLOCKED"
      | "STALE_PLAN"
      | "NOT_LEGACY"
      | "JOB_NOT_FOUND",
    message: string,
    readonly plan?: ConversionPlan,
  ) {
    super(message);
    this.name = "ConversionError";
  }
}

export type ConversionInput = {
  jobId: string;
  pipelineId: string;
  pairs: MappingPair[];
  probationStageId?: string | null;
  /** HR decisions for hire type, interview mode and evaluation marks (Track B/C). */
  data?: DataDecisions;
};

export type FullConversionPlan = ConversionPlan & { data: DataPlan };

const opts = (i: ConversionInput): ConversionOptions => ({ probationStageId: i.probationStageId ?? null });

export async function dryRunJobConversion(db: QueryExecutor, input: ConversionInput): Promise<FullConversionPlan> {
  const inputs = await loadConversionInputs(db, input.jobId, input.pipelineId, opts(input));
  const base = buildConversionPlan(inputs, input.pipelineId, input.pairs, opts(input));
  // Data items only matter once the job is a real legacy job; skip for missing jobs.
  const data = buildDataPlan(await loadDataInputs(db, input.jobId), input.data);
  return {
    ...base,
    data,
    blockers: [...base.blockers, ...data.blockers],
    warnings: [...base.warnings, ...data.warnings],
    fingerprint: createHash("sha256").update(base.fingerprint + data.fingerprint).digest("hex"),
  };
}

export type ApplyResult = { migrationId: string; plan: FullConversionPlan };

/** Must run in a transaction. `expectedFingerprint` comes from the dry-run the user confirmed. */
export async function applyJobConversion(
  tx: QueryExecutor,
  input: ConversionInput,
  expectedFingerprint: string,
  userId: string,
): Promise<ApplyResult> {
  const { rows: locked } = await tx.query(`SELECT 1 FROM jobs WHERE id = $1 FOR UPDATE`, [input.jobId]);
  if (locked.length === 0) throw new ConversionError("JOB_NOT_FOUND", "Job not found.");

  const plan = await dryRunJobConversion(tx, input);
  if (plan.blockers.length > 0)
    throw new ConversionError("BLOCKED", "The conversion has blocking issues.", plan);
  if (plan.fingerprint !== expectedFingerprint)
    throw new ConversionError("STALE_PLAN", "Configuration changed since the preview. Review again.", plan);

  const snapshot = await adoptPipelineForLegacyJob(tx, plan, userId);
  const dataSnapshot = await applyDataPlan(tx, input.jobId, plan.data);
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO legacy_migrations
       (entity_type, entity_id, status, plan, decision, snapshot, confirmed_by, confirmed_at)
     VALUES ($1, $2, 'applied', $3::jsonb, $4::jsonb, $5::jsonb, $6, now())
     RETURNING id::text`,
    [
      ENTITY,
      input.jobId,
      JSON.stringify({ ...plan, repoints: undefined, hiredAtChanges: undefined, counts: counts(plan) }),
      JSON.stringify({
        pipelineId: input.pipelineId,
        pairs: input.pairs,
        probationStageId: input.probationStageId ?? null,
        data: input.data ?? {},
      }),
      JSON.stringify({ ...snapshot, data: dataSnapshot }),
      userId,
    ],
  );
  return { migrationId: rows[0].id, plan };
}

const counts = (p: ConversionPlan) => ({
  repoints: p.repoints.length,
  hiredAtChanges: p.hiredAtChanges.length,
  warnings: p.warnings.length,
});
