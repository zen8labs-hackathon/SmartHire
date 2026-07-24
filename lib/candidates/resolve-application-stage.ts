import type { QueryExecutor } from "@/lib/db/config/client";
import {
  fetchJobPipelineConfig,
  resolveCandidatePipelineIds,
  type StageMapping,
  type SubStage,
} from "@/lib/pipelines/transition-validator";

type JobPipelineConfig = { stageMappings: StageMapping[]; subStages: SubStage[] };

// Pipeline stage/sub-stage config only changes when an admin edits a job's
// pipeline (rare); caching it briefly avoids re-running fetchJobPipelineConfig's
// 3 queries for every distinct job on every applications-list/drawer load.
// Caches the in-flight promise (not the resolved value) so concurrent
// requests for the same job share one fetch instead of racing duplicates,
// and a failed fetch doesn't poison the cache for the next request.
const JOB_PIPELINE_CONFIG_TTL_MS = 60_000;
const jobPipelineConfigCache = new Map<
  string,
  { expiresAt: number; config: Promise<JobPipelineConfig> }
>();

function getCachedJobPipelineConfig(
  db: QueryExecutor,
  jobId: string,
): Promise<JobPipelineConfig> {
  const cached = jobPipelineConfigCache.get(jobId);
  if (cached && cached.expiresAt > Date.now()) return cached.config;

  const config = fetchJobPipelineConfig(db, jobId);
  jobPipelineConfigCache.set(jobId, {
    expiresAt: Date.now() + JOB_PIPELINE_CONFIG_TTL_MS,
    config,
  });
  config.catch(() => jobPipelineConfigCache.delete(jobId));
  return config;
}

/** Test-only: clears the module-level cache so each test starts from a
 * known state instead of inheriting entries from a previous test/import. */
export function __resetJobPipelineConfigCacheForTests(): void {
  jobPipelineConfigCache.clear();
}

export type ResolvedApplicationStage = {
  stageLabel: string | null;
  stageColor: string | null;
  subStageCode: string | null;
  subStageLabel: string | null;
  subStageIsPassed: boolean | null;
};

/**
 * A brand-new application (or one whose stage/sub-stage was soft-deleted)
 * has `current_job_stage_mapping_id`/`current_sub_state_id` as `NULL` until
 * it's explicitly moved. Resolve the same fallback the job-pipeline table
 * and evaluation page already use (the job's first stage, default
 * sub-stage) instead of trusting those possibly-NULL columns, so a
 * just-uploaded CV shows e.g. "CV Scan · New" rather than "Not started".
 */
function resolveOne(
  row: {
    current_job_stage_mapping_id: string | null;
    current_sub_state_id: string | null;
  },
  stageMappings: StageMapping[],
  subStages: SubStage[],
): ResolvedApplicationStage {
  const { stageMappingId, subStateId } = resolveCandidatePipelineIds(
    row,
    stageMappings,
    subStages,
  );
  const stageMapping = stageMappings.find((sm) => sm.id === stageMappingId);
  const subStage = subStages.find((ss) => ss.id === subStateId);
  return {
    stageLabel: stageMapping?.pipeline_stages?.label ?? null,
    stageColor: stageMapping?.pipeline_stages?.color ?? null,
    subStageCode: subStage?.code ?? null,
    subStageLabel: subStage?.label ?? null,
    subStageIsPassed: subStage?.is_passed ?? null,
  };
}

type ApplicationStageRow = {
  job_id: string;
  current_job_stage_mapping_id: string | null;
  current_sub_state_id: string | null;
};

/**
 * Resolves the current pipeline position for a batch of applications,
 * fetching each distinct job's pipeline config only once. Shared by the
 * candidate-detail page's per-application list and the `/candidates`
 * dashboard drawer's "Other applications" panel.
 */
export async function resolveApplicationStages<T extends ApplicationStageRow>(
  db: QueryExecutor,
  rows: T[],
): Promise<Map<T, ResolvedApplicationStage>> {
  const configByJobId = new Map(
    await Promise.all(
      [...new Set(rows.map((row) => row.job_id))].map(
        async (jobId) =>
          [jobId, await getCachedJobPipelineConfig(db, jobId)] as const,
      ),
    ),
  );

  return new Map(
    rows.map((row) => {
      const config = configByJobId.get(row.job_id);
      const resolved = config
        ? resolveOne(row, config.stageMappings, config.subStages)
        : {
            stageLabel: null,
            stageColor: null,
            subStageCode: null,
            subStageLabel: null,
            subStageIsPassed: null,
          };
      return [row, resolved] as const;
    }),
  );
}
