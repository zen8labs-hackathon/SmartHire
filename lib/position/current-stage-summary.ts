import type { QueryExecutor } from "@/lib/db/config/client";
import {
  listPipelineStages,
  listPipelineSubStagesForStages,
} from "@/lib/db/pipeline-stages";
import { applicationStoppedSql } from "./application-state";
import {
  resolveCandidatePipelineIds,
  type StageMapping,
} from "@/lib/pipelines/transition-validator";

export type CurrentStageCount = {
  stageMappingId: string;
  label: string;
  color: string | null;
  stageType: string;
  current: number;
};

export type CurrentStageSummary = {
  totalApplications: number;
  stopped: number;
  unassigned: number;
  failed: number;
  stages: CurrentStageCount[];
};

type MappingRow = {
  id: string;
  job_id: string;
  pipeline_stage_id: string;
  sequence_number: number;
  schedule: boolean | null;
  sla_days: number | null;
};

type ApplicationCountRow = {
  job_id: string;
  current_job_stage_mapping_id: string | null;
  current_sub_state_id: string | null;
  stopped: boolean;
  failed: boolean;
  count: string;
};

export async function getCurrentStageSummaries(
  db: QueryExecutor,
  jobIds: readonly string[],
): Promise<Map<string, CurrentStageSummary>> {
  const result = new Map<string, CurrentStageSummary>();
  const ids = [...new Set(jobIds)];

  if (ids.length === 0) return result;

  const library = await listPipelineStages(db);
  const stagesById = new Map(library.map((stage) => [stage.id, stage]));

  const [mappingResult, subStages, applicationResult] =
    await Promise.all([
      db.query<MappingRow>(
        `SELECT id, job_id, pipeline_stage_id,
                sequence_number, schedule, sla_days
         FROM job_stage_mappings
         WHERE job_id = ANY($1::uuid[])
           AND deleted_at IS NULL
         ORDER BY job_id, sequence_number, id`,
        [ids],
      ),

      listPipelineSubStagesForStages(
        db,
        library.map((stage) => stage.id),
      ),

      db.query<ApplicationCountRow>(
        `WITH applications AS (
           SELECT
             ca.job_id,
             ca.current_job_stage_mapping_id,
             ca.current_sub_state_id,

             (
               ${applicationStoppedSql()}
             ) AS stopped,

             (
               ca.jd_match_status = 'failed'
               OR COALESCE(cv.parsing_status = 'failed', false)
             ) AS failed

           FROM campaign_applied ca
           JOIN candidates c
             ON c.id = ca.candidate_id
            AND c.deleted_at IS NULL
           LEFT JOIN cv_detail_versions cv
             ON cv.id = ca.active_cv_version_id
           WHERE ca.job_id = ANY($1::uuid[])
             AND ca.deleted_at IS NULL
         )
         SELECT
           job_id,
           current_job_stage_mapping_id,
           current_sub_state_id,
           stopped,
           failed,
           count(*) AS count
         FROM applications
         GROUP BY
           job_id,
           current_job_stage_mapping_id,
           current_sub_state_id,
           stopped,
           failed`,
        [ids],
      ),
    ]);

  const mappingsByJob = new Map<string, MappingRow[]>();

  for (const mapping of mappingResult.rows) {
    const mappings = mappingsByJob.get(mapping.job_id) ?? [];
    mappings.push(mapping);
    mappingsByJob.set(mapping.job_id, mappings);
  }

  const configs = new Map<string, StageMapping[]>();
  const countersByJob = new Map<
    string,
    Map<string, CurrentStageCount>
  >();

  for (const jobId of ids) {
    const rawMappings = mappingsByJob.get(jobId) ?? [];

    const mappings: StageMapping[] = rawMappings.length
      ? rawMappings.map((mapping) => ({
          ...mapping,
          pipeline_stages:
            stagesById.get(mapping.pipeline_stage_id) ?? null,
        }))
      : library.map((stage, index) => ({
          id: stage.id,
          pipeline_stage_id: stage.id,
          sequence_number: index + 1,
          schedule: null,
          sla_days: null,
          pipeline_stages: stage,
        }));

    configs.set(jobId, mappings);

    const stages: CurrentStageCount[] = mappings.flatMap(
      (mapping) => {
        const stage = mapping.pipeline_stages;
        if (!stage) return [];

        return [{
          stageMappingId: mapping.id,
          label: stage.label,
          color: stage.color,
          stageType: stage.stage_type ?? "none",
          current: 0,
        }];
      },
    );

    result.set(jobId, {
      totalApplications: 0,
      stopped: 0,
      unassigned: 0,
      failed: 0,
      stages,
    });

    countersByJob.set(
      jobId,
      new Map(stages.map((stage) => [
        stage.stageMappingId,
        stage,
      ])),
    );
  }

  for (const row of applicationResult.rows) {
    const summary = result.get(row.job_id);
    if (!summary) continue;

    const count = Number(row.count);
    summary.totalApplications += count;

    if (row.failed) {
     summary.failed += count;
    }

    if (row.stopped) {
      summary.stopped += count;
      continue;
    }

    const mappings = configs.get(row.job_id) ?? [];
    const pipelineStageIds = new Set(
      mappings.map((mapping) => mapping.pipeline_stage_id),
    );
    const jobSubStages = subStages.filter(
      (sub) => pipelineStageIds.has(sub.pipeline_stage_id),
    );

    const resolved = resolveCandidatePipelineIds(
      row,
      mappings,
      jobSubStages,
    );

    const counter = resolved.stageMappingId
      ? countersByJob.get(row.job_id)?.get(resolved.stageMappingId)
      : undefined;

    if (counter) {
      counter.current += count;
    } else {
      summary.unassigned += count;
    }
  }

  return result;
}
